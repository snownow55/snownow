// Run with OWNER_PGLITE_MODULE pointing to a local @electric-sql/pglite entry.
// Artificial data only; no connections to a Supabase project.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.OWNER_PGLITE_MODULE);
const db=new PGlite();
try {
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE snownow_post_writer NOLOGIN NOINHERIT NOBYPASSRLS;
 CREATE SCHEMA snownow_private;GRANT USAGE ON SCHEMA snownow_private TO snownow_post_writer;
 CREATE FUNCTION snownow_private.current_user_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE FUNCTION snownow_private.utf16_length(value text) RETURNS bigint LANGUAGE sql IMMUTABLE AS $$SELECT coalesce(sum(CASE WHEN ascii(c)>65535 THEN 2 ELSE 1 END),0)::bigint FROM regexp_split_to_table(value,'') c$$;
 CREATE TABLE snownow_private.snow_posts(id bigint PRIMARY KEY,user_id uuid NOT NULL,resort text,area text,snow_type text,snowfall text,roughness text,crowd text,comment text,created_at timestamptz);
 CREATE TABLE snownow_private.post_limits(user_id uuid PRIMARY KEY,last_success_at timestamptz);
 ALTER TABLE snownow_private.snow_posts ENABLE ROW LEVEL SECURITY;ALTER TABLE snownow_private.snow_posts FORCE ROW LEVEL SECURITY;
 CREATE POLICY posts_read ON snownow_private.snow_posts FOR SELECT TO anon,authenticated USING(true);
 GRANT USAGE ON SCHEMA public TO anon,authenticated;
 CREATE VIEW public.snow_posts WITH(security_invoker=true) AS SELECT id,resort,area,snow_type,snowfall,roughness,crowd,comment,created_at FROM snownow_private.snow_posts;
 GRANT SELECT ON public.snow_posts TO anon,authenticated;
 GRANT SELECT(id,resort,area,snow_type,snowfall,roughness,crowd,comment,created_at) ON snownow_private.snow_posts TO anon,authenticated;
 INSERT INTO snownow_private.snow_posts VALUES(1,'11111111-1111-4111-8111-111111111111','TEST','中腹','パウダー','ほぼ無し','きれい','普通','original','2026-11-20Z'),(2,'22222222-2222-4222-8222-222222222222','TEST','中腹','パウダー','ほぼ無し','きれい','普通','bob','2026-11-20Z');
 INSERT INTO snownow_private.post_limits VALUES('11111111-1111-4111-8111-111111111111','2026-11-20Z');`);
 await db.exec(readFileSync('supabase/migrations/20261121000300_owner_post_management.sql','utf8'));
 const baseline=await db.query('SELECT * FROM snownow_private.post_limits');
 await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';`);
 assert.deepEqual((await db.query('SELECT public.my_post_ids() ids')).rows[0].ids,[1]);
 const fields={area:'中腹',snow_type:'パウダー',snowfall:'ほぼ無し',roughness:'きれい',crowd:'普通',comment:'edited'};
 const edit=async(id,payload)=> (await db.query('SELECT public.edit_snow_post($1,$2::jsonb) ok',[id,JSON.stringify(payload)])).rows[0].ok;
 assert.equal(await edit(2,fields),false);
 assert.equal((await db.query('SELECT public.delete_snow_post(2) ok')).rows[0].ok,false);
 await assert.rejects(edit(1,{...fields,created_at:'2026-01-01Z'}));
 await assert.rejects(edit(1,{...fields,comment:'😀'.repeat(501)}));
 await assert.rejects(db.exec("UPDATE public.snow_posts SET comment='bypass' WHERE id=1"));
 await db.exec('SET ROLE snownow_post_writer');
 await assert.rejects(db.exec("UPDATE snownow_private.snow_posts SET resort='changed' WHERE id=1"));
 await assert.rejects(db.exec("UPDATE snownow_private.snow_posts SET created_at=now() WHERE id=1"));
 await assert.rejects(db.exec("UPDATE snownow_private.snow_posts SET user_id='22222222-2222-4222-8222-222222222222' WHERE id=1"));
 await db.exec("UPDATE snownow_private.snow_posts SET comment='rls bypass' WHERE id=2");
 await db.exec('RESET ROLE');
 assert.equal((await db.query('SELECT comment FROM snownow_private.snow_posts WHERE id=2')).rows[0].comment,'bob');
 await db.exec('SET ROLE authenticated');
 assert.equal(await edit(1,fields),true);
 const updated=(await db.query('SELECT * FROM public.snow_posts WHERE id=1')).rows[0];
 assert.equal(updated.comment,'edited');assert.ok(updated.updated_at);assert.equal(updated.resort,'TEST');assert.equal(new Date(updated.created_at).toISOString(),'2026-11-20T00:00:00.000Z');
 assert.equal((await db.query('SELECT public.delete_snow_post(1) ok')).rows[0].ok,true);
 await db.exec('RESET ROLE');assert.deepEqual(await db.query('SELECT * FROM snownow_private.post_limits'),baseline);
 assert.equal((await db.query('SELECT count(*)::int n FROM snownow_private.snow_posts')).rows[0].n,1);
 await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT public.delete_snow_post(2)'));
 console.log('PASS: owner edit/delete, ownership isolation, anonymous/direct-write denial, immutable fields, updated_at, UTF16 length, cooldown retained; no ticket code.');
} finally {await db.close();}
