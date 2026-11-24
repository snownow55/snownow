import { usageDay, validUsageBatch, type UsageEvent } from "./usage-analytics.ts";
export async function receiveUsage(request: Request, enabled: boolean, store: (events: UsageEvent[]) => Promise<boolean>, now = Date.now()) {
  const reply = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });
  if (!enabled) return reply(204);
  const origin = request.headers.get("origin");
  if (origin !== "https://snowviking.jp" || new URL(request.url).origin !== origin) return reply(403);
  const site = request.headers.get("sec-fetch-site"); if (site && site !== "same-origin") return reply(403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return reply(415);
  const reader = request.body?.getReader(); if (!reader) return reply(400);
  try {
    let length = 0; const chunks: Uint8Array[] = [];
    for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.byteLength;
      if (length > 4096) { await reader.cancel(); return reply(413); } chunks.push(value); }
    const body = new Uint8Array(length); let offset = 0; for (const c of chunks) { body.set(c, offset); offset += c.length; }
    const events: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
    if (!validUsageBatch(events, usageDay(now))) return reply(400);
    // Cookies/Authorization are never used, forwarded, or logged by this endpoint.
    return reply(await store(events) ? 204 : 503);
  } catch { return reply(400); } finally { reader.releaseLock(); }
}
