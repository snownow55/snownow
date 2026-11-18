-- PREPARATION ONLY. Execute only after explicit permission to CONNECT to snownow-dev.
-- This cannot identify a Supabase project: separately match Dashboard/Project Reference/host.
-- SQL A-D need not be repeated; use only to fill gaps or establish changes since the backup.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15s';
SELECT current_user AS execution_role,current_database() AS database_name,
       rolname='postgres' AND NOT rolsuper AS expected_non_superuser,
       rolcreaterole,rolbypassrls,
       has_schema_privilege(current_user,'public','CREATE') AS public_create,
       has_schema_privilege(current_user,'auth','USAGE') AS auth_usage,
       has_schema_privilege(current_user,'auth','USAGE WITH GRANT OPTION') AS auth_usage_grant_option,
       CASE WHEN to_regprocedure('auth.uid()') IS NOT NULL THEN has_function_privilege(current_user,'auth.uid()','EXECUTE') END AS native_uid_execute
FROM pg_catalog.pg_roles WHERE rolname=current_user;
SELECT column_name,
       CASE WHEN to_regclass('auth.users') IS NOT NULL THEN has_column_privilege(current_user,'auth.users',column_name,'SELECT') END AS can_read
FROM (VALUES('id'),('email'),('email_confirmed_at'),('is_anonymous')) x(column_name);
SELECT CASE WHEN to_regclass('auth.users') IS NOT NULL THEN has_column_privilege(current_user,'auth.users','id','REFERENCES') END AS user_id_references;
SELECT n.nspname AS schema_name,c.relname,c.relkind,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE (n.nspname='public' AND c.relname IN('regions','resorts','snow_posts')) OR (n.nspname='snownow_private' AND c.relname IN('snow_posts','post_limits','legacy_authenticated_snow_posts','legacy_public_snow_posts'))
ORDER BY n.nspname,c.relname;
SELECT name,to_regprocedure(name) IS NOT NULL AS exists_before_apply
FROM (VALUES('public.posting_status()'),('public.submit_snow_post(jsonb)'),('snownow_private.current_user_id()'),('snownow_private.posting_user_verified()'),('snownow_private.utf16_length(text)')) f(name);
SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='snownow_post_writer') AS writer_exists_before_apply,
       to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS history_table_exists;
-- Non-owned dependencies would prevent an app-only rollback. Names/owners only, no definitions/data.
SELECT DISTINCT vn.nspname AS dependent_schema,v.relname AS dependent_view,pg_get_userbyid(v.relowner) AS owner,
       tn.nspname AS referenced_schema,t.relname AS referenced_relation
FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_rewrite w ON d.classid='pg_rewrite'::regclass AND w.oid=d.objid
JOIN pg_catalog.pg_class v ON v.oid=w.ev_class JOIN pg_catalog.pg_namespace vn ON vn.oid=v.relnamespace
JOIN pg_catalog.pg_class t ON d.refclassid='pg_class'::regclass AND t.oid=d.refobjid JOIN pg_catalog.pg_namespace tn ON tn.oid=t.relnamespace
WHERE v.oid<>t.oid AND ((tn.nspname='public' AND t.relname IN('regions','resorts','snow_posts')) OR (tn.nspname='snownow_private' AND t.relname='snow_posts'))
ORDER BY 1,2,4,5;
SELECT e.evtname,e.evtevent,e.evtenabled,e.evttags,pg_get_userbyid(e.evtowner) AS event_owner,
       p.oid::regprocedure::text AS handler,pg_get_userbyid(p.proowner) AS handler_owner,p.prosecdef,
       md5(pg_get_functiondef(p.oid)) AS handler_definition_hash
FROM pg_catalog.pg_event_trigger e JOIN pg_catalog.pg_proc p ON p.oid=e.evtfoid ORDER BY e.evtname;
-- Counts/row hashes/IDs are compared with the latest protected backup inventory separately.
-- Do not return post text, user email, token values, passwords or function definitions.
ROLLBACK;
