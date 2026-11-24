-- Administrator-only report. Run after the reviewed migration, never with a client key.
BEGIN TRANSACTION READ ONLY;
SELECT day_jst,dimension,bucket,page_views,unique_ids,pwa_launches,pwa_unique_ids,sessions,detected_installs,
 round(100.0*pwa_unique_ids/nullif(unique_ids,0),2) AS pwa_usage_percent
FROM snownow_private.usage_report ORDER BY day_jst DESC,dimension,bucket;
SELECT day_jst,accepted_events,raw_events,rejected_events,aggregated_events,finalized_at,cleaned_at,
 CASE WHEN raw_events>0 AND day_jst<(statement_timestamp() AT TIME ZONE 'Asia/Tokyo')::date-6
 THEN 'RETENTION_PENDING_AGGREGATION' ELSE 'OK' END AS retention_status
FROM snownow_private.usage_days ORDER BY day_jst DESC;
SELECT pg_size_pretty(sum(pg_total_relation_size(t))::bigint) AS analytics_tables_including_indexes,
 sum(pg_total_relation_size(t))::bigint AS analytics_bytes
FROM unnest(ARRAY['snownow_private.usage_events'::regclass,'snownow_private.usage_days'::regclass,'snownow_private.usage_daily_summary'::regclass]) t;
COMMIT;
