-- STEP3 foundation only. No source seeds, network requests, jobs or master changes.
CREATE TABLE snownow_private.official_sources (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  resort_id integer NOT NULL REFERENCES public.resorts(id),
  source_url text NOT NULL CHECK (source_url ~ '^https://[^[:space:]]+$'),
  access_permission text NOT NULL DEFAULT 'unconfirmed'
    CHECK (access_permission IN ('unconfirmed','allowed','denied')),
  publication_permission text NOT NULL DEFAULT 'unconfirmed'
    CHECK (publication_permission IN ('unconfirmed','allowed','denied')),
  permission_scope text NOT NULL DEFAULT '',
  permission_checked_at timestamptz,
  enabled boolean NOT NULL DEFAULT false,
  adapter_key text,
  expected_publication_time time,
  UNIQUE (id, resort_id)
);
CREATE TABLE snownow_private.official_observations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id bigint NOT NULL,
  resort_id integer NOT NULL,
  observation_date date NOT NULL,
  observed_at timestamptz,
  published_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  location_kind text NOT NULL CHECK (location_kind IN ('summit','base','unspecified')),
  location_name text NOT NULL,
  source_url text NOT NULL CHECK (source_url ~ '^https://[^[:space:]]+$'),
  snowfall_period text,
  status text NOT NULL CHECK (status IN ('success','missing','failed','closed','stale')),
  new_snow_cm numeric CHECK (new_snow_cm >= 0),
  snow_depth_cm numeric CHECK (snow_depth_cm >= 0),
  temperature_c numeric,
  official_snow_quality text,
  failure_code text,
  FOREIGN KEY (source_id, resort_id) REFERENCES snownow_private.official_sources(id, resort_id),
  CHECK (observed_at IS NULL OR (observed_at AT TIME ZONE 'Asia/Tokyo')::date = observation_date),
  CHECK (status = 'success' OR (new_snow_cm IS NULL AND snow_depth_cm IS NULL
    AND temperature_c IS NULL AND official_snow_quality IS NULL))
);
CREATE INDEX official_observations_latest ON snownow_private.official_observations(source_id, fetched_at DESC, id DESC);
ALTER TABLE snownow_private.official_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE snownow_private.official_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON snownow_private.official_sources, snownow_private.official_observations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE snownow_private.official_sources_id_seq, snownow_private.official_observations_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA snownow_private TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON snownow_private.official_sources, snownow_private.official_observations TO service_role;
GRANT USAGE, SELECT ON SEQUENCE snownow_private.official_sources_id_seq, snownow_private.official_observations_id_seq TO service_role;
CREATE POLICY official_sources_service ON snownow_private.official_sources FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY official_observations_service ON snownow_private.official_observations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Deliberately owner-executed: public clients receive only this filtered projection.
-- Private permission notes, adapter settings, failure details and history stay private.
CREATE VIEW public.official_morning_conditions WITH (security_barrier = true) AS
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
   WHERE ob.source_id = s.id ORDER BY ob.fetched_at DESC, ob.id DESC LIMIT 1
 ) o ON true
 WHERE s.enabled AND s.publication_permission = 'allowed'
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
REVOKE ALL ON public.official_morning_conditions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.official_morning_conditions TO anon, authenticated;
