-- One atomic migration: no intermediate public-view/ACL exposure between stages.
-- Run ONLY after an approved backup and maintenance/cutover review.
-- Supabase CLI wraps each migration in a transaction. Unexpected shapes abort.
CREATE SCHEMA IF NOT EXISTS snownow_private;
CREATE TABLE IF NOT EXISTS public.regions (
 code text PRIMARY KEY, name text NOT NULL UNIQUE, sort_order smallint NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS public.resorts (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL UNIQUE,
 display_name text NOT NULL, region_code text REFERENCES public.regions(code),
 sort_order integer NOT NULL CHECK(sort_order>0), is_active boolean NOT NULL DEFAULT true,
 region text
);
ALTER TABLE public.resorts ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.resorts ADD COLUMN IF NOT EXISTS region_code text REFERENCES public.regions(code);
ALTER TABLE public.resorts ADD COLUMN IF NOT EXISTS sort_order integer;
ALTER TABLE public.resorts ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.resorts ADD COLUMN IF NOT EXISTS region text;

-- Keep original production rows, columns, IDs and values intact and NONPUBLIC.
DO $$ DECLARE kind "char"; BEGIN
 SELECT relkind INTO kind FROM pg_class WHERE oid=to_regclass('public.snow_posts');
 IF kind='r' THEN
   IF EXISTS(SELECT 1 FROM pg_depend d JOIN pg_rewrite w ON d.classid='pg_rewrite'::regclass AND w.oid=d.objid
     WHERE d.refclassid='pg_class'::regclass AND d.refobjid='public.snow_posts'::regclass AND w.ev_class<>d.refobjid) THEN
     RAISE EXCEPTION 'Dependent view may expose legacy posts; review before archiving'; END IF;
   IF to_regclass('snownow_private.snow_posts') IS NOT NULL THEN
     RAISE EXCEPTION 'Ambiguous public and private post tables'; END IF;
   ALTER TABLE public.snow_posts SET SCHEMA snownow_private;
   ALTER TABLE snownow_private.snow_posts RENAME TO legacy_public_snow_posts;
 ELSIF kind='v' THEN
   IF to_regclass('snownow_private.snow_posts') IS NULL THEN
     RAISE EXCEPTION 'Post view without expected backing table'; END IF;
   -- Fail rather than CASCADE into unknown dependants.
   DROP VIEW public.snow_posts;
 ELSIF kind IS NOT NULL THEN
   RAISE EXCEPTION 'Unsupported public post object';
 END IF;
 IF to_regclass('snownow_private.snow_posts') IS NOT NULL THEN
   ALTER TABLE snownow_private.snow_posts RENAME TO legacy_authenticated_snow_posts;
 END IF;
END $$;

CREATE FUNCTION snownow_private.utf16_length(value text) RETURNS bigint
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path=''
AS $$ SELECT coalesce(sum(CASE WHEN pg_catalog.ascii(c)>65535 THEN 2 ELSE 1 END),0)::bigint
FROM pg_catalog.regexp_split_to_table(value,'') AS c $$;

CREATE TABLE snownow_private.snow_posts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id),
 resort text NOT NULL REFERENCES public.resorts(name),
 area text NOT NULL CHECK(area IN ('山頂・上部','中腹','山麓・下部','全体')),
 -- 湿雪 remains valid ONLY as stored history; RPC rejects it on new submissions.
 snow_type text NOT NULL CHECK(snow_type IN ('パウダー','圧雪','硬めの圧雪','アイスバーン','湿雪','ザラメ','シャバ雪・べちゃ雪','みぞれ・雨')),
 snowfall text NOT NULL CHECK(snowfall IN ('ほぼ無し','うっすら積もった','そこそこ積もった','かなり積もった','分からない')),
 roughness text NOT NULL CHECK(roughness IN ('きれい','少し荒れている','かなり荒れている','ボコボコ')),
 crowd text NOT NULL CHECK(crowd IN ('空いている','普通','混んでいる')),
 comment text NOT NULL CHECK(snownow_private.utf16_length(comment)<=1000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
DO $$ BEGIN
 IF to_regclass('snownow_private.legacy_authenticated_snow_posts') IS NOT NULL THEN
   -- Development adoption only: stays in the SAME project; never exports users/posts.
   INSERT INTO snownow_private.snow_posts(id,user_id,resort,area,snow_type,snowfall,roughness,crowd,comment,created_at)
   OVERRIDING SYSTEM VALUE
   SELECT id,user_id,resort,area,snow_type,snowfall,roughness,crowd,comment,created_at
   FROM snownow_private.legacy_authenticated_snow_posts;
 END IF;
END $$;
SELECT pg_catalog.setval(pg_catalog.pg_get_serial_sequence('snownow_private.snow_posts','id'),
 coalesce((SELECT max(id) FROM snownow_private.snow_posts),1),
 EXISTS(SELECT 1 FROM snownow_private.snow_posts));
CREATE INDEX snow_posts_resort_latest ON snownow_private.snow_posts(resort,created_at DESC,id DESC);
CREATE TABLE snownow_private.post_limits (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id), last_success_at timestamptz NOT NULL
);
INSERT INTO snownow_private.post_limits SELECT user_id,max(created_at)
FROM snownow_private.snow_posts GROUP BY user_id;
CREATE VIEW public.snow_posts WITH(security_invoker=true) AS
SELECT id,resort,area,snow_type,snowfall,roughness,crowd,comment,created_at
FROM snownow_private.snow_posts;


-- Preserve every existing facility ID and historical row. No DELETEs.
INSERT INTO public.regions(code,name,sort_order) VALUES
('sapporo','札幌近郊',1),('sorachi','空知',2),('asahikawa-furano','旭川・富良野',3),('dohoku','道北',4),('doo','道央',5),('niseko-rusutsu','ニセコ・ルスツ',6),('iburi','胆振',7),('donan','道南',8),('doto','道東',9)
ON CONFLICT(code) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order;
INSERT INTO public.resorts(name,display_name,region_code,sort_order,is_active,region)
SELECT m.name,m.display_name,m.region_code,m.sort_order,true,g.name
FROM (VALUES
('さっぽろばんけい','さっぽろばんけいスキー場','sapporo',1),
('サッポロテイネ','サッポロテイネ','sapporo',2),
('Fu''sスノーエリア','Fu''sスノーエリア','sapporo',3),
('札幌国際スキー場','札幌国際スキー場','sapporo',4),
('キロロ','キロロスノーワールド','sapporo',5),
('オーンズ','スノークルーズオーンズ','sapporo',6),
('朝里川温泉スキー場','朝里川温泉スキー場','sapporo',7),
('小樽天狗山スキー場','小樽天狗山スキー場','sapporo',8),
('コンサドーレ仁木スキーパーク','コンサドーレ仁木スキーパーク','sapporo',9),
('北長沼スキー場','北長沼スキー場','sapporo',10),
('マウントレースイ','マウントレースイスキー場','sapporo',11),
('中山峠スキー場','中山峠スキー場','sapporo',12),
('札幌藻岩山スキー場','札幌藻岩山スキー場','sapporo',13),
('北海道グリーンランド','北海道グリーンランドスキー場','sorachi',1),
('萩の山スキー場','萩の山市民スキー場','sorachi',2),
('桂沢国設スキー場','桂沢国設スキー場','sorachi',3),
('美唄国設スキー場','美唄国設スキー場','sorachi',4),
('かもい岳スキー場','かもい岳国際スキー場','sorachi',5),
('ASHIMOI KANKO 高穂スキー場','ASHIMOI KANKO 高穂スキー場','sorachi',6),
('サンタプレゼントパーク','サンタプレゼントパーク','asahikawa-furano',1),
('カムイスキーリンクス','カムイスキーリンクス','asahikawa-furano',2),
('キャンモアスキービレッジ','キャンモアスキービレッジ','asahikawa-furano',3),
('ぴっぷスキー場','ぴっぷスキー場','asahikawa-furano',4),
('旭岳ロープウェイ','旭岳ロープウェイ','asahikawa-furano',5),
('大雪山黒岳スキー場','大雪山黒岳スキー場','asahikawa-furano',6),
('富良野スキー場','富良野スキー場','asahikawa-furano',7),
('国設南ふらのスキー場','国設南ふらのスキー場','asahikawa-furano',8),
('和寒東山スキー場','和寒東山スキー場','asahikawa-furano',9),
('ほろたちスキー場','ほろたちスキー場','asahikawa-furano',10),
('士別日向スキー場','士別日向スキー場','dohoku',1),
('名寄ピヤシリスキー場','名寄ピヤシリスキー場','dohoku',3),
('稚内市こまどりスキー場','稚内市こまどりスキー場','dohoku',4),
('豊富温泉スキー場','豊富温泉スキー場','dohoku',5),
('音威富士スキー場','音威富士スキー場','dohoku',6),
('星野リゾート トマム','星野リゾート トマム','doo',1),
('サホロリゾートスキー場','サホロリゾートスキー場','doo',2),
('日高国際スキー場','日高国際スキー場','doo',3),
('ルスツリゾート','ルスツリゾート','niseko-rusutsu',1),
('ニセコHANAZONOリゾート','ニセコHANAZONOリゾート','niseko-rusutsu',2),
('ニセコグラン・ヒラフ','ニセコ東急 グラン・ヒラフ','niseko-rusutsu',3),
('ニセコアンヌプリ国際スキー場','ニセコアンヌプリ国際スキー場','niseko-rusutsu',4),
('ニセコビレッジスキーリゾート','ニセコビレッジスキーリゾート','niseko-rusutsu',5),
('ニセコモイワスキーリゾート','ニセコモイワスキーリゾート','niseko-rusutsu',6),
('サンライバスキー場','カルルス温泉サンライバスキー場','iburi',1),
('オロフレスキー場','オロフレスキー場','iburi',2),
('今金町ピリカスキー場','今金町ピリカスキー場','donan',1),
('グリーンピア大沼スキー場','グリーンピア大沼スキー場','donan',2),
('函館七飯スノーパーク','函館七飯スノーパーク','donan',3),
('知内町営スキー場','知内町営スキー場','donan',4),
('えんがるロックバレー','えんがるロックバレー','doto',1),
('ノーザンアークリゾート','ノーザンアークリゾートスキー場','doto',2),
('網走レークビュースキー場','網走レークビュースキー場','doto',3),
('北見若松市民スキー場','北見若松市民スキー場','doto',4),
('国設阿寒湖畔スキー場 ウタラ','国設阿寒湖畔スキー場 ウタラ','doto',5),
('ぬかびら源泉郷スキー場','ぬかびら源泉郷スキー場','doto',6),
('斜里町ウナベツスキー場','斜里町ウナベツスキー場','doto',7),
('紋別市営大山スキー場','紋別市営大山スキー場','doto',8),
('湧別町五鹿山スキー場','湧別町五鹿山スキー場','doto',9),
('北見市留辺蘂町八方台スキー場','北見市留辺蘂町八方台スキー場','doto',10),
('メムロスキー場','メムロスキー場','doo',11),
('美幌町リリー山スキー場','美幌町リリー山スキー場','doto',12),
('ダイナスティスキーリゾート','ダイナスティスキーリゾート','sapporo',14),
('暑寒別岳スキー場','暑寒別岳スキー場','asahikawa-furano',11)
) m(name,display_name,region_code,sort_order)
JOIN public.regions g ON g.code=m.region_code
ON CONFLICT(name) DO UPDATE SET display_name=excluded.display_name,
region_code=excluded.region_code,sort_order=excluded.sort_order,is_active=true;
UPDATE public.resorts SET is_active=false,display_name=coalesce(display_name,name),
region_code=coalesce(region_code,'dohoku'),sort_order=coalesce(sort_order,2) WHERE name='士別あさひスキー場';
-- Abort on unexpected active facilities instead of deleting or hiding them.
DO $$ BEGIN
IF (SELECT count(*) FROM public.resorts WHERE is_active)<>63 THEN
 RAISE EXCEPTION 'Unexpected active master; review before applying'; END IF;
IF EXISTS(SELECT 1 FROM public.resorts r LEFT JOIN public.regions g ON g.code=r.region_code
 WHERE g.code IS NULL OR coalesce(btrim(r.display_name),'')='' OR r.sort_order IS NULL OR r.sort_order<1) THEN
 RAISE EXCEPTION 'Incomplete historical master; review without discarding rows'; END IF;
END $$;
ALTER TABLE public.resorts ALTER COLUMN display_name SET NOT NULL;
ALTER TABLE public.resorts ALTER COLUMN region_code SET NOT NULL;
ALTER TABLE public.resorts ALTER COLUMN sort_order SET NOT NULL;
CREATE UNIQUE INDEX resorts_region_order_beta ON public.resorts(region_code,sort_order);


-- A non-login, non-owner, non-BYPASSRLS role confines SECURITY DEFINER functions.
CREATE ROLE snownow_post_writer NOLOGIN NOINHERIT NOBYPASSRLS;
DO $$ BEGIN
 IF current_setting('server_version_num')::int>=160000 THEN
  EXECUTE format('GRANT snownow_post_writer TO %I WITH SET TRUE, INHERIT FALSE',current_user);
 ELSE
  EXECUTE format('GRANT snownow_post_writer TO %I',current_user);
 END IF;
END $$;
GRANT USAGE,CREATE ON SCHEMA public TO snownow_post_writer;
GRANT USAGE ON SCHEMA snownow_private TO snownow_post_writer;

-- Hosted postgres cannot grant auth USAGE. Only this postgres-owned, no-argument
-- helper resolves auth.uid(); the writer never accesses the managed schema.
CREATE FUNCTION snownow_private.current_user_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT auth.uid() $$;
ALTER FUNCTION snownow_private.current_user_id() OWNER TO postgres;
REVOKE ALL ON FUNCTION snownow_private.current_user_id() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION snownow_private.current_user_id() TO snownow_post_writer;

-- Auth is managed by Supabase and may itself enforce RLS. A no-argument,
-- read-only boolean helper runs as the migration administrator; it never exposes
-- user rows and is executable only by the confined posting role.
CREATE FUNCTION snownow_private.posting_user_verified() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=snownow_private.current_user_id()
 AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous,true)
 AND coalesce(u.email,'')<>'')
$$;
ALTER FUNCTION snownow_private.posting_user_verified() OWNER TO postgres;
REVOKE ALL ON FUNCTION snownow_private.posting_user_verified() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION snownow_private.posting_user_verified() TO snownow_post_writer;

-- Remove existing policies on application masters; only read access is required.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT schemaname,tablename,policyname FROM pg_policies
 WHERE schemaname='public' AND tablename IN ('regions','resorts') LOOP
 EXECUTE format('DROP POLICY %I ON %I.%I',r.policyname,r.schemaname,r.tablename);
 END LOOP;
END $$;
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE snownow_private.snow_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE snownow_private.snow_posts FORCE ROW LEVEL SECURITY;
ALTER TABLE snownow_private.post_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE snownow_private.post_limits FORCE ROW LEVEL SECURITY;
CREATE POLICY regions_read ON public.regions FOR SELECT TO anon,authenticated,snownow_post_writer USING(true);
CREATE POLICY resorts_read ON public.resorts FOR SELECT TO anon,authenticated,snownow_post_writer USING(true);
CREATE POLICY posts_read ON snownow_private.snow_posts FOR SELECT TO anon,authenticated USING(true);
CREATE POLICY writer_insert ON snownow_private.snow_posts FOR INSERT TO snownow_post_writer
WITH CHECK(user_id=snownow_private.current_user_id() AND snownow_private.posting_user_verified() AND EXISTS(SELECT 1 FROM public.resorts r WHERE r.name=resort AND r.is_active));
CREATE POLICY limits_writer ON snownow_private.post_limits TO snownow_post_writer USING(user_id=snownow_private.current_user_id()) WITH CHECK(user_id=snownow_private.current_user_id());

-- Table REVOKE does not remove column ACLs. Clean both, including archives.
DO $$ DECLARE t record; cols text; BEGIN
 FOR t IN SELECT c.oid,n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE (n.nspname='snownow_private' AND c.relkind IN ('r','v','p')
 AND c.relname IN ('snow_posts','post_limits','legacy_public_snow_posts','legacy_authenticated_snow_posts'))
 OR (n.nspname='public' AND c.relname IN ('regions','resorts','snow_posts')) LOOP
 EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM PUBLIC,anon,authenticated',t.nspname,t.relname);
 SELECT string_agg(format('%I',attname),',') INTO cols FROM pg_attribute
 WHERE attrelid=t.oid AND attnum>0 AND NOT attisdropped;
 IF cols IS NOT NULL THEN EXECUTE format('REVOKE SELECT(%1$s),INSERT(%1$s),UPDATE(%1$s),REFERENCES(%1$s) ON TABLE %2$I.%3$I FROM PUBLIC,anon,authenticated',cols,t.nspname,t.relname); END IF;
 END LOOP;
 FOR t IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind='S' AND EXISTS(
 SELECT 1 FROM pg_depend d JOIN pg_class target ON target.oid=d.refobjid
 JOIN pg_namespace tn ON tn.oid=target.relnamespace
 WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i')
 AND ((tn.nspname='public' AND target.relname='resorts') OR
 (tn.nspname='snownow_private' AND target.relname IN ('snow_posts','legacy_public_snow_posts','legacy_authenticated_snow_posts')))) LOOP
 EXECUTE format('REVOKE ALL ON SEQUENCE %I.%I FROM PUBLIC,anon,authenticated',t.nspname,t.relname);
 END LOOP;
END $$;
REVOKE ALL ON SCHEMA snownow_private FROM PUBLIC,anon,authenticated;
REVOKE CREATE ON SCHEMA public FROM PUBLIC,anon,authenticated;
-- Each new helper is closed individually. Keep unrelated functions (including
-- public.rls_auto_enable) and their ACLs intact; do not alter global defaults.
REVOKE ALL ON FUNCTION snownow_private.utf16_length(text) FROM PUBLIC,anon,authenticated;
DO $$ BEGIN
 IF to_regprocedure('snownow_private.email_verified()') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION snownow_private.email_verified() FROM PUBLIC,anon,authenticated;
 END IF;
END $$;
GRANT USAGE ON SCHEMA public TO anon,authenticated;
GRANT SELECT ON public.regions,public.resorts,public.snow_posts TO anon,authenticated;
GRANT SELECT(id,resort,area,snow_type,snowfall,roughness,crowd,comment,created_at)
 ON snownow_private.snow_posts TO anon,authenticated;
GRANT SELECT ON public.resorts TO snownow_post_writer;
GRANT SELECT,INSERT,UPDATE ON snownow_private.post_limits TO snownow_post_writer;
GRANT INSERT(user_id,resort,area,snow_type,snowfall,roughness,crowd,comment,created_at) ON snownow_private.snow_posts TO snownow_post_writer;
DO $$ BEGIN EXECUTE format('GRANT USAGE ON SEQUENCE %s TO snownow_post_writer',pg_get_serial_sequence('snownow_private.snow_posts','id')); END $$;
GRANT EXECUTE ON FUNCTION snownow_private.utf16_length(text) TO snownow_post_writer;

CREATE FUNCTION public.posting_status() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=snownow_private.current_user_id(); next_at timestamptz; ts timestamptz:=clock_timestamp(); BEGIN
 IF actor IS NULL OR NOT snownow_private.posting_user_verified() THEN
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Posting authentication required'; END IF;
 SELECT last_success_at+interval '60 minutes' INTO next_at FROM snownow_private.post_limits WHERE user_id=actor;
 RETURN jsonb_build_object('allowed',next_at IS NULL OR next_at<=ts,'serverTime',ts,
 'nextAllowedAt',next_at,'retryAfterSeconds',greatest(0,ceil(extract(epoch FROM(next_at-ts)))::int));
END $$;
CREATE FUNCTION public.submit_snow_post(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=snownow_private.current_user_id(); ts timestamptz; next_at timestamptz; BEGIN
 IF actor IS NULL OR NOT snownow_private.posting_user_verified() THEN
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Posting authentication required'; END IF;
 IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid post'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(payload))<>7 OR EXISTS(
 SELECT 1 FROM unnest(ARRAY['resort','area','snow_type','snowfall','roughness','crowd','comment']) k
 WHERE jsonb_typeof(payload->k) IS DISTINCT FROM 'string') THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid post'; END IF;
 IF snownow_private.utf16_length(payload->>'resort') NOT BETWEEN 1 AND 200
 OR NOT EXISTS(SELECT 1 FROM public.resorts WHERE name=payload->>'resort' AND is_active)
 OR payload->>'area' NOT IN ('山頂・上部','中腹','山麓・下部','全体')
 OR payload->>'snow_type' NOT IN ('パウダー','圧雪','硬めの圧雪','アイスバーン','ザラメ','シャバ雪・べちゃ雪','みぞれ・雨')
 OR payload->>'snowfall' NOT IN ('ほぼ無し','うっすら積もった','そこそこ積もった','かなり積もった','分からない')
 OR payload->>'roughness' NOT IN ('きれい','少し荒れている','かなり荒れている','ボコボコ')
 OR payload->>'crowd' NOT IN ('空いている','普通','混んでいる')
 OR snownow_private.utf16_length(payload->>'comment')>1000 THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid post'; END IF;
 -- Global per-user lock: serializes every resort and concurrent first submissions.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,20261115));
 ts:=clock_timestamp();
 SELECT last_success_at+interval '60 minutes' INTO next_at FROM snownow_private.post_limits WHERE user_id=actor FOR UPDATE;
 IF next_at>ts THEN RETURN jsonb_build_object('allowed',false,'nextAllowedAt',next_at,'serverTime',ts,
 'retryAfterSeconds',ceil(extract(epoch FROM(next_at-ts)))::int); END IF;
 INSERT INTO snownow_private.snow_posts(user_id,resort,area,snow_type,snowfall,roughness,crowd,comment,created_at)
 VALUES(actor,payload->>'resort',payload->>'area',payload->>'snow_type',payload->>'snowfall',payload->>'roughness',payload->>'crowd',payload->>'comment',ts);
 INSERT INTO snownow_private.post_limits VALUES(actor,ts)
 ON CONFLICT(user_id) DO UPDATE SET last_success_at=excluded.last_success_at;
 RETURN jsonb_build_object('allowed',true,'nextAllowedAt',ts+interval '60 minutes','serverTime',ts,'retryAfterSeconds',3600);
END $$;
-- Set ACLs while postgres still owns these functions. The administrator has
-- SET ROLE permission, but deliberately does not inherit the writer's rights.
REVOKE ALL ON FUNCTION public.posting_status(),public.submit_snow_post(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.posting_status(),public.submit_snow_post(jsonb) TO authenticated;
ALTER FUNCTION public.posting_status() OWNER TO snownow_post_writer;
ALTER FUNCTION public.submit_snow_post(jsonb) OWNER TO snownow_post_writer;
REVOKE CREATE ON SCHEMA public FROM snownow_post_writer;
-- Global PUBLIC EXECUTE is a PostgreSQL default. Every new function above is
-- explicitly REVOKEd within this atomic migration, then checked below.
-- Fail on inherited permissions instead of silently accepting an unsafe deployment.
DO $$ DECLARE role_name text; t record; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
 IF (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=role_name)
 OR pg_has_role(role_name,'snownow_post_writer','MEMBER')
 OR has_schema_privilege(role_name,'public','CREATE') OR has_schema_privilege(role_name,'snownow_private','USAGE,CREATE') THEN RAISE EXCEPTION 'Unsafe application role'; END IF;
 FOR t IN SELECT oid FROM pg_class WHERE relnamespace='snownow_private'::regnamespace AND relkind='r' AND relname IN ('snow_posts','post_limits','legacy_public_snow_posts','legacy_authenticated_snow_posts') LOOP
 IF has_table_privilege(role_name,t.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
 OR has_any_column_privilege(role_name,t.oid,'INSERT,UPDATE,REFERENCES') THEN RAISE EXCEPTION 'Inherited write privilege'; END IF;
 END LOOP;
 FOR t IN SELECT oid FROM pg_proc WHERE oid IN (
 'snownow_private.current_user_id()'::regprocedure,
 'snownow_private.posting_user_verified()'::regprocedure,
 'snownow_private.utf16_length(text)'::regprocedure,
 to_regprocedure('snownow_private.email_verified()')) LOOP
 IF has_function_privilege(role_name,t.oid,'EXECUTE') THEN RAISE EXCEPTION 'Private helper access'; END IF;
 END LOOP;
 FOR t IN SELECT c.oid FROM pg_class c
 WHERE c.relkind='S' AND EXISTS(
 SELECT 1 FROM pg_depend d JOIN pg_class target ON target.oid=d.refobjid
 JOIN pg_namespace tn ON tn.oid=target.relnamespace
 WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i')
 AND ((tn.nspname='public' AND target.relname='resorts') OR
 (tn.nspname='snownow_private' AND target.relname IN ('snow_posts','legacy_public_snow_posts','legacy_authenticated_snow_posts')))) LOOP
 IF has_sequence_privilege(role_name,t.oid,'USAGE,SELECT,UPDATE') THEN RAISE EXCEPTION 'Inherited application sequence access'; END IF;
 END LOOP;
 IF has_column_privilege(role_name,'snownow_private.snow_posts','user_id','SELECT')
 OR has_table_privilege(role_name,'snownow_private.post_limits','SELECT') THEN RAISE EXCEPTION 'Private column access'; END IF;
 FOR t IN SELECT oid FROM pg_class WHERE relnamespace='snownow_private'::regnamespace AND relname IN ('legacy_public_snow_posts','legacy_authenticated_snow_posts') AND relkind='r' LOOP
 IF has_any_column_privilege(role_name,t.oid,'SELECT') THEN RAISE EXCEPTION 'Inherited archive read'; END IF;
 END LOOP;
 FOR t IN SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('snow_posts','regions','resorts') LOOP
 IF has_table_privilege(role_name,t.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') OR has_any_column_privilege(role_name,t.oid,'INSERT,UPDATE,REFERENCES') THEN RAISE EXCEPTION 'Inherited public write'; END IF;
 END LOOP;
 END LOOP;
END $$;
-- The migration administrator retains role membership for future function updates.
-- No application role may inherit or SET ROLE to the writer (asserted above).

DO $$ DECLARE f regprocedure; BEGIN
 FOREACH f IN ARRAY ARRAY['snownow_private.current_user_id()'::regprocedure,
 'snownow_private.posting_user_verified()'::regprocedure,'snownow_private.utf16_length(text)'::regprocedure,
 'public.posting_status()'::regprocedure,'public.submit_snow_post(jsonb)'::regprocedure] LOOP
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 WHERE p.oid=f AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'PUBLIC function execute remains'; END IF;
 END LOOP;
 IF has_function_privilege('anon','public.posting_status()','EXECUTE')
 OR has_function_privilege('anon','public.submit_snow_post(jsonb)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.posting_status()','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.submit_snow_post(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Unexpected RPC privileges'; END IF;
END $$;
