-- REVIEW DRAFT ONLY. NOT EXECUTED.
-- Target: snownow-dev only. Verify the project in the dashboard before approval.
-- Requires the SQL Editor's administrative role. Never run with an app user.
-- Sections A and C are read-only. Section B changes development DB masters.
-- PostgreSQL UTF8 is required for normalize(..., NFKC).

-- C. AFTER: standalone read-only confirmation, after approved application.
BEGIN TRANSACTION READ ONLY;
SELECT jsonb_build_object(
  'totals', (SELECT jsonb_build_object('regions', (SELECT count(*) FROM public.regions),
                                      'resorts', (SELECT count(*) FROM public.resorts))),
  'region_counts', (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.sort_order) FROM (
    SELECT g.code, g.name, g.sort_order, count(r.id) AS resort_count
    FROM public.regions g LEFT JOIN public.resorts r ON r.region_code = g.code
    GROUP BY g.code, g.name, g.sort_order
  ) x),
  'resorts', (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.region_sort, x.sort_order) FROM (
    SELECT r.id, r.name, r.display_name, r.region, r.region_code, r.sort_order,
           r.is_active, g.sort_order AS region_sort
    FROM public.resorts r JOIN public.regions g ON g.code = r.region_code
  ) x),
  'duplicate_names', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
    SELECT name, count(*) FROM public.resorts GROUP BY name HAVING count(*) > 1
  ) x),
  'post_counts', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
    SELECT resort, count(*) FROM snownow_private.snow_posts GROUP BY resort ORDER BY resort
  ) x),
  'policies', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.schemaname, p.tablename, p.policyname)
    FROM pg_policies p
    WHERE (p.schemaname = 'public' AND p.tablename IN ('regions', 'resorts'))
       OR (p.schemaname = 'snownow_private' AND p.tablename = 'snow_posts')),
  'master_privileges', (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.role_name, x.table_name) FROM (
    SELECT role_name, table_name,
      has_table_privilege(role_name, table_name, 'SELECT') AS can_select,
      has_table_privilege(role_name, table_name, 'INSERT') AS can_insert,
      has_table_privilege(role_name, table_name, 'UPDATE') AS can_update,
      has_table_privilege(role_name, table_name, 'DELETE') AS can_delete,
      has_table_privilege(role_name, table_name, 'TRUNCATE') AS can_truncate,
      has_any_column_privilege(role_name, table_name, 'INSERT') AS column_insert,
      has_any_column_privilege(role_name, table_name, 'UPDATE') AS column_update
    FROM (VALUES ('anon'), ('authenticated')) a(role_name)
    CROSS JOIN (VALUES ('public.regions'), ('public.resorts')) t(table_name)
  ) x),
  'post_constraints', (SELECT jsonb_agg(jsonb_build_object('name', conname,
    'definition', pg_get_constraintdef(oid, true)) ORDER BY conname)
    FROM pg_constraint WHERE conrelid = 'snownow_private.snow_posts'::regclass),
  'post_view', (SELECT jsonb_build_object('options', c.reloptions,
    'definition', pg_get_viewdef(c.oid, true))
    FROM pg_class c WHERE c.oid = 'public.snow_posts'::regclass),
  'post_rls_enabled', (SELECT relrowsecurity FROM pg_class
                      WHERE oid = 'snownow_private.snow_posts'::regclass)
) AS after_review;
COMMIT;
