// Local HTTP fixture only. Never contacts a Supabase project or sends mail.
import http from "node:http";
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
    if (url.pathname === "/__stats") return respond({ inserts });
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
        inserts++;
        return respond([], 201);
      }
      return respond([
        {
          id: 1,
          resort: "オーンズ",
          area: "山頂・上部",
          snow_type: "パウダー",
          snowfall: "ほぼ無し",
          roughness: "きれい",
          crowd: "空いている",
          condition: "★★★★★",
          comment: "<script>fixture</script>",
          created_at: "2026-10-09T00:00:00Z",
        },
      ]);
    }
    respond({ msg: "Unknown fixture route" }, 404);
  })
  .listen(54321, "127.0.0.1");
