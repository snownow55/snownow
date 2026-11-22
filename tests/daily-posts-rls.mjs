// Isolated PostgreSQL only. Synthetic data; no Supabase connection.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const { PGlite } = await import(process.env.OWNER_PGLITE_MODULE);
const db = new PGlite();
try {
  const setup = readFileSync("tests/owner-posts-rls.mjs", "utf8").match(/await db\.exec\(`([\s\S]*?)`\);/)[1];
  await db.exec(setup);
  await db.exec(readFileSync("supabase/migrations/20261121000300_owner_post_management.sql", "utf8"));
  await db.exec(`
    UPDATE snownow_private.snow_posts SET created_at = (date_trunc('day', statement_timestamp() AT TIME ZONE 'Asia/Tokyo') AT TIME ZONE 'Asia/Tokyo') - interval '1 day';
    WITH bounds AS (SELECT date_trunc('day', statement_timestamp() AT TIME ZONE 'Asia/Tokyo') AT TIME ZONE 'Asia/Tokyo' AS start)
    INSERT INTO snownow_private.snow_posts(id,user_id,resort,area,snow_type,snowfall,roughness,crowd,comment,created_at)
    SELECT id, '11111111-1111-4111-8111-111111111111'::uuid, 'TEST', '中腹', 'パウダー', 'ほぼ無し', 'きれい', '普通', 'boundary', start + delta
    FROM bounds CROSS JOIN (VALUES (101,interval '-1 microsecond'),(102,interval '0'),(103,interval '1 day -1 microsecond'),(104,interval '1 day')) AS x(id,delta);
  `);
  const before = await db.query("SELECT * FROM snownow_private.snow_posts ORDER BY id");
  const limits = await db.query("SELECT * FROM snownow_private.post_limits");
  await db.exec(readFileSync("supabase/migrations/20261121000400_daily_post_visibility.sql", "utf8"));
  assert.deepEqual(await db.query("SELECT * FROM snownow_private.snow_posts ORDER BY id"), before);
  await db.exec("SET ROLE anon");
  assert.deepEqual((await db.query("SELECT id FROM public.snow_posts ORDER BY id")).rows.map(r => r.id), [102,103]);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.snow_posts")).rows[0].n, 2);
  await db.exec("SET TIME ZONE 'America/Los_Angeles'");
  assert.deepEqual((await db.query("SELECT id FROM public.snow_posts ORDER BY id")).rows.map(r => r.id), [102,103]);
  await db.exec("SET ROLE authenticated; SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';");
  const fields = {area:'中腹',snow_type:'パウダー',snowfall:'ほぼ無し',roughness:'きれい',crowd:'普通',comment:'edited old post'};
  assert.equal((await db.query("SELECT public.edit_snow_post(101,$1::jsonb) AS ok", [JSON.stringify(fields)])).rows[0].ok, true);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.snow_posts WHERE id=101")).rows[0].n, 0);
  assert.equal((await db.query("SELECT public.delete_snow_post(101) AS ok")).rows[0].ok, true);
  await db.exec("RESET ROLE");
  assert.deepEqual(await db.query("SELECT * FROM snownow_private.post_limits"), limits);
  assert.equal((await db.query("SELECT reloptions @> ARRAY['security_invoker=true'] AS ok FROM pg_class WHERE oid='public.snow_posts'::regclass")).rows[0].ok, true);
  console.log("PASS: JST server-side day boundaries/counts, alternate session timezone, stored data retained, historical owner RPCs and cooldown retained, security_invoker retained");
} finally { await db.close(); }
