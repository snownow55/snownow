import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { deletionConfiguration, DeletionDependencies } from "./account-deletion";

export function accountDeletionClients(config: NonNullable<ReturnType<typeof deletionConfiguration>>) {
  const diagnosticId = crypto.randomUUID();
  function diagnostic(stage: string, outcome: string, error?: unknown) {
    const e = error && typeof error === "object" ? error as Record<string, unknown> : {};
    const codes = ["bad_jwt", "not_admin", "unexpected_failure", "user_not_found", "session_not_found", "request_timeout"];
    console.info("ACCOUNT_DELETION_DIAGNOSTIC", JSON.stringify({
      diagnostic_id: diagnosticId, stage, outcome,
      code: typeof e.code === "string" && codes.includes(e.code) ? e.code : e.code ? "other" : null,
      status: typeof e.status === "number" && Number.isInteger(e.status) && e.status >= 100 && e.status <= 599 ? e.status : null,
      timeout: e.name === "TimeoutError" || e.name === "AbortError",
    }));
  }
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, {
      ...init, signal: AbortSignal.timeout(15_000), redirect: "error",
    }) },
  };
  // Reauthentication is isolated from the browser's existing session.
  const reauth = createClient(config.url, config.publicKey, options);
  const admin = createClient(config.url, config.serviceKey, options);
  const dependencies: DeletionDependencies = {
    async reauthenticate(email, password) {
      const { data, error } = await reauth.auth.signInWithPassword({ email, password });
      return error ? null : data.user;
    },
    async deleteAuthUser(id) {
      try {
        const { error } = await admin.auth.admin.deleteUser(id, false);
        diagnostic("delete", error ? "error" : "accepted", error);
        return !error;
      } catch (error) { diagnostic("delete", "exception", error); throw error; }
    },
    async deletionStatus(id) {
      try {
      const { data, error } = await admin.auth.admin.getUserById(id);
      const outcome = error?.code === "user_not_found" ? "deleted"
        : !error && data.user?.id === id ? "present" : "unknown";
      diagnostic("verify", outcome, error);
      return outcome;
      } catch (error) { diagnostic("verify", "exception", error); throw error; }
    },
  };
  return { dependencies, diagnosticId, async dispose() {
    // Only the temporary server-side session; never global sign-out on failure.
    await reauth.auth.signOut({ scope: "local" }).catch(() => {});
  } };
}
