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
  created_at: new Date().toISOString(), updated_at: null,
}));
let resorts = structuredClone(initialResorts);
let posts = structuredClone(initialPosts);
let failedTables = new Set();
let postReadNow = null;
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
let lastSuccess = 0;
let logoutFails = false;
let signupSession = false;
http
  .createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:3100");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "authorization, apikey, content-type, x-client-info, x-supabase-api-version, accept-profile, content-profile, prefer",
    );
    res.setHeader("Access-Control-Expose-Headers", "Content-Range");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    res.setHeader("Content-Type", "application/json");
    if (req.method === "OPTIONS") {
      res.end();
      return;
    }
    // Decode across chunk boundaries; large Japanese fixtures may split a UTF-8 character.
    req.setEncoding("utf8");
    let text = "";
    for await (const chunk of req) text += chunk;
    const body = text ? JSON.parse(text) : {};
    const url = new URL(req.url, "http://127.0.0.1:54321");
    const respond = (data, status = 200) => {
      res.statusCode = status;
      res.end(JSON.stringify(data));
    };
    if (url.pathname === "/__stats") return respond({ inserts, lastInsert: posts.at(-1), posts });
    if (url.pathname === "/__control" && req.method === "POST") {
      if (body.reset) {
        resorts = structuredClone(initialResorts);
        posts = structuredClone(initialPosts);
        inserts = 0;
        lastSuccess = 0;
        logoutFails = false;
        signupSession = false;
        failedTables = new Set();
        postReadNow = null;
      }
      if (body.postReadNow !== undefined) postReadNow = body.postReadNow;
      if (body.signupSession !== undefined) signupSession = body.signupSession;
      if (body.logoutFails !== undefined) logoutFails = body.logoutFails;
      if (body.lastSuccess !== undefined) lastSuccess = body.lastSuccess;
      if (body.resorts) resorts = structuredClone(body.resorts);
      if (body.failTables) failedTables = new Set(body.failTables);
      if (body.posts) posts = structuredClone(body.posts);
      if (body.inactive) resorts = resorts.map((r) => ({ ...r, is_active: !body.inactive.includes(r.name) }));
      return respond({ ok: true });
    }
    const table = url.pathname.startsWith("/rest/v1/") ? url.pathname.slice("/rest/v1/".length) : null;
    if (failedTables.has(table)) return respond({ message: "Fixture read failure" }, 500);
    function sendRows(source) {
      let rows = source.filter((row) => [...url.searchParams].every(([key, value]) => {
        if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
        if (key === "created_at" && value.startsWith("gte.")) return Date.parse(row[key]) >= Date.parse(value.slice(4));
        if (key === "created_at" && value.startsWith("lt.")) return Date.parse(row[key]) < Date.parse(value.slice(3));
        return true;
      }));
      const orders = (url.searchParams.get("order") ?? "").split(",").filter(Boolean);
      rows = [...rows].sort((left, right) => {
        for (const order of orders) {
          const [key, direction] = order.split(".");
          const diff = left[key] < right[key] ? -1 : left[key] > right[key] ? 1 : 0;
          if (diff) return direction === "desc" ? -diff : diff;
        }
        return 0;
      });
      const count = rows.length;
      const limit = Number(url.searchParams.get("limit") ?? 1000);
      rows = rows.slice(0, Math.min(limit, 1000));
      if (req.headers.prefer?.includes("count=exact"))
        res.setHeader("Content-Range", rows.length ? `0-${rows.length - 1}/${count}` : `*/${count}`);
      const columns = url.searchParams.get("select")?.split(",");
      return respond(columns && !columns.includes("*")
        ? rows.map((row) => Object.fromEntries(columns.map((key) => [key, row[key]])))
        : rows);
    }
    if (url.pathname === "/rest/v1/regions" && req.method === "GET") return sendRows(regions);
    if (url.pathname === "/rest/v1/resorts" && req.method === "GET") return sendRows(resorts);
    if (url.pathname === "/auth/v1/signup")
      return respond(signupSession ? session() : { ...user, email_confirmed_at: undefined });
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
    if (url.pathname === "/auth/v1/logout") return logoutFails ? respond({ msg: "Fixture logout failed" }, 500) : respond({});
    if (url.pathname === "/rest/v1/rpc/posting_status" || url.pathname === "/rest/v1/rpc/submit_snow_post") {
      const jwt = req.headers.authorization?.split(" ")[1];
      const kind = jwt?.split(".").length === 3 ? JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).kind : null;
      if (kind !== "verified") return respond({ code: "42501", message: "Fixture RPC auth rejection" }, 403);
      const next = lastSuccess + 3600000;
      const seconds = Math.max(0, Math.ceil((next - Date.now()) / 1000));
      const result = { allowed: seconds === 0, serverTime: new Date().toISOString(), nextAllowedAt: lastSuccess ? new Date(next).toISOString() : null, retryAfterSeconds: seconds };
      if (url.pathname.endsWith("posting_status") || seconds > 0) return respond(result);
      const payload = body.payload;
      if (!payload || payload.snow_type === "湿雪" || Object.hasOwn(payload, "condition") || !resorts.some((r) => r.name === payload.resort && r.is_active)) return respond({ code: "22023", message: "Invalid post" }, 400);
      inserts++;
      lastSuccess = Date.now();
      posts.push({ ...payload, id: posts.length + 1, created_at: new Date(lastSuccess).toISOString() });
      return respond({ allowed: true, serverTime: new Date().toISOString(), nextAllowedAt: new Date(lastSuccess + 3600000).toISOString(), retryAfterSeconds: 3600 });
    }
    if (url.pathname === "/rest/v1/snow_posts") {
      if (req.method !== "GET") return respond({ code: "42501", message: "Direct write denied" }, 403);
      const now = postReadNow ?? Date.now();
      const start = Math.floor((now + 9 * 3600000) / 86400000) * 86400000 - 9 * 3600000;
      return sendRows(posts.filter(p => Date.parse(p.created_at) >= start && Date.parse(p.created_at) < start + 86400000));
    }
    respond({ msg: "Unknown fixture route" }, 404);
  })
  .listen(54321, "127.0.0.1");
