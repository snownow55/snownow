import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext, canPost } from "../lib/auth-policy.ts";
import { siteOrigin, isAllowedPostOrigin } from "../lib/site-origin.ts";
import { validPost } from "../lib/post-validation.ts";
import { createClient } from "@supabase/supabase-js";
import { loadResortMaster, findResort, postUrl, regionUrl } from "../lib/resort-master.ts";
test("callback rejects external, protocol-relative and control-character destinations", () => {
  for (const path of [
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/\nevil.test",
    "/auth/callback",
    "/reset-password",
    "/%2f%2fevil.test",
    "/%5cevil.test",
    null,
  ])
    assert.equal(safeNext(path), "/");
  assert.equal(
    safeNext("/post?resort=%E3%82%AD%E3%83%AD%E3%83%AD"),
    "/post?resort=%E3%82%AD%E3%83%AD%E3%83%AD",
  );
});
test("posting requires verified non-anonymous user", () => {
  for (const user of [
    null,
    {},
    { email_confirmed_at: "" },
    { email_confirmed_at: "2026-01-01", is_anonymous: true },
  ])
    assert.equal(canPost(user), false);
  assert.equal(
    canPost({ email_confirmed_at: "2026-01-01", is_anonymous: false }),
    true,
  );
});
const post = {
  resort: "オーンズ",
  area: "山頂・上部",
  snow_type: "パウダー",
  snowfall: "ほぼ無し",
  roughness: "きれい",
  crowd: "空いている",
  condition: null,
  comment: "",
};
test("post validation preserves choices and rejects tampering", () => {
  assert.equal(validPost(post), true);
  for (const invalid of [
    null,
    [],
    {},
    { ...post, resort: "" },
    { ...post, resort: " " },
    { ...post, resort: 123 },
    { ...post, resort: "a".repeat(201) },
    { ...post, comment: "a".repeat(1001) },
    { ...post, user_id: "other-user" },
    { ...post, created_at: "2100-01-01" },
  ])
    assert.equal(validPost(invalid), false);
});

test("new posts allow an omitted or null rating, reject ratings, and still require every other field", () => {
  const withoutRating = Object.fromEntries(Object.entries(post).filter(([key]) => key !== "condition"));
  assert.equal(validPost(withoutRating), true);
  assert.equal(validPost(post), true);
  for (const condition of ["★★★★★", "★★★★☆", "", 0, false, {}, [], undefined]) {
    assert.equal(validPost({ ...withoutRating, condition }), false);
  }
  for (const field of Object.keys(withoutRating)) {
    const missingField = Object.fromEntries(Object.entries(withoutRating).filter(([key]) => key !== field));
    assert.equal(validPost(missingField), false);
  }
});

test("post shape accepts master names; DB membership is checked separately by the API", () => {
  for (const resort of ["オーンズ", "キロロ", "さっぽろばんけい", "Fu'sスノーエリア", "国設阿寒湖畔スキー場 ウタラ"]) {
    assert.equal(validPost({ ...post, resort }), true);
  }
  for (const field of ["area", "snow_type", "snowfall", "roughness", "crowd", "condition"]) {
    assert.equal(validPost({ ...post, [field]: "不正な選択値" }), false);
  }
  assert.equal(validPost({ ...post, region_code: "sapporo" }), false);
  assert.equal(validPost({ ...post, display_name: "スノークルーズオーンズ" }), false);
});

const masterRegion = { code: "sapporo", name: "札幌近郊", sort_order: 1 };
const masterResort = { id: 1, name: "オーンズ", display_name: "スノークルーズオーンズ",
  region_code: "sapporo", sort_order: 6, is_active: true };
function masterClient(regions: unknown, resorts: unknown, fail = false) {
  return createClient("http://127.0.0.1:54321", "sb_publishable_unit_fixture_only", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input) => {
      const url = new URL(String(input));
      let rows = url.pathname.endsWith("regions") ? regions : resorts;
      const name = url.searchParams.get("name")?.slice(3);
      if (name && Array.isArray(rows)) rows = rows.filter((row) => row.name === name);
      return new Response(JSON.stringify(fail ? { message: "fixture failure" } : rows), {
        status: fail ? 403 : 200, headers: { "Content-Type": "application/json" },
      });
    } },
  });
}
test("master lookup preserves canonical names and inactive state without writing", async () => {
  const client = masterClient([masterRegion], [masterResort]);
  const master = await loadResortMaster(client);
  assert.equal(master.resorts[0].name, "オーンズ");
  assert.equal(master.resorts[0].display_name, "スノークルーズオーンズ");
  assert.equal(await findResort(client, "スノークルーズオーンズ"), null);
  assert.equal(await findResort(client, "未登録"), null);
  const inactive = await findResort(masterClient([masterRegion], [{ ...masterResort, is_active: false }]), "オーンズ");
  assert.equal(inactive?.is_active, false);
});
test("missing, partial, malformed, and inconsistent masters fail closed", async () => {
  await assert.rejects(() => loadResortMaster(null));
  for (const [regions, resorts] of [
    [[], [masterResort]], [[masterRegion], []], [null, [masterResort]],
    [[masterRegion], [{ ...masterResort, is_active: undefined }]],
    [[masterRegion], [{ ...masterResort, region_code: "unknown" }]],
    [[masterRegion, masterRegion], [masterResort]],
    [[masterRegion], [masterResort, masterResort]],
  ]) await assert.rejects(() => loadResortMaster(masterClient(regions, resorts)));
  await assert.rejects(() => loadResortMaster(masterClient([masterRegion], [masterResort], true)));
  await assert.rejects(() => findResort(masterClient([masterRegion], [masterResort], true), "オーンズ"));
});
test("master URLs retain region and internal names through safe authentication redirects", () => {
  for (const name of ["オーンズ", "キロロ", "Fu'sスノーエリア", "国設阿寒湖畔スキー場 ウタラ"]) {
    const path = postUrl(name, "sapporo");
    const url = new URL(safeNext(path), "https://snow.invalid");
    assert.equal(url.searchParams.get("resort"), name);
    assert.equal(url.searchParams.get("region"), "sapporo");
  }
  assert.equal(postUrl(), "/post");
  assert.equal(regionUrl("doto"), "/?region=doto");
});

test("detail post URLs preserve their UI mode and internal name through login", () => {
  for (const name of ["オーンズ", "キロロ", "Fu'sスノーエリア", "国設阿寒湖畔スキー場 ウタラ"]) {
    const path = postUrl(name, "sapporo", "detail");
    const url = new URL(safeNext(path), "https://snow.invalid");
    assert.equal(url.pathname, "/post");
    assert.equal(url.searchParams.get("resort"), name);
    assert.equal(url.searchParams.get("region"), "sapporo");
    assert.equal(url.searchParams.get("from"), "detail");
    assert.equal(new URL(postUrl(name, "sapporo"), url.origin).searchParams.has("from"), false);
  }
  assert.equal(postUrl(), "/post");
  const emptySelection = new URL(safeNext(postUrl("", "", "detail")), "https://snow.invalid");
  assert.equal(emptySelection.searchParams.get("resort"), "");
  assert.equal(emptySelection.searchParams.get("region"), "");
  assert.equal(emptySelection.searchParams.get("from"), "detail");
});

test("canonical site origin overrides request host and rejects unsafe configuration", () => {
  const old = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    process.env.NEXT_PUBLIC_SITE_URL = "https://snow.example.test";
    assert.equal(
      siteOrigin("https://evil.test/auth/callback"),
      "https://snow.example.test",
    );
    for (const value of [
      "https://user:password@snow.example.test",
      "https://snow.example.test/path",
      "http://snow.example.test",
      "javascript:alert(1)",
    ]) {
      process.env.NEXT_PUBLIC_SITE_URL = value;
      assert.equal(siteOrigin("http://localhost:3000"), null);
    }
  } finally {
    if (old === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = old;
  }
});

test("only exact server-provided Preview hosts supplement the canonical POST origin", () => {
  const names = ["NODE_ENV", "NEXT_PUBLIC_SITE_URL", "VERCEL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_BRANCH_URL"];
  const old = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const deployment = "snow-viking-deployment-fixture.vercel.app";
  const branch = "snow-viking-git-auth-fixture.vercel.app";
  const requestUrl = `https://${deployment}/api/posts`;
  try {
    Object.assign(process.env, { NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://configured.example.test", VERCEL: "1",
      VERCEL_ENV: "preview", VERCEL_URL: deployment, VERCEL_BRANCH_URL: branch });
    for (const host of [deployment, branch]) assert.equal(isAllowedPostOrigin(requestUrl, `https://${host}`), true);
    assert.equal(isAllowedPostOrigin(requestUrl, "https://configured.example.test"), true);
    // Callback destinations are not broadened by Preview POST permissions.
    assert.equal(siteOrigin(requestUrl), "https://configured.example.test");
    for (const origin of [null, "", "null", "https://other-project.vercel.app", "https://evil.test", `http://${deployment}`,
      `https://${deployment}/`, `https://${deployment}:444`, `https://${deployment}.evil.test`, `https://evil@${deployment}`, `https://${deployment}?x=1`]) {
      assert.equal(isAllowedPostOrigin(requestUrl, origin), false);
    }
    assert.equal(isAllowedPostOrigin("https://evil.test/api/posts", "https://evil.test"), false);
    process.env.NEXT_PUBLIC_SITE_URL = "";
    assert.equal(isAllowedPostOrigin(requestUrl, `https://${deployment}`), true);
    process.env.VERCEL_BRANCH_URL = "";
    for (const host of ["https://evil.test", "evil.test", "other.vercel.app/", "evil@other.vercel.app", "other.vercel.app:443",
      "other.vercel.app?x=1", " other.vercel.app", "nested.other.vercel.app", "-other.vercel.app", "a".repeat(64) + ".vercel.app"]) {
      process.env.VERCEL_URL = host;
      assert.equal(isAllowedPostOrigin("https://evil.test/api/posts", "https://evil.test"), false);
      assert.equal(isAllowedPostOrigin(requestUrl, "https://other.vercel.app"), false);
    }
    process.env.VERCEL_URL = deployment;
    process.env.NEXT_PUBLIC_SITE_URL = "https://configured.example.test";
    for (const environment of ["production", "development", ""]) {
      process.env.VERCEL_ENV = environment;
      assert.equal(isAllowedPostOrigin(requestUrl, `https://${deployment}`), false);
      assert.equal(isAllowedPostOrigin(requestUrl, "https://configured.example.test"), true);
    }
    process.env.VERCEL_ENV = "preview";
    delete process.env.VERCEL;
    assert.equal(isAllowedPostOrigin(requestUrl, `https://${deployment}`), false);
  } finally {
    for (const name of names) {
      if (old[name] === undefined) delete process.env[name];
      else process.env[name] = old[name];
    }
  }
});
