import { isAllowedPostOrigin } from "./site-origin.ts";

type Environment = Readonly<Record<string, string | undefined>>;
const apiPaths = new Set(["/api/posts", "/api/posts/manage", "/api/account/delete"]);
export function nativeApiOrigin(request: Request, env: Environment = process.env): string | null {
  if (env.NATIVE_APP_API_ENABLED !== "true" || !apiPaths.has(new URL(request.url).pathname)) return null;
  const origin = request.headers.get("origin");
  if (origin === "capacitor://localhost") return origin;
  if (env.NODE_ENV === "development" && origin === "http://localhost:5173") return origin;
  return null;
}
export function nativeBearer(request: Request, env: Environment = process.env): string | null {
  if (!nativeApiOrigin(request, env)) return null;
  const value = request.headers.get("authorization");
  return value && /^Bearer [A-Za-z0-9._~-]{1,8192}$/.test(value) ? value.slice(7) : null;
}
export function isAllowedApiOrigin(request: Request): boolean {
  return nativeBearer(request) !== null || isAllowedPostOrigin(request.url, request.headers.get("origin"));
}
function corsHeaders(request: Request): Record<string, string> {
  const origin = nativeApiOrigin(request);
  return origin ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin", "Cache-Control": "no-store" } : {};
}
export async function withNativeCors(request: Request, handler: (request: Request) => Promise<Response>): Promise<Response> {
  const response = await handler(request);
  for (const [name, value] of Object.entries(corsHeaders(request))) {
    if (name === "Vary") response.headers.append(name, value);
    else response.headers.set(name, value);
  }
  return response;
}
export function nativeApiOptions(request: Request): Response {
  const headers = (request.headers.get("access-control-request-headers") ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const method = request.headers.get("access-control-request-method") ?? "";
  if (!nativeApiOrigin(request) || !["GET", "POST", "PATCH", "DELETE"].includes(method)
    || headers.some(h => !["authorization", "content-type"].includes(h))) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: { ...corsHeaders(request),
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE", "Access-Control-Allow-Headers": "Authorization, Content-Type" } });
}
