import { serverSupabase } from "@/lib/supabase-server";
import { canPost } from "@/lib/auth-policy";
import { isAllowedApiOrigin, nativeApiOptions, withNativeCors } from "@/lib/native-api";
import { postingStatus } from "@/lib/posting-limit";
import { transitionalPost, validPost } from "@/lib/app-post-validation";
import { findResort } from "@/lib/resort-master";

// Bound the actual UTF-8 bytes while reading, without trusting Content-Length.
async function readPostBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return body + decoder.decode();
      size += value.byteLength;
      if (size > 16000) {
        void reader.cancel().catch(() => {});
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

async function post(request: Request) {
  // Cookie-authenticated writes must originate from this site.
  if (!isAllowedApiOrigin(request))
    return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = await serverSupabase(request);
  if (!client)
    return Response.json(
      { error: "Authentication unavailable" },
      { status: 503 },
    );
  const { data, error } = await client.auth.getUser();
  if (error || !data.user)
    return Response.json({ error: "Authentication required" }, { status: 401 });
  if (!canPost(data.user))
    return Response.json(
      { error: "Email verification required" },
      { status: 403 },
    );
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json")
    return Response.json({ error: "JSON required" }, { status: 415 });
  let post: unknown;
  try {
    const body = await readPostBody(request);
    if (body === null)
      return Response.json({ error: "Payload too large" }, { status: 413 });
    post = JSON.parse(body);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  post = transitionalPost(post, process.env.SNOW_LEGACY_POSTS_UNTIL);
  if (!validPost(post))
    return Response.json({ error: "Invalid post" }, { status: 400 });
  try {
    const resort = await findResort(client, post.resort);
    if (!resort?.is_active)
      return Response.json({ error: "Resort unavailable" }, { status: 400 });
  } catch {
    return Response.json({ error: "Resort information unavailable" }, { status: 503 });
  }
  const { data: result, error: rpcError } = await client.rpc("submit_snow_post", { payload: post });
  if (rpcError) {
    if (rpcError.code === "22023" || rpcError.code === "23514") return Response.json({ error: "Invalid post" }, { status: 400 });
    if (rpcError.code === "42501") return Response.json({ error: "Posting forbidden" }, { status: 403 });
    return Response.json({ error: "Post failed" }, { status: 503 });
  }
  const status = postingStatus(result);
  if (!status) return Response.json({ error: "Post failed" }, { status: 503 });
  if (!status.allowed) return Response.json({ error: "Post rate limited", ...status }, {
    status: 429, headers: { "Retry-After": String(status.retryAfterSeconds), "Cache-Control": "no-store" },
  });
  return Response.json({ ok: true, ...status }, { status: 201 });
}

// Only the authenticated user's own posting window; never cache across users.
async function get(request: Request) {
  const client = await serverSupabase(request);
  if (!client) return Response.json({ error: "Authentication unavailable" }, { status: 503 });
  const { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user) return Response.json({ error: "Authentication required" }, { status: 401 });
  if (!canPost(auth.user)) return Response.json({ error: "Email verification required" }, { status: 403 });
  const { data, error: rpcError } = await client.rpc("posting_status");
  const status = rpcError ? null : postingStatus(data);
  return status ? Response.json(status, { headers: { "Cache-Control": "no-store" } })
    : Response.json({ error: "Posting status unavailable" }, { status: 503 });
}

export const POST = (request: Request) => withNativeCors(request, post);
export const GET = (request: Request) => withNativeCors(request, get);
export const OPTIONS = nativeApiOptions;
