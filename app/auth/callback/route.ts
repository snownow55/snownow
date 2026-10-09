import { NextResponse } from "next/server";
import { serverSupabase } from "@/lib/supabase-server";
import { siteOrigin } from "@/lib/site-origin";
import { safeNext } from "@/lib/auth-policy";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = siteOrigin(request.url);
  if (!origin)
    return Response.json(
      { error: "Site URL is not configured" },
      { status: 503 },
    );
  const client = await serverSupabase();
  const code = url.searchParams.get("code");
  const token = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  let ok = false;
  if (client && token && (type === "signup" || type === "recovery")) {
    const { error } = await client.auth.verifyOtp({ token_hash: token, type });
    ok = !error;
  } else if (
    client &&
    code &&
    (!type || type === "signup" || type === "recovery")
  ) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    ok = !error;
  }
  const destination = ok
    ? type === "recovery"
      ? "/reset-password"
      : safeNext(url.searchParams.get("next"))
    : "/login?error=callback";
  const response = NextResponse.redirect(new URL(destination, origin));
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
