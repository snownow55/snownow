-- Separate approved maintenance operation, BEFORE final backup/delta capture.
-- Does not pause Auth or reads. No automatic unfreeze or broad re-grant.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ DECLARE r record; cols text; BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Expected reviewed postgres session'; END IF;
 IF to_regprocedure('public.submit_snow_post(jsonb)') IS NOT NULL OR to_regclass('snownow_private.legacy_authenticated_snow_posts') IS NOT NULL THEN RAISE EXCEPTION 'Expected pre-STEP2 development baseline'; END IF;
 IF to_regclass('public.snow_posts') IS NULL OR to_regclass('snownow_private.snow_posts') IS NULL THEN RAISE EXCEPTION 'Expected reviewed view/backing table'; END IF;
 FOR r IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.oid IN('public.snow_posts'::regclass,'snownow_private.snow_posts'::regclass) LOOP
  EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON TABLE %I.%I FROM PUBLIC,anon,authenticated,service_role',r.nspname,r.relname);
  SELECT string_agg(quote_ident(attname),',') INTO cols FROM pg_attribute
  WHERE attrelid=format('%I.%I',r.nspname,r.relname)::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE INSERT(%1$s),UPDATE(%1$s) ON TABLE %2$I.%3$I FROM PUBLIC,anon,authenticated,service_role',cols,r.nspname,r.relname);
 END LOOP;
END $$;
COMMIT;
