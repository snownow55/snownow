import { serverSupabase } from "@/lib/supabase-server";
import { canPost } from "@/lib/auth-policy";
import { siteOrigin } from "@/lib/site-origin";
import { validPost } from "@/lib/post-validation";
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
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return Response.json({ error: "JSON required" }, { status: 415 });
  const body = await request.text();
  if (body.length > 16000)
    return Response.json({ error: "Payload too large" }, { status: 413 });
  let post: unknown;
  try {
    post = JSON.parse(body);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!validPost(post))
    return Response.json({ error: "Invalid post" }, { status: 400 });
  // Uses the user's JWT and publishable key; existing RLS remains in force.
  // Preserve the existing table shape: no user_id column is assumed.
  const { error: insertError } = await client.from("snow_posts").insert(post);
  if (insertError)
    return Response.json({ error: "Post failed" }, { status: 400 });
  return Response.json({ ok: true }, { status: 201 });
}
