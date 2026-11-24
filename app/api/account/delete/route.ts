import { cookies } from "next/headers";
import { serverSupabase } from "@/lib/supabase-server";
import { isAllowedApiOrigin, nativeApiOptions, withNativeCors, nativeBearer } from "@/lib/native-api";
import { deletionConfiguration, deleteOwnAccount, isAccountCookie } from "@/lib/account-deletion";
import { accountDeletionClients } from "@/lib/account-deletion-server";

const reply = (body: object, status: number) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
});

async function post(request: Request) {
  if (!isAllowedApiOrigin(request)) return reply({ error: "Forbidden" }, 403);
  const config = deletionConfiguration(process.env);
  if (!config) return reply({ error: "Account deletion is unavailable" }, 503);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return reply({ error: "JSON required" }, 415);
  }
  const client = await serverSupabase(request);
  const actor = client ? (await client.auth.getUser()).data.user : null;
  if (!actor || actor.is_anonymous) return reply({ error: "Authentication required" }, 401);
  let input: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "Invalid confirmation" }, 400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 4096) { await reader.cancel(); return reply({ error: "Too large" }, 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch { return reply({ error: "Invalid confirmation" }, 400); }

  const clients = accountDeletionClients(config);
  const result = await deleteOwnAccount(actor, input, clients.dependencies);
  await clients.dispose();
  if (result === "unauthorized") return reply({ error: "Authentication required" }, 401);
  if (result === "invalid") return reply({ error: "Invalid confirmation" }, 400);
  if (result === "reauthentication_failed") return reply({ error: "Reauthentication failed" }, 403);
  if (result !== "deleted") {
    // No provider error, password, email or Authorization header is logged.
    console.error("ACCOUNT_DELETION_RESULT_UNCONFIRMED");
    return reply({ error: "Deletion result unconfirmed", code: "DELETION_UNCONFIRMED" }, 503);
  }
  if (!nativeBearer(request)) {
    const store = await cookies();
    for (const cookie of store.getAll()) {
      if (isAccountCookie(cookie.name, config.cookieName)) store.delete(cookie.name);
    }
  }
  return reply({ ok: true }, 200);
}

export const POST = (request: Request) => withNativeCors(request, post);
export const OPTIONS = nativeApiOptions;
