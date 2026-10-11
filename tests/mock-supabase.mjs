// Local HTTP fixture only. Never contacts a Supabase project or sends mail.
import http from "node:http";
import { readFileSync } from "node:fs";
const regions = [
  ["sapporo", "札幌近郊"], ["sorachi", "空知"], ["asahikawa-furano", "旭川・富良野"],
  ["dohoku", "道北"], ["doo", "道央"], ["niseko-rusutsu", "ニセコ・ルスツ"],
  ["iburi", "胆振"], ["donan", "道南"], ["doto", "道東"],
].map(([code, name], index) => ({ code, name, sort_order: index + 1 }));
let nextId = 3;
// The reviewed CSV has no comma-containing or quoted fields. This is fixture data only.
const initialResorts = readFileSync(new URL("../docs/resort-master-review/59-resorts-review.csv", import.meta.url), "utf8")
  .trim().split(/\r?\n/).slice(1).map((line) => {
    const [name, display_name, region_code, order, id] = line.split(",");
    return { id: id === "AUTO" ? nextId++ : Number(id), name, display_name,
      region_code, sort_order: Number(order), is_active: true };
  });
const initialPosts = ["オーンズ", "キロロ"].map((resort, index) => ({
  id: index + 1, resort, area: "山頂・上部", snow_type: "パウダー", snowfall: "ほぼ無し",
  roughness: "きれい", crowd: "空いている", condition: "★★★★★",
  comment: index === 0 ? "<script>fixture</script>" : "キロロの既存投稿",
  created_at: "2026-10-09T00:00:00Z",
}));
let resorts = structuredClone(initialResorts);
let posts = structuredClone(initialPosts);
let failedTables = new Set();
const uid = "11111111-1111-4111-8111-111111111111";
const user = {
  id: uid,
  aud: "authenticated",
  role: "authenticated",
  email: "snow@example.test",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  app_metadata: {},
  user_metadata: {},
  identities: [],
  created_at: "2026-01-01T00:00:00Z",
  is_anonymous: false,
};
const token = (kind = "verified") =>
  [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: uid,
        exp: Math.floor(Date.now() / 1000) + 3600,
        role: "authenticated",
        kind,
      }),
    ).toString("base64url"),
    "fixture-only-signature",
  ].join(".");
const session = (kind = "verified") => ({
  access_token: token(kind),
  refresh_token: "fixture-refresh",
  expires_in: 3600,
  token_type: "bearer",
  user:
    kind === "unconfirmed"
      ? { ...user, email_confirmed_at: undefined }
      : kind === "anonymous"
        ? { ...user, is_anonymous: true }
        : user,
});
let inserts = 0;
http
  .createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:3100");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "authorization, apikey, content-type, x-client-info, x-supabase-api-version, accept-profile, content-profile, prefer",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    res.setHeader("Content-Type", "application/json");
    if (req.method === "OPTIONS") {
      res.end();
      return;
    }
    let text = "";
    for await (const chunk of req) text += chunk;
    const body = text ? JSON.parse(text) : {};
    const url = new URL(req.url, "http://127.0.0.1:54321");
    const respond = (data, status = 200) => {
      res.statusCode = status;
      res.end(JSON.stringify(data));
    };
    if (url.pathname === "/__stats") return respond({ inserts, lastInsert: posts.at(-1) });
    if (url.pathname === "/__control" && req.method === "POST") {
      if (body.reset) {
        resorts = structuredClone(initialResorts);
        posts = structuredClone(initialPosts);
        inserts = 0;
        failedTables = new Set();
      }
      if (body.failTables) failedTables = new Set(body.failTables);
      if (body.inactive) resorts = resorts.map((r) => ({ ...r, is_active: !body.inactive.includes(r.name) }));
      return respond({ ok: true });
    }
    const table = url.pathname.startsWith("/rest/v1/") ? url.pathname.slice("/rest/v1/".length) : null;
    if (failedTables.has(table)) return respond({ message: "Fixture read failure" }, 500);
    function sendRows(source) {
      let rows = source.filter((row) => [...url.searchParams].every(([key, value]) =>
        !value.startsWith("eq.") || String(row[key]) === value.slice(3)));
      const orders = (url.searchParams.get("order") ?? "").split(",").filter(Boolean);
      rows = [...rows].sort((left, right) => {
        for (const order of orders) {
          const [key, direction] = order.split(".");
          const diff = left[key] < right[key] ? -1 : left[key] > right[key] ? 1 : 0;
          if (diff) return direction === "desc" ? -diff : diff;
        }
        return 0;
      });
      return respond(rows);
    }
    if (url.pathname === "/rest/v1/regions" && req.method === "GET") return sendRows(regions);
    if (url.pathname === "/rest/v1/resorts" && req.method === "GET") return sendRows(resorts);
    if (url.pathname === "/auth/v1/signup")
      return respond({ ...user, email_confirmed_at: undefined });
    if (
      url.pathname === "/auth/v1/recover" ||
      url.pathname === "/auth/v1/resend"
    )
      return respond({});
    if (url.pathname === "/auth/v1/verify") {
      if (body.token_hash !== "valid-fixture-token")
        return respond({ msg: "Expired", code: "otp_expired" }, 403);
      return respond(session());
    }
    if (url.pathname === "/auth/v1/token") {
      if (url.searchParams.get('grant_type') === 'pkce') {
        if (body.auth_code !== 'valid-fixture-code' || typeof body.code_verifier !== 'string' || body.code_verifier.length < 20) return respond({ msg: 'Invalid PKCE' }, 400);
        return respond(session());
      }
      if (
        body.password !== "fixture-password-123" &&
        url.searchParams.get("grant_type") !== "refresh_token"
      )
        return respond({ msg: "Invalid credentials" }, 400);
      return respond(
        session(
          body.email === "unconfirmed@example.test"
            ? "unconfirmed"
            : body.email === "anonymous@example.test"
              ? "anonymous"
              : "verified",
        ),
      );
    }
    if (url.pathname === "/auth/v1/user") {
      const jwt = req.headers.authorization?.split(" ")[1];
      if (!jwt || jwt.split(".").length !== 3)
        return respond({ msg: "No user", code: "bad_jwt" }, 401);
      const payload = JSON.parse(
        Buffer.from(jwt.split(".")[1], "base64url").toString(),
      );
      return respond(
        payload.kind === "unconfirmed"
          ? { ...user, email_confirmed_at: undefined }
          : payload.kind === "anonymous"
            ? { ...user, is_anonymous: true }
            : user,
      );
    }
    if (url.pathname === "/auth/v1/logout") return respond({});
    if (url.pathname === "/rest/v1/snow_posts") {
      if (req.method === "POST") {
        const activeResort = resorts.find((r) => r.name === body.resort && r.is_active);
        const jwt = req.headers.authorization?.split(" ")[1];
        const kind = jwt?.split(".").length === 3
          ? JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).kind : null;
        if (!activeResort || kind !== "verified") return respond({ message: "Fixture RLS rejection" }, 403);
        inserts++;
        posts.push({ ...body, id: posts.length + 1, created_at: new Date().toISOString() });
        return respond([], 201);
      }
      return sendRows(posts);
    }
    respond({ msg: "Unknown fixture route" }, 404);
  })
  .listen(54321, "127.0.0.1");
