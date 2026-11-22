import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const productionOrigin = "https://rtgqyctqjfoercdymssd.supabase.co";
const sourceUrl = "https://www.sapporo-kokusai.jp/";
type Environment = Readonly<Record<string, string | undefined>>;

export function validateProductionConfiguration(env: Environment) {
  if (env.OFFICIAL_SUPABASE_URL !== productionOrigin
    && env.OFFICIAL_SUPABASE_URL !== productionOrigin + "/") {
    throw new Error("PRODUCTION_PROJECT_MISMATCH");
  }
  let approvals: unknown;
  try { approvals = JSON.parse(env.OFFICIAL_APPROVED_SOURCES ?? ""); }
  catch { throw new Error("SINGLE_SOURCE_CONFIGURATION_REQUIRED"); }
  if (approvals === null || typeof approvals !== "object" || Array.isArray(approvals)
    || Object.keys(approvals).length !== 1
    || (approvals as Record<string, unknown>)["1"] !== sourceUrl) {
    throw new Error("SINGLE_SOURCE_CONFIGURATION_REQUIRED");
  }
  if (!env.OFFICIAL_SUPABASE_SERVICE_KEY?.trim()) {
    throw new Error("SERVER_CREDENTIAL_REQUIRED");
  }
}

export function validateKokusaiSource(value: unknown) {
  const source = value as Record<string, unknown> | null;
  if (!source || source.id !== 1 || !Number.isSafeInteger(source.resort_id)
    || Number(source.resort_id) <= 0 || source.resort_name !== "札幌国際スキー場"
    || source.source_url !== sourceUrl || source.adapter_key !== "sapporo-kokusai-html"
    || source.enabled !== true || source.access_permission !== "allowed"
    || source.publication_permission !== "allowed") {
    throw new Error("PRODUCTION_SOURCE_MISMATCH");
  }
}

export function validateSingleCollectionResult(value: unknown) {
  if (!Array.isArray(value) || value.length !== 1 || value[0]?.id !== 1
    || !["saved", "duplicate"].includes(value[0]?.result) || value[0]?.failure) {
    throw new Error("SINGLE_COLLECTION_NOT_SAVED");
  }
}

export async function runProductionPreflight(
  env: Environment,
  loadSource: () => Promise<unknown> = async () => {
    const client = createClient(productionOrigin, env.OFFICIAL_SUPABASE_SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, {
        ...init, signal: AbortSignal.timeout(10_000), redirect: "error",
      }) },
    });
    const { data, error } = await client.rpc("get_official_collection_source", { p_source_id: 1 });
    if (error) throw new Error("PRODUCTION_SOURCE_READ_FAILED");
    return data;
  },
) {
  validateProductionConfiguration(env);
  validateKokusaiSource(await loadSource());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runProductionPreflight(process.env).then(
    () => console.log("KOKUSAI_PRODUCTION_PREFLIGHT_PASSED"),
    () => {
      // Never print SDK errors, request headers, credentials or source notes.
      console.error("Production preflight failed. Check project, credentials and source 1 configuration.");
      process.exitCode = 1;
    },
  );
}
