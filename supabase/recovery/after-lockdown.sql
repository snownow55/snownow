-- Same transaction as before-quarantine + reviewed application-only restore SQL.
-- Recovery is a preserved STOPPED application, not permission to resume old API.
DO $$ DECLARE r record; cols text; BEGIN
 FOR r IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE ((n.nspname='public' AND c.relname IN('regions','resorts','snow_posts')) OR
 (n.nspname='snownow_private' AND c.relname='snow_posts') OR n.nspname='snownow_step2_quarantine')
 AND c.relkind IN('r','p','v') LOOP
  EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM PUBLIC,anon,authenticated,service_role,snownow_post_writer',r.nspname,r.relname);
  SELECT string_agg(quote_ident(a.attname),',') INTO cols FROM pg_attribute a
  WHERE a.attrelid=format('%I.%I',r.nspname,r.relname)::regclass AND a.attnum>0 AND NOT a.attisdropped;
  IF cols IS NOT NULL THEN
   EXECUTE format('REVOKE SELECT(%1$s),INSERT(%1$s),UPDATE(%1$s),REFERENCES(%1$s) ON TABLE %2$I.%3$I FROM PUBLIC,anon,authenticated,service_role,snownow_post_writer',cols,r.nspname,r.relname);
  END IF;
 END LOOP;
 -- Only sequences owned by these application tables. Unrelated sequences untouched.
 FOR r IN SELECT DISTINCT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=c.oid AND d.refclassid='pg_class'::regclass AND d.deptype IN('a','i')
 JOIN pg_class t ON t.oid=d.refobjid JOIN pg_namespace tn ON tn.oid=t.relnamespace
 WHERE c.relkind='S' AND ((tn.nspname='public' AND t.relname IN('regions','resorts')) OR
 (tn.nspname='snownow_private' AND t.relname='snow_posts') OR tn.nspname='snownow_step2_quarantine') LOOP
  EXECUTE format('REVOKE ALL ON SEQUENCE %I.%I FROM PUBLIC,anon,authenticated,service_role,snownow_post_writer',r.nspname,r.relname);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION snownow_private.email_verified() FROM PUBLIC,anon,authenticated,service_role,snownow_post_writer;
-- Functions owned by the writer require explicit SET ROLE.
SET LOCAL ROLE snownow_post_writer;
REVOKE ALL ON FUNCTION snownow_step2_quarantine.posting_status(),snownow_step2_quarantine.submit_snow_post(jsonb) FROM PUBLIC,anon,authenticated,service_role,snownow_post_writer;
RESET ROLE;
REVOKE ALL ON FUNCTION snownow_step2_quarantine.email_verified(),snownow_step2_quarantine.utf16_length(text),snownow_step2_quarantine.current_user_id(),snownow_step2_quarantine.posting_user_verified() FROM PUBLIC,anon,authenticated,service_role,snownow_post_writer;
REVOKE ALL ON SCHEMA snownow_step2_quarantine FROM PUBLIC,anon,authenticated,service_role,snownow_post_writer;
