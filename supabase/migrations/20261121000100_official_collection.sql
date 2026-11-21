-- Service-only collection against the existing source and observation tables.
CREATE FUNCTION public.get_official_collection_source(p_source_id bigint)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', s.id, 'resort_id', s.resort_id, 'source_url', s.source_url, 'adapter_key', s.adapter_key,
    'enabled', s.enabled, 'access_permission', s.access_permission, 'publication_permission', s.publication_permission
  )
  FROM snownow_private.official_sources s
  WHERE s.id = p_source_id;
$$;

CREATE FUNCTION public.store_official_observation(
  p_source_id bigint, p_resort_id integer, p_source_url text, p_adapter_key text, p_observation jsonb
)
RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  source snownow_private.official_sources%ROWTYPE;
  incoming snownow_private.official_observations%ROWTYPE;
  latest snownow_private.official_observations%ROWTYPE;
BEGIN
  -- Serialize writes and permission edits for this source. The source configuration
  -- must still match the snapshot taken just before the HTTP request.
  SELECT * INTO source FROM snownow_private.official_sources WHERE id = p_source_id FOR UPDATE;
  IF NOT FOUND OR NOT source.enabled OR source.access_permission <> 'allowed'
      OR source.publication_permission <> 'allowed'
      OR source.resort_id IS DISTINCT FROM p_resort_id
      OR source.source_url IS DISTINCT FROM p_source_url
      OR source.adapter_key IS NULL OR source.adapter_key IS DISTINCT FROM p_adapter_key THEN
    RETURN 'permission_changed';
  END IF;

  incoming := jsonb_populate_record(NULL::snownow_private.official_observations, p_observation);
  incoming.id := NULL;
  incoming.source_id := source.id;
  incoming.resort_id := source.resort_id;
  incoming.source_url := source.source_url;
  IF incoming.fetched_at IS NULL OR incoming.fetched_at > clock_timestamp() + interval '30 seconds'
      OR incoming.observed_at > incoming.fetched_at OR incoming.published_at > incoming.fetched_at
      OR incoming.observation_date IS NULL
      OR incoming.observation_date > (incoming.fetched_at AT TIME ZONE 'Asia/Tokyo')::date
      OR (incoming.status = 'success' AND (
        incoming.observation_date <> (incoming.fetched_at AT TIME ZONE 'Asia/Tokyo')::date
        OR (incoming.published_at AT TIME ZONE 'Asia/Tokyo')::date <> incoming.observation_date
        OR num_nonnulls(incoming.new_snow_cm, incoming.snow_depth_cm, incoming.temperature_c, incoming.official_snow_quality) = 0
      )) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid official observation';
  END IF;

  SELECT * INTO latest FROM snownow_private.official_observations
  WHERE source_id = source.id AND source_url = source.source_url
  ORDER BY fetched_at DESC, id DESC LIMIT 1;
  IF FOUND THEN
    IF latest.fetched_at > incoming.fetched_at THEN
      RETURN 'superseded';
    END IF;
    IF latest.status = 'success' AND incoming.status = 'success'
        AND coalesce(latest.observed_at, latest.published_at) > coalesce(incoming.observed_at, incoming.published_at) THEN
      RETURN 'superseded';
    END IF;
    IF (to_jsonb(latest) - ARRAY['id', 'fetched_at']) = (to_jsonb(incoming) - ARRAY['id', 'fetched_at']) THEN
      RETURN 'duplicate';
    END IF;
  END IF;

  INSERT INTO snownow_private.official_observations (
    source_id, resort_id, observation_date, observed_at, published_at, fetched_at,
    location_kind, location_name, source_url, snowfall_period, status, new_snow_cm, snow_depth_cm,
    temperature_c, official_snow_quality, failure_code
  ) VALUES (
    incoming.source_id, incoming.resort_id, incoming.observation_date, incoming.observed_at,
    incoming.published_at, incoming.fetched_at, incoming.location_kind, incoming.location_name, incoming.source_url,
    incoming.snowfall_period, incoming.status, incoming.new_snow_cm, incoming.snow_depth_cm,
    incoming.temperature_c, incoming.official_snow_quality, incoming.failure_code
  );
  RETURN 'saved';
END;
$$;

REVOKE ALL ON FUNCTION public.get_official_collection_source(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_official_observation(bigint, integer, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_official_collection_source(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.store_official_observation(bigint, integer, text, text, jsonb) TO service_role;

-- Drop neither the existing view nor its ACL. Hide revoked sources and observations
-- from a URL that is no longer registered for that source.
CREATE OR REPLACE VIEW public.official_morning_conditions WITH (security_barrier = true) AS
WITH candidates AS (
 SELECT s.resort_id, o.id, o.observation_date, o.observed_at, o.published_at,
   o.fetched_at, o.location_kind, o.location_name, o.source_url, o.snowfall_period,
   o.status, o.new_snow_cm, o.snow_depth_cm, o.temperature_c, o.official_snow_quality,
   s.source_url AS fallback_url,
   CASE
     WHEN o.id IS NULL THEN 'missing'
     WHEN o.observation_date <> (statement_timestamp() AT TIME ZONE 'Asia/Tokyo')::date
       OR (o.fetched_at AT TIME ZONE 'Asia/Tokyo')::date <> o.observation_date
       OR o.fetched_at > statement_timestamp()
       OR o.observed_at > statement_timestamp()
       OR (o.published_at IS NOT NULL AND (
         (o.published_at AT TIME ZONE 'Asia/Tokyo')::date <> o.observation_date
         OR o.published_at > statement_timestamp())) THEN 'stale'
     ELSE o.status
   END AS effective_status
 FROM snownow_private.official_sources s
 JOIN public.resorts r ON r.id = s.resort_id AND r.is_active
 LEFT JOIN LATERAL (
   SELECT ob.* FROM snownow_private.official_observations ob
   WHERE ob.source_id = s.id AND ob.source_url = s.source_url ORDER BY ob.fetched_at DESC, ob.id DESC LIMIT 1
 ) o ON true
 WHERE s.enabled AND s.access_permission = 'allowed' AND s.publication_permission = 'allowed'
   AND r.name <> '和寒東山スキー場'
), chosen AS (
 SELECT DISTINCT ON (resort_id) * FROM candidates
 ORDER BY resort_id,
   CASE WHEN effective_status = 'success' THEN 0 ELSE 1 END,
   CASE location_kind WHEN 'summit' THEN 0 WHEN 'base' THEN 1 ELSE 2 END,
   fetched_at DESC NULLS LAST, id DESC NULLS LAST
)
SELECT resort_id, effective_status AS status,
 CASE WHEN effective_status = 'success' THEN observation_date END AS observation_date,
 CASE WHEN effective_status = 'success' THEN observed_at END AS observed_at,
 CASE WHEN effective_status = 'success' THEN published_at END AS published_at,
 CASE WHEN effective_status = 'success' THEN fetched_at END AS fetched_at,
 CASE WHEN effective_status = 'success' THEN location_kind END AS location_kind,
 CASE WHEN effective_status = 'success' THEN location_name END AS location_name,
 coalesce(source_url, fallback_url) AS source_url,
 CASE WHEN effective_status = 'success' THEN snowfall_period END AS snowfall_period,
 CASE WHEN effective_status = 'success' THEN new_snow_cm END AS new_snow_cm,
 CASE WHEN effective_status = 'success' THEN snow_depth_cm END AS snow_depth_cm,
 CASE WHEN effective_status = 'success' THEN temperature_c END AS temperature_c,
 CASE WHEN effective_status = 'success' THEN official_snow_quality END AS official_snow_quality
FROM chosen;
