-- PREPARATION TEMPLATE: postgres session + --single-transaction required.
-- Fixed fresh schema; a second run deliberately fails. No CASCADE or row deletion.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'postgres' OR (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN RAISE EXCEPTION 'Expected non-superuser postgres'; END IF;
 IF to_regnamespace('snownow_step2_quarantine') IS NOT NULL THEN RAISE EXCEPTION 'Quarantine already exists; inspect rather than rerun'; END IF;
 IF to_regclass('snownow_private.legacy_authenticated_snow_posts') IS NULL
 OR to_regclass('snownow_private.legacy_public_snow_posts') IS NOT NULL
 OR (SELECT relkind FROM pg_class WHERE oid=to_regclass('public.snow_posts')) IS DISTINCT FROM 'v'::"char"
 OR to_regclass('snownow_private.post_limits') IS NULL THEN RAISE EXCEPTION 'Only reviewed development baseline supported'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE ((n.nspname='public' AND c.relname IN('regions','resorts')) OR
 (n.nspname='snownow_private' AND c.relname IN('snow_posts','legacy_authenticated_snow_posts','post_limits')))
 AND pg_get_userbyid(c.relowner)<>'postgres') THEN RAISE EXCEPTION 'Unexpected app owner'; END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f'
 AND confrelid IN('public.regions'::regclass,'public.resorts'::regclass,'snownow_private.snow_posts'::regclass,'snownow_private.legacy_authenticated_snow_posts'::regclass,'snownow_private.post_limits'::regclass)
 AND conrelid NOT IN('public.regions'::regclass,'public.resorts'::regclass,'snownow_private.snow_posts'::regclass,'snownow_private.legacy_authenticated_snow_posts'::regclass,'snownow_private.post_limits'::regclass)) THEN RAISE EXCEPTION 'External FK dependency requires review'; END IF;
 IF EXISTS(SELECT 1 FROM pg_depend d JOIN pg_rewrite w ON d.classid='pg_rewrite'::regclass AND w.oid=d.objid
 WHERE d.refclassid='pg_class'::regclass AND d.refobjid IN('public.regions'::regclass,'public.resorts'::regclass,'snownow_private.snow_posts'::regclass,'snownow_private.legacy_authenticated_snow_posts'::regclass,'snownow_private.post_limits'::regclass)
 AND w.ev_class<>d.refobjid AND w.ev_class<>'public.snow_posts'::regclass) THEN RAISE EXCEPTION 'External view dependency requires review'; END IF;
END $$;
-- LOCK prevents concurrent writes through DB clients as well as the application.
LOCK TABLE public.regions,public.resorts,snownow_private.snow_posts,
 snownow_private.legacy_authenticated_snow_posts,snownow_private.post_limits IN ACCESS EXCLUSIVE MODE;
CREATE SCHEMA snownow_step2_quarantine AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA snownow_step2_quarantine FROM PUBLIC,anon,authenticated,service_role;
-- No implicit owner privilege is assumed for the NOINHERIT writer role.
GRANT USAGE,CREATE ON SCHEMA snownow_step2_quarantine TO snownow_post_writer;
SET LOCAL ROLE snownow_post_writer;
REVOKE ALL ON FUNCTION public.posting_status(),public.submit_snow_post(jsonb) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.posting_status() SET SCHEMA snownow_step2_quarantine;
ALTER FUNCTION public.submit_snow_post(jsonb) SET SCHEMA snownow_step2_quarantine;
RESET ROLE;
REVOKE CREATE ON SCHEMA snownow_step2_quarantine FROM snownow_post_writer;
-- Unknown dependants make these operations fail atomically; never use CASCADE.
DROP VIEW public.snow_posts;
ALTER TABLE snownow_private.snow_posts SET SCHEMA snownow_step2_quarantine;
ALTER TABLE snownow_private.post_limits SET SCHEMA snownow_step2_quarantine;
ALTER TABLE snownow_private.legacy_authenticated_snow_posts SET SCHEMA snownow_step2_quarantine;
ALTER TABLE public.resorts SET SCHEMA snownow_step2_quarantine;
ALTER TABLE public.regions SET SCHEMA snownow_step2_quarantine;
ALTER FUNCTION snownow_private.email_verified() SET SCHEMA snownow_step2_quarantine;
ALTER FUNCTION snownow_private.utf16_length(text) SET SCHEMA snownow_step2_quarantine;
ALTER FUNCTION snownow_private.current_user_id() SET SCHEMA snownow_step2_quarantine;
ALTER FUNCTION snownow_private.posting_user_verified() SET SCHEMA snownow_step2_quarantine;
