-- Separate approval required. Does not enable extensions or alter existing jobs.
-- 15:10 UTC = 00:10 JST the following day. Only use when cron.timezone is UTC/GMT.
BEGIN;
DO $setup$
DECLARE requested_command text := 'SET statement_timeout = ''30s''; SELECT public.maintain_usage_analytics();';
BEGIN
 IF to_regnamespace('cron') IS NULL THEN RAISE EXCEPTION 'USAGE_CRON_EXTENSION_NOT_AVAILABLE'; END IF;
 IF coalesce(current_setting('cron.timezone',true),'GMT') NOT IN ('UTC','GMT','Etc/UTC') THEN
  RAISE EXCEPTION 'USAGE_CRON_TIMEZONE_REQUIRES_REVIEW'; END IF;
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='snowviking-usage-maintenance') THEN
  IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='snowviking-usage-maintenance'
    AND schedule='10 15 * * *' AND cron.job.command=requested_command AND active) THEN
   RAISE EXCEPTION 'USAGE_EXISTING_CRON_REQUIRES_REVIEW'; END IF;
 ELSE PERFORM cron.schedule('snowviking-usage-maintenance','10 15 * * *',requested_command); END IF;
END;
$setup$;
SELECT jobid,jobname,schedule,active FROM cron.job WHERE jobname='snowviking-usage-maintenance';
COMMIT;
