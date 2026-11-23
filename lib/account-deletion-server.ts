import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { deletionConfiguration, DeletionDependencies } from "./account-deletion";

export function accountDeletionClients(config: NonNullable<ReturnType<typeof deletionConfiguration>>) {
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
      const { error } = await admin.auth.admin.deleteUser(id, false);
      return !error;
    },
    async deletionStatus(id) {
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error?.code === "user_not_found") return "deleted";
      return !error && data.user?.id === id ? "present" : "unknown";
    },
  };
  return { dependencies, async dispose() {
    // Only the temporary server-side session; never global sign-out on failure.
    await reauth.auth.signOut({ scope: "local" }).catch(() => {});
  } };
}
