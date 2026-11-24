-- Apply this file alone inside the migration transaction. No Auth/app tables are changed.
-- Limits: 5,000 accepted events/day, 40,000 raw rows, 300 events/visitor/day.
-- Raw retention: current JST calendar day + six previous days, only after verified aggregation.
-- Daily aggregates: current JST calendar day + 89 previous days. No cron is enabled here.
CREATE TABLE snownow_private.usage_days (
  day_jst date PRIMARY KEY,
  accepted_events integer NOT NULL DEFAULT 0 CHECK (accepted_events >= 0),
  raw_events integer NOT NULL DEFAULT 0 CHECK (raw_events >= 0),
  rejected_events bigint NOT NULL DEFAULT 0,
  aggregated_events integer,
  aggregate_hash text,
  finalized_at timestamptz,
  cleaned_at timestamptz
);
CREATE TABLE snownow_private.usage_events (
  event_id uuid PRIMARY KEY,
  day_jst date NOT NULL REFERENCES snownow_private.usage_days(day_jst) ON DELETE RESTRICT,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  visitor_day_id uuid NOT NULL,
  session_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('visit','page_view','session_start','pwa_install')),
  display_mode text NOT NULL CHECK (display_mode IN ('browser','standalone')),
  platform text NOT NULL CHECK (platform IN ('android','iphone','ipad','other')),
  entry_source text NOT NULL CHECK (entry_source IN ('x','instagram','line','facebook','youtube','tiktok','other','direct_unknown')),
  page_kind text NOT NULL CHECK (page_kind IN ('home','resort','post','settings','login','signup','account_delete','terms','privacy','contact','access','other'))
);
CREATE INDEX usage_events_day_visitor ON snownow_private.usage_events(day_jst,visitor_day_id);
CREATE UNIQUE INDEX usage_visit_once ON snownow_private.usage_events(day_jst,visitor_day_id,display_mode) WHERE event_type='visit';
CREATE UNIQUE INDEX usage_session_once ON snownow_private.usage_events(session_id) WHERE event_type='session_start';
CREATE TABLE snownow_private.usage_daily_summary (
  day_jst date NOT NULL REFERENCES snownow_private.usage_days(day_jst) ON DELETE CASCADE,
  dimension text NOT NULL CHECK (dimension IN ('all','platform','source','mode','page')),
  bucket text NOT NULL,
  page_views bigint NOT NULL,
  unique_ids bigint NOT NULL,
  pwa_launches bigint NOT NULL,
  pwa_unique_ids bigint NOT NULL,
  sessions bigint NOT NULL,
  detected_installs bigint NOT NULL,
  source_events bigint NOT NULL,
  PRIMARY KEY(day_jst,dimension,bucket)
);
ALTER TABLE snownow_private.usage_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE snownow_private.usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE snownow_private.usage_daily_summary ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON snownow_private.usage_days,snownow_private.usage_events,snownow_private.usage_daily_summary FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION snownow_private.usage_rollup(p_day date)
RETURNS TABLE(dimension text,bucket text,page_views bigint,unique_ids bigint,pwa_launches bigint,pwa_unique_ids bigint,sessions bigint,detected_installs bigint,source_events bigint)
LANGUAGE sql STABLE SET search_path='' AS $rollup$
 SELECT
  CASE WHEN grouping(platform)=0 THEN 'platform' WHEN grouping(entry_source)=0 THEN 'source'
       WHEN grouping(display_mode)=0 THEN 'mode' WHEN grouping(page_kind)=0 THEN 'page' ELSE 'all' END,
  CASE WHEN grouping(platform)=0 THEN platform WHEN grouping(entry_source)=0 THEN entry_source
       WHEN grouping(display_mode)=0 THEN display_mode WHEN grouping(page_kind)=0 THEN page_kind ELSE 'all' END,
  count(*) FILTER(WHERE event_type='page_view'),
  count(DISTINCT visitor_day_id) FILTER(WHERE event_type<>'pwa_install'),
  count(*) FILTER(WHERE event_type='session_start' AND display_mode='standalone'),
  count(DISTINCT visitor_day_id) FILTER(WHERE event_type<>'pwa_install' AND display_mode='standalone'),
  count(*) FILTER(WHERE event_type='session_start'),
  count(*) FILTER(WHERE event_type='pwa_install'), count(*)
 FROM snownow_private.usage_events WHERE day_jst=p_day
 GROUP BY GROUPING SETS ((),(platform),(entry_source),(display_mode),(page_kind)) HAVING count(*)>0;
$rollup$;
CREATE FUNCTION snownow_private.usage_digest(p_day date) RETURNS text
LANGUAGE sql STABLE SET search_path='' SET timezone='UTC' AS $digest$
 SELECT encode(sha256(convert_to(coalesce(string_agg(to_jsonb(e)::text,',' ORDER BY event_id),''),'UTF8')),'hex')
 FROM snownow_private.usage_events e WHERE day_jst=p_day;
$digest$;

CREATE FUNCTION public.record_usage_events(p_batch jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $ingest$
DECLARE d date; item jsonb; inserted integer; total_raw bigint; visitor_rows integer;
  accepted integer:=0; duplicate integer:=0; limited integer:=0;
  visitor uuid; session uuid; eid uuid; kind text; mode text; platform_value text; source_value text; page_value text;
BEGIN
 IF jsonb_typeof(p_batch) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'USAGE_INVALID_BATCH' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_batch)<1 OR jsonb_array_length(p_batch)>3 OR octet_length(p_batch::text)>4096 THEN RAISE EXCEPTION 'USAGE_INVALID_BATCH' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(736842,1);
 d:=(clock_timestamp() AT TIME ZONE 'Asia/Tokyo')::date;
 INSERT INTO snownow_private.usage_days(day_jst) VALUES(d) ON CONFLICT DO NOTHING;
 FOR item IN SELECT value FROM jsonb_array_elements(p_batch) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'USAGE_INVALID_EVENT' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(item))<>9 OR EXISTS(
    SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN ('event_id','day_jst','visitor_day_id','session_id','event_type','display_mode','platform','entry_source','page_kind')
  ) THEN RAISE EXCEPTION 'USAGE_INVALID_EVENT' USING ERRCODE='22023'; END IF;
  IF (item->>'day_jst') IS DISTINCT FROM d::text THEN RAISE EXCEPTION 'USAGE_DAY_MISMATCH' USING ERRCODE='22023'; END IF;
  BEGIN
   eid:=(item->>'event_id')::uuid; visitor:=(item->>'visitor_day_id')::uuid; session:=(item->>'session_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'USAGE_INVALID_ID' USING ERRCODE='22023'; END;
  kind:=item->>'event_type'; mode:=item->>'display_mode'; platform_value:=item->>'platform'; source_value:=item->>'entry_source'; page_value:=item->>'page_kind';
  IF eid IS NULL OR visitor IS NULL OR session IS NULL OR
    kind IS NULL OR kind NOT IN ('visit','page_view','session_start','pwa_install') OR
    mode IS NULL OR mode NOT IN ('browser','standalone') OR
    platform_value IS NULL OR platform_value NOT IN ('android','iphone','ipad','other') OR
    source_value IS NULL OR source_value NOT IN ('x','instagram','line','facebook','youtube','tiktok','other','direct_unknown') OR
    page_value IS NULL OR page_value NOT IN ('home','resort','post','settings','login','signup','account_delete','terms','privacy','contact','access','other')
    THEN RAISE EXCEPTION 'USAGE_INVALID_EVENT' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM snownow_private.usage_events e WHERE e.event_id=eid) OR
    (kind='visit' AND EXISTS(SELECT 1 FROM snownow_private.usage_events e WHERE e.day_jst=d AND e.visitor_day_id=visitor AND e.display_mode=mode AND e.event_type='visit')) OR
    (kind='session_start' AND EXISTS(SELECT 1 FROM snownow_private.usage_events e WHERE e.session_id=session AND e.event_type='session_start')) THEN
    duplicate:=duplicate+1; CONTINUE;
  END IF;
  SELECT coalesce(sum(raw_events),0) INTO total_raw FROM snownow_private.usage_days;
  SELECT count(*) INTO visitor_rows FROM snownow_private.usage_events e WHERE e.day_jst=d AND e.visitor_day_id=visitor;
  IF total_raw>=40000 OR visitor_rows>=300 OR (SELECT accepted_events FROM snownow_private.usage_days WHERE day_jst=d)>=5000 THEN
   limited:=limited+1; UPDATE snownow_private.usage_days SET rejected_events=rejected_events+1 WHERE day_jst=d; CONTINUE;
  END IF;
  INSERT INTO snownow_private.usage_events(event_id,day_jst,visitor_day_id,session_id,event_type,display_mode,platform,entry_source,page_kind)
  VALUES(eid,d,visitor,session,kind,mode,platform_value,source_value,page_value) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  IF inserted=1 THEN
   UPDATE snownow_private.usage_days SET accepted_events=accepted_events+1,raw_events=raw_events+1 WHERE day_jst=d;
   accepted:=accepted+1;
  ELSE duplicate:=duplicate+1; END IF;
 END LOOP;
 RETURN jsonb_build_object('accepted',accepted,'duplicate',duplicate,'limited',limited);
END;
$ingest$;

CREATE FUNCTION public.maintain_usage_analytics() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $maintain$
DECLARE today date; row record; n bigint; fingerprint text; deleted integer; days_done integer:=0; rows_removed bigint:=0;
BEGIN
 PERFORM pg_advisory_xact_lock(736842,1);
 LOCK TABLE snownow_private.usage_events IN SHARE ROW EXCLUSIVE MODE;
 today:=(clock_timestamp() AT TIME ZONE 'Asia/Tokyo')::date;
 FOR row IN SELECT * FROM snownow_private.usage_days WHERE day_jst<today AND raw_events>0 ORDER BY day_jst LOOP
  SELECT count(*) INTO n FROM snownow_private.usage_events WHERE day_jst=row.day_jst;
  IF n<>row.raw_events THEN RAISE EXCEPTION 'USAGE_RAW_COUNT_MISMATCH'; END IF;
  fingerprint:=snownow_private.usage_digest(row.day_jst);
  DELETE FROM snownow_private.usage_daily_summary WHERE day_jst=row.day_jst;
  INSERT INTO snownow_private.usage_daily_summary
    SELECT row.day_jst,r.* FROM snownow_private.usage_rollup(row.day_jst) r;
  IF NOT EXISTS(SELECT 1 FROM snownow_private.usage_daily_summary
    WHERE day_jst=row.day_jst AND dimension='all' AND bucket='all' AND source_events=n)
    OR fingerprint IS DISTINCT FROM snownow_private.usage_digest(row.day_jst) THEN RAISE EXCEPTION 'USAGE_AGGREGATION_MISMATCH'; END IF;
  UPDATE snownow_private.usage_days SET aggregated_events=n,aggregate_hash=fingerprint,finalized_at=clock_timestamp() WHERE day_jst=row.day_jst;
  days_done:=days_done+1;
  IF row.day_jst<today-6 THEN
   -- No raw deletion is reached until rollup, count and digest verification all succeeded.
   DELETE FROM snownow_private.usage_events WHERE day_jst=row.day_jst;
   GET DIAGNOSTICS deleted=ROW_COUNT;
   IF deleted<>n THEN RAISE EXCEPTION 'USAGE_CLEANUP_MISMATCH'; END IF;
   UPDATE snownow_private.usage_days SET raw_events=0,cleaned_at=clock_timestamp() WHERE day_jst=row.day_jst;
   rows_removed:=rows_removed+deleted;
  END IF;
 END LOOP;
 DELETE FROM snownow_private.usage_days WHERE day_jst<today-89 AND raw_events=0
   AND (accepted_events=0 OR (finalized_at IS NOT NULL AND cleaned_at IS NOT NULL));
 RETURN jsonb_build_object('aggregated_days',days_done,'raw_rows_removed',rows_removed);
END;
$maintain$;

CREATE VIEW snownow_private.usage_report WITH(security_invoker=true) AS
 WITH live_days AS (SELECT DISTINCT day_jst FROM snownow_private.usage_events
   WHERE day_jst>=(statement_timestamp() AT TIME ZONE 'Asia/Tokyo')::date-89)
 SELECT d.day_jst,r.* FROM live_days d CROSS JOIN LATERAL snownow_private.usage_rollup(d.day_jst) r
 UNION ALL
 SELECT s.* FROM snownow_private.usage_daily_summary s
 WHERE s.day_jst>=(statement_timestamp() AT TIME ZONE 'Asia/Tokyo')::date-89
   AND NOT EXISTS(SELECT 1 FROM live_days d WHERE d.day_jst=s.day_jst);
REVOKE ALL ON snownow_private.usage_report FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION snownow_private.usage_rollup(date),snownow_private.usage_digest(date) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.record_usage_events(jsonb),public.maintain_usage_analytics() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_usage_events(jsonb),public.maintain_usage_analytics() TO service_role;
