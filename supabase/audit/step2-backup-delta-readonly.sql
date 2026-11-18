-- Execute only after explicit permission to connect to the reviewed development project.
-- Compare against the protected backup inventory, before and after maintenance freeze.
-- Emits digests/counts/catalogs only; no post bodies, email or credential values.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='15s';
SELECT 'regions' AS object,count(*) AS rows,md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY code)::text,'[]')) AS row_digest FROM public.regions t
UNION ALL SELECT 'resorts',count(*),md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM public.resorts t
UNION ALL SELECT 'private_posts',count(*),md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM snownow_private.snow_posts t;
SELECT md5(coalesce(jsonb_agg(jsonb_build_array(id,name) ORDER BY id)::text,'[]')) AS facility_id_map_digest FROM public.resorts;
SELECT count(*) AS auth_users,md5(coalesce(jsonb_agg(jsonb_build_array(id,email_confirmed_at,is_anonymous) ORDER BY id)::text,'[]')) AS auth_state_digest FROM auth.users;
SELECT n.nspname,c.relname,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text,
 md5(coalesce((SELECT jsonb_agg(jsonb_build_array(a.attname,a.atttypid::regtype::text,a.attnotnull,a.attidentity,a.attacl::text) ORDER BY a.attnum)::text FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'[]')) AS column_catalog_digest
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE (n.nspname='public' AND c.relname IN('regions','resorts','snow_posts')) OR (n.nspname='snownow_private' AND c.relname='snow_posts') ORDER BY 1,2;
SELECT schemaname,tablename,policyname,roles,cmd,md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) AS policy_digest
FROM pg_policies WHERE (schemaname='public' AND tablename IN('regions','resorts','snow_posts')) OR (schemaname='snownow_private' AND tablename='snow_posts') ORDER BY 1,2,3;
-- External FK dependencies must be reviewed before app-only recovery.
SELECT conname,conrelid::regclass AS dependent_table,confrelid::regclass AS referenced_table
FROM pg_constraint WHERE contype='f' AND confrelid IN('public.regions'::regclass,'public.resorts'::regclass,'snownow_private.snow_posts'::regclass)
AND conrelid NOT IN('public.regions'::regclass,'public.resorts'::regclass,'snownow_private.snow_posts'::regclass);
ROLLBACK;
