-- Only extend the existing new-post RPC allow-list; preserve its other logic/ACLs.
-- Apply in a transaction. Existing storage and edit validation already allow 湿雪.
GRANT CREATE ON SCHEMA public TO snownow_post_writer;
SET LOCAL ROLE snownow_post_writer;
DO $wet_snow$
DECLARE
  definition text;
  old_types constant text := $types$('パウダー','圧雪','硬めの圧雪','アイスバーン','ザラメ','シャバ雪・べちゃ雪','みぞれ・雨')$types$;
  new_types constant text := $types$('パウダー','圧雪','硬めの圧雪','アイスバーン','湿雪','ザラメ','シャバ雪・べちゃ雪','みぞれ・雨')$types$;
BEGIN
  SELECT pg_get_functiondef(to_regprocedure('public.submit_snow_post(jsonb)'))
    INTO definition;
  IF definition IS NULL OR
     length(definition) - length(replace(definition, old_types, '')) <> length(old_types) THEN
    RAISE EXCEPTION 'UNEXPECTED_SUBMIT_SNOW_TYPE_VALIDATION';
  END IF;
  EXECUTE replace(definition, old_types, new_types);
END
$wet_snow$;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM snownow_post_writer;
