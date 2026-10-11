import { serverSupabase } from "@/lib/supabase-server";
import { canPost } from "@/lib/auth-policy";
import { siteOrigin } from "@/lib/site-origin";
import { validPost } from "@/lib/post-validation";
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

export async function POST(request: Request) {
  // Cookie-authenticated writes must originate from this site.
  const origin = siteOrigin(request.url);
  if (!origin || request.headers.get("origin") !== origin)
    return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = await serverSupabase();
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
  if (!validPost(post))
    return Response.json({ error: "Invalid post" }, { status: 400 });
  try {
    const resort = await findResort(client, post.resort);
    if (!resort?.is_active)
      return Response.json({ error: "Resort unavailable" }, { status: 400 });
  } catch {
    return Response.json({ error: "Resort information unavailable" }, { status: 503 });
  }
  // Uses the user's JWT and publishable key; existing RLS remains in force.
  // The database supplies user_id; new posts never carry a star rating.
  const { error: insertError } = await client.from("snow_posts").insert({ ...post, condition: null });
  if (insertError)
    return Response.json({ error: "Post failed" }, { status: 400 });
  return Response.json({ ok: true }, { status: 201 });
}
