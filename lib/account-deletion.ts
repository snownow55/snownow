export const DELETE_CONFIRMATION = "DELETE_MY_ACCOUNT";
export const CONTACT_EMAIL = "nowviking.official@gmail.com";
type Environment = Readonly<Record<string, string | undefined>>;
export type DeletionActor = { id: string; email?: string; is_anonymous?: boolean };
export type DeletionInput = { password: string; confirmation: typeof DELETE_CONFIRMATION };

export function deletionConfiguration(env: Environment) {
  if (env.ACCOUNT_DELETION_ENABLED !== "true") return null;
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = env.ACCOUNT_DELETION_SUPABASE_SERVICE_KEY;
  if (!url || !publicKey || !serviceKey) return null;
  try {
    const origin = new URL(url);
    if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") return null;
    const expected = env.VERCEL_ENV === "production"
      ? "https://rtgqyctqjfoercdymssd.supabase.co"
      : "https://viidjrhaoxcvunbfdbni.supabase.co";
    const local = env.NODE_ENV !== "production" && env.VERCEL !== "1"
      && origin.protocol === "http:" && ["127.0.0.1", "localhost"].includes(origin.hostname);
    if (origin.origin !== expected && !local) return null;
    return { url: origin.origin, publicKey, serviceKey,
      cookieName: `sb-${origin.hostname.split(".")[0]}-auth-token` };
  } catch { return null; }
}

export function validDeletionInput(value: unknown): value is DeletionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return Object.keys(input).length === 2 && input.confirmation === DELETE_CONFIRMATION
    && typeof input.password === "string" && input.password.length >= 1 && input.password.length <= 128;
}

export type DeletionDependencies = {
  reauthenticate(email: string, password: string): Promise<DeletionActor | null>;
  deleteAuthUser(id: string): Promise<boolean>;
  deletionStatus(id: string): Promise<"deleted" | "present" | "unknown">;
};

export async function deleteOwnAccount(
  actor: DeletionActor | null, input: unknown, dependencies: DeletionDependencies,
): Promise<"deleted" | "unauthorized" | "invalid" | "reauthentication_failed" | "unconfirmed"> {
  if (!actor?.email || actor.is_anonymous || !/^[0-9a-f-]{36}$/i.test(actor.id)) return "unauthorized";
  if (!validDeletionInput(input)) return "invalid";
  let verified: DeletionActor | null;
  try { verified = await dependencies.reauthenticate(actor.email, input.password); }
  catch { return "reauthentication_failed"; }
  if (!verified || verified.id !== actor.id || verified.is_anonymous) return "reauthentication_failed";
  try {
    if (await dependencies.deleteAuthUser(actor.id)) return "deleted";
  } catch { /* A lost response does not prove that the transaction failed. */ }
  try {
    return await dependencies.deletionStatus(actor.id) === "deleted" ? "deleted" : "unconfirmed";
  } catch { return "unconfirmed"; }
}

export function isAccountCookie(name: string, cookieName: string) {
  return [cookieName, cookieName + "-code-verifier"].some(prefix =>
    name === prefix || (name.startsWith(prefix + ".") && /^\d+$/.test(name.slice(prefix.length + 1))));
}
