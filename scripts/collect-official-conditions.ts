import { createClient } from "@supabase/supabase-js";
import { collectOfficialConditions, createCollectionStore, parseSourceApprovals } from "../lib/official-collector.ts";

async function main() {
  const approvals = parseSourceApprovals(process.env.OFFICIAL_APPROVED_SOURCES ?? "");
  const endpoint = process.env.OFFICIAL_SUPABASE_URL;
  const key = process.env.OFFICIAL_SUPABASE_SERVICE_KEY;
  if (!endpoint || !key) throw new Error("Collector database configuration is required.");
  const database = new URL(endpoint);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(database.hostname);
  if (database.username || database.password || database.search || database.hash
    || database.pathname !== "/" || (database.protocol !== "https:" && !(loopback && database.protocol === "http:"))) {
    throw new Error("Invalid collector database origin.");
  }
  const client = createClient(database.origin, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => {
        const timeout = AbortSignal.timeout(10_000);
        const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
        return fetch(input, { ...init, signal, redirect: "error" });
      },
    },
  });
  const results = await collectOfficialConditions(approvals, createCollectionStore(client));
  console.log(JSON.stringify(results));
  if (results.some(entry => entry.failure || entry.result === "database_error")) process.exitCode = 1;
}

main().catch(() => {
  console.error("Official collection could not start. Check the database and explicit source configuration.");
  process.exitCode = 1;
});
