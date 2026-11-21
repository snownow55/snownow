-- REVIEW DRAFT ONLY. NOT EXECUTED.
-- Target: snownow-dev only. Verify the project in the dashboard before approval.
-- Requires the SQL Editor's administrative role. Never run with an app user.
-- Sections A and C are read-only. Section B changes development DB masters.
-- PostgreSQL UTF8 is required for normalize(..., NFKC).

-- A. BEFORE: run separately, only after read-only execution is authorized.
BEGIN TRANSACTION READ ONLY;
SELECT jsonb_build_object(
  'existing_resorts', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)
    FROM (SELECT id, name, region, is_active FROM public.resorts) r),
  'columns', (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.column_order) FROM (
    SELECT a.attname AS column_name, a.attnum AS column_order,
      format_type(a.atttypid, a.atttypmod) AS data_type,
      a.attnotnull, a.attidentity, a.attgenerated,
      pg_get_expr(d.adbin, d.adrelid) AS default_expression
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = 'public.resorts'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
  ) x),
  'constraints', (SELECT jsonb_agg(jsonb_build_object('name', conname,
      'definition', pg_get_constraintdef(oid, true)) ORDER BY conname)
    FROM pg_constraint
    WHERE conrelid = 'public.resorts'::regclass OR confrelid = 'public.resorts'::regclass),
  'triggers', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', tgname,
      'internal', tgisinternal, 'definition', pg_get_triggerdef(oid, true)) ORDER BY tgname), '[]'::jsonb)
    FROM pg_trigger WHERE tgrelid = 'public.resorts'::regclass),
  'rules', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', rulename,
      'definition', pg_get_ruledef(oid, true))), '[]'::jsonb)
    FROM pg_rewrite WHERE ev_class = 'public.resorts'::regclass),
  'identity_sequence', (SELECT jsonb_build_object(
      'name', pg_get_serial_sequence('public.resorts', 'id'),
      'maximum_existing_id', (SELECT max(id) FROM public.resorts),
      'start_value', s.start_value, 'increment_by', s.increment_by,
      'max_value', s.max_value, 'cycle', s.cycle, 'last_value', s.last_value)
    FROM pg_sequences s
    WHERE to_regclass(format('%I.%I', s.schemaname, s.sequencename))
        = pg_get_serial_sequence('public.resorts', 'id')::regclass),
  'post_counts', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.resort), '[]'::jsonb)
    FROM (SELECT resort, count(*) AS post_count
          FROM snownow_private.snow_posts GROUP BY resort) x),
  'policies', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.schemaname, p.tablename, p.policyname)
    FROM pg_policies p
    WHERE (p.schemaname = 'public' AND p.tablename IN ('resorts', 'regions'))
       OR (p.schemaname = 'snownow_private' AND p.tablename = 'snow_posts')),
  'resort_privileges', (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.role_name) FROM (
    SELECT role_name,
      has_table_privilege(role_name, 'public.resorts', 'SELECT') AS can_select,
      has_table_privilege(role_name, 'public.resorts', 'INSERT') AS can_insert,
      has_table_privilege(role_name, 'public.resorts', 'UPDATE') AS can_update,
      has_table_privilege(role_name, 'public.resorts', 'DELETE') AS can_delete,
      has_any_column_privilege(role_name, 'public.resorts', 'INSERT') AS column_insert,
      has_any_column_privilege(role_name, 'public.resorts', 'UPDATE') AS column_update
    FROM (VALUES ('anon'), ('authenticated')) a(role_name)
  ) x),
  'post_view', (SELECT jsonb_build_object('options', c.reloptions,
    'definition', pg_get_viewdef(c.oid, true))
    FROM pg_class c WHERE c.oid = 'public.snow_posts'::regclass),
  'post_rls_enabled', (SELECT relrowsecurity FROM pg_class
                      WHERE oid = 'snownow_private.snow_posts'::regclass)
) AS before_review;
COMMIT;

