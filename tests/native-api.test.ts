import test from "node:test";
import assert from "node:assert/strict";
import { nativeApiOrigin, nativeBearer, nativeApiOptions, withNativeCors } from "../lib/native-api.ts";
const request = (origin = "capacitor://localhost", authorization = "Bearer synthetic.jwt.signature", path = "/api/posts") => new Request("https://snowviking.jp" + path, { headers: { origin, authorization } });
test("native bearer path is disabled by default and restricted to reviewed origins and API paths", () => {
  assert.equal(nativeBearer(request(), {}), null);
  const env = { NATIVE_APP_API_ENABLED: "true", NODE_ENV: "production" };
  assert.equal(nativeBearer(request(), env), "synthetic.jwt.signature");
  for (const origin of ["https://evil.example", "capacitor://evil", "http://localhost:5173", "null"]) assert.equal(nativeApiOrigin(request(origin), env), null);
  for (const token of ["", "Basic synthetic", "Bearer has spaces"]) assert.equal(nativeBearer(request("capacitor://localhost", token), env), null);
  assert.equal(nativeBearer(request("capacitor://localhost", "Bearer synthetic", "/auth/callback"), env), null);
  assert.equal(nativeApiOrigin(request("http://localhost:5173"), { ...env, NODE_ENV: "development" }), "http://localhost:5173");
});
test("preflight and CORS allow only native bearer requests without cookie credentials or wildcard origins", async () => {
  const old = process.env.NATIVE_APP_API_ENABLED; process.env.NATIVE_APP_API_ENABLED = "true";
  try {
    const preflight = new Request("https://snowviking.jp/api/posts", { method: "OPTIONS", headers: { origin: "capacitor://localhost", "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type" } });
    assert.equal(nativeApiOptions(preflight).status, 204);
    const response = await withNativeCors(request(), async () => Response.json({ error: "Authentication required" }, { status: 401 }));
    assert.equal(response.status, 401); assert.equal(response.headers.get("Access-Control-Allow-Origin"), "capacitor://localhost");
    assert.equal(response.headers.get("Access-Control-Allow-Credentials"), null);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    const bad = new Request(preflight, { headers: { origin: "https://evil.example", "access-control-request-method": "POST" } });
    assert.equal(nativeApiOptions(bad).status, 403);
  } finally { if (old === undefined) delete process.env.NATIVE_APP_API_ENABLED; else process.env.NATIVE_APP_API_ENABLED = old; }
});
