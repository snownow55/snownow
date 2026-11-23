import test from "node:test";
import assert from "node:assert/strict";
import { deleteOwnAccount, validDeletionInput, deletionConfiguration, isAccountCookie,
  DELETE_CONFIRMATION, type DeletionDependencies } from "../lib/account-deletion.ts";

const actor = { id: "11111111-1111-4111-8111-111111111111", email: "a@example.test" };
const other = { id: "22222222-2222-4222-8222-222222222222", email: "b@example.test" };
const input = { password: "synthetic-password", confirmation: DELETE_CONFIRMATION };
const configuration = { ACCOUNT_DELETION_ENABLED: "true", NEXT_PUBLIC_SUPABASE_URL: "https://viidjrhaoxcvunbfdbni.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-public-key", ACCOUNT_DELETION_SUPABASE_SERVICE_KEY: "synthetic-private-key" };
function dependencies(reauth = actor) {
  const deleted: string[] = [];
  const deps: DeletionDependencies = {
    reauthenticate: async email => { assert.equal(email, actor.email); return reauth; },
    deleteAuthUser: async id => { deleted.push(id); return true; },
    deletionStatus: async () => "present",
  };
  return { deps, deleted };
}

test("only the server-verified actor can be deleted after immediate reauthentication", async () => {
  const { deps, deleted } = dependencies();
  assert.equal(await deleteOwnAccount(actor, input, deps), "deleted");
  assert.deepEqual(deleted, [actor.id]);
  const wrong = dependencies(other);
  assert.equal(await deleteOwnAccount(actor, input, wrong.deps), "reauthentication_failed");
  assert.deepEqual(wrong.deleted, []);
});

test("unauthenticated, anonymous and unconfirmed requests cannot invoke deletion", async () => {
  const { deps, deleted } = dependencies();
  for (const user of [null, { ...actor, is_anonymous: true }, { ...actor, email: undefined }]) {
    assert.equal(await deleteOwnAccount(user, input, deps), "unauthorized");
  }
  for (const body of [null, {}, { ...input, confirmation: "" }, { ...input, user_id: other.id },
    { ...input, email: other.email }, { ...input, password: "" }, { ...input, password: "x".repeat(129) }]) {
    assert.equal(validDeletionInput(body), false);
    assert.equal(await deleteOwnAccount(actor, body, deps), "invalid");
  }
  assert.deepEqual(deleted, []);
});

test("failed password verification never calls the privileged delete API", async () => {
  const { deps, deleted } = dependencies();
  deps.reauthenticate = async () => null;
  assert.equal(await deleteOwnAccount(actor, input, deps), "reauthentication_failed");
  deps.reauthenticate = async () => { throw new Error("synthetic upstream failure"); };
  assert.equal(await deleteOwnAccount(actor, input, deps), "reauthentication_failed");
  assert.deepEqual(deleted, []);
});

test("lost deletion responses require a privileged absence check, never blind success or retry", async () => {
  for (const status of ["present", "unknown", "deleted"] as const) {
    const { deps, deleted } = dependencies();
    deps.deleteAuthUser = async id => { deleted.push(id); throw new Error("synthetic timeout"); };
    deps.deletionStatus = async id => { assert.equal(id, actor.id); return status; };
    assert.equal(await deleteOwnAccount(actor, input, deps), status === "deleted" ? "deleted" : "unconfirmed");
    assert.equal(deleted.length, 1);
  }
});

test("the feature is off by default and production is refused in development and Preview", () => {
  assert.equal(deletionConfiguration({}), null);
  assert.ok(deletionConfiguration(configuration));
  const prod = { ...configuration, NEXT_PUBLIC_SUPABASE_URL: "https://rtgqyctqjfoercdymssd.supabase.co" };
  assert.equal(deletionConfiguration(prod), null);
  assert.equal(deletionConfiguration({ ...prod, VERCEL: "1", VERCEL_ENV: "preview" }), null);
  assert.ok(deletionConfiguration({ ...prod, VERCEL: "1", VERCEL_ENV: "production" }));
  assert.equal(deletionConfiguration({ ...configuration, VERCEL_ENV: "production" }), null);
  assert.equal(deletionConfiguration({ ...configuration, NEXT_PUBLIC_SUPABASE_URL: configuration.NEXT_PUBLIC_SUPABASE_URL + "?x=1" }), null);
  const local = { ...configuration, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55331" };
  assert.ok(deletionConfiguration(local));
  assert.equal(deletionConfiguration({ ...local, NODE_ENV: "production" }), null);
});

test("concurrent confirmed requests accept an already completed deletion only after absence is verified", async () => {
  const { deps } = dependencies();
  let attempts = 0;
  deps.deleteAuthUser = async id => { assert.equal(id, actor.id); return ++attempts === 1; };
  deps.deletionStatus = async id => { assert.equal(id, actor.id); return "deleted"; };
  assert.deepEqual(await Promise.all([deleteOwnAccount(actor, input, deps), deleteOwnAccount(actor, input, deps)]),
    ["deleted", "deleted"]);
});

test("session cleanup removes only this project's auth and verifier cookie chunks", () => {
  for (const name of ["sb-test-auth-token", "sb-test-auth-token.0", "sb-test-auth-token-code-verifier.1"]) {
    assert.equal(isAccountCookie(name, "sb-test-auth-token"), true);
  }
  for (const name of ["other", "sb-other-auth-token", "sb-test-auth-token-something", "sb-test-auth-token.malicious"]) {
    assert.equal(isAccountCookie(name, "sb-test-auth-token"), false);
  }
});
