-- Run against the synthetic development profile after all migrations.
BEGIN;
DO $test$
DECLARE
  resort integer := (SELECT id FROM public.resorts WHERE name = 'オーンズ');
  source bigint;
  endpoint constant text := 'https://fixture.invalid/snow';
  collected timestamptz := now();
  report jsonb := jsonb_build_object(
    'observation_date', (collected AT TIME ZONE 'Asia/Tokyo')::date,
    'observed_at', collected, 'fetched_at', collected,
    'location_kind', 'summit', 'location_name', 'Synthetic summit', 'status', 'success',
    'new_snow_cm', 13.5, 'snow_depth_cm', 125, 'temperature_c', -5, 'snowfall_period', '24時間'
  );
  failure jsonb := (report - ARRAY['new_snow_cm', 'snow_depth_cm', 'temperature_c', 'observed_at'])
    || jsonb_build_object('status', 'failed', 'failure_code', 'http');
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO snownow_private.official_sources(resort_id, source_url, adapter_key, enabled, access_permission, publication_permission)
    VALUES (resort, endpoint, 'json-v1', true, 'allowed', 'unconfirmed') RETURNING id INTO source;
  IF public.store_official_observation(source, resort, endpoint, 'json-v1', report) <> 'permission_changed' THEN
    RAISE EXCEPTION 'Unconfirmed publication allowed a write';
  END IF;
  UPDATE snownow_private.official_sources SET publication_permission = 'allowed' WHERE id = source;
  IF (public.get_official_collection_source(source)->>'source_url') IS DISTINCT FROM endpoint THEN
    RAISE EXCEPTION 'Collector RPC did not read the expected source';
  END IF;
  IF public.store_official_observation(source, resort, endpoint, 'json-v1', report) <> 'saved' THEN
    RAISE EXCEPTION 'Collector RPC did not save the observation';
  END IF;
  IF public.store_official_observation(source, resort, endpoint, 'json-v1',
        report || jsonb_build_object('fetched_at', collected + interval '1 millisecond')) <> 'duplicate' THEN
    RAISE EXCEPTION 'Collector RPC did not identify the duplicate';
  END IF;
  IF (SELECT count(*) FROM snownow_private.official_observations WHERE source_id = source) <> 1 THEN
    RAISE EXCEPTION 'Collector RPC did not retain exactly one distinct observation';
  END IF;
  IF public.store_official_observation(source, resort, endpoint, 'json-v1',
        report || jsonb_build_object('observed_at', collected - interval '1 millisecond',
          'fetched_at', collected + interval '2 milliseconds', 'new_snow_cm', 99)) <> 'superseded' THEN
    RAISE EXCEPTION 'An older same-day reading displaced the current observation';
  END IF;

  SET LOCAL ROLE anon;
  IF (SELECT row(status, new_snow_cm, snow_depth_cm, temperature_c, snowfall_period)
      FROM public.official_morning_conditions WHERE resort_id = resort)
      IS DISTINCT FROM row('success'::text, 13.5::numeric, 125::numeric, -5::numeric, '24時間'::text) THEN
    RAISE EXCEPTION 'Approved observation was not correctly published';
  END IF;
  BEGIN
    PERFORM public.get_official_collection_source(source);
    RAISE EXCEPTION 'Anonymous collector RPC access';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.store_official_observation(source, resort, endpoint, 'json-v1', report);
    RAISE EXCEPTION 'Authenticated user could write through collector RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  SET LOCAL ROLE service_role;
  IF public.store_official_observation(source, resort, endpoint, 'json-v1', failure) <> 'saved' THEN
    RAISE EXCEPTION 'Fetch failure state not stored';
  END IF;
  SET LOCAL ROLE anon;
  IF (SELECT row(status, new_snow_cm) FROM public.official_morning_conditions WHERE resort_id = resort)
      IS DISTINCT FROM row('failed'::text, NULL::numeric) THEN
    RAISE EXCEPTION 'A failed fetch exposed an obsolete value';
  END IF;

  SET LOCAL ROLE service_role;
  -- Revoke either permission independently, leaving the other flag set.
  UPDATE snownow_private.official_sources SET access_permission = 'denied' WHERE id = source;
  IF public.store_official_observation(source, resort, endpoint, 'json-v1', report) <> 'permission_changed' THEN
    RAISE EXCEPTION 'A result arriving after access was revoked was saved';
  END IF;
  SET LOCAL ROLE anon;
  IF EXISTS (SELECT FROM public.official_morning_conditions WHERE resort_id = resort) THEN
    RAISE EXCEPTION 'Access revocation did not hide the source';
  END IF;
  SET LOCAL ROLE service_role;
  UPDATE snownow_private.official_sources SET access_permission = 'allowed', publication_permission = 'denied' WHERE id = source;
  IF public.store_official_observation(source, resort, endpoint, 'json-v1', report) <> 'permission_changed' THEN
    RAISE EXCEPTION 'A result arriving after publication was revoked was saved';
  END IF;
  SET LOCAL ROLE authenticated;
  IF EXISTS (SELECT FROM public.official_morning_conditions WHERE resort_id = resort) THEN
    RAISE EXCEPTION 'Publication revocation did not hide the source';
  END IF;
  SET LOCAL ROLE service_role;
  UPDATE snownow_private.official_sources
    SET publication_permission = 'allowed', source_url = 'https://fixture.invalid/new-snow' WHERE id = source;
  IF public.store_official_observation(source, resort, endpoint, 'json-v1', report) <> 'permission_changed' THEN
    RAISE EXCEPTION 'A result from a replaced endpoint was saved';
  END IF;
  SET LOCAL ROLE anon;
  IF (SELECT row(status, source_url) FROM public.official_morning_conditions WHERE resort_id = resort)
      IS DISTINCT FROM row('missing'::text, 'https://fixture.invalid/new-snow'::text) THEN
    RAISE EXCEPTION 'Replaced endpoint exposed its old observation';
  END IF;
  RESET ROLE;
END;
$test$;

DO $rss$
DECLARE
  resort integer := (SELECT id FROM public.resorts WHERE name = '北長沼スキー場');
  source bigint;
  endpoint constant text := 'https://fixture.invalid/feed/';
  article constant text := 'https://fixture.invalid/posts/about-snow';
  collected timestamptz := now();
  report jsonb := jsonb_build_object(
    'observation_date', (collected AT TIME ZONE 'Asia/Tokyo')::date,
    'published_at', collected, 'fetched_at', collected, 'reference_url', article,
    'location_kind', 'unspecified', 'location_name', 'Synthetic', 'status', 'success', 'new_snow_cm', 0
  );
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO snownow_private.official_sources(resort_id, source_url, adapter_key, enabled, access_permission, publication_permission)
    VALUES (resort, endpoint, 'kitanaganuma-rss', true, 'allowed', 'allowed') RETURNING id INTO source;
  IF (public.get_official_collection_source(source)->>'resort_name') IS DISTINCT FROM '北長沼スキー場' THEN
    RAISE EXCEPTION 'Collection source did not resolve the master identity';
  END IF;
  IF public.store_official_observation(source, resort, endpoint, 'kitanaganuma-rss', report) <> 'saved' THEN
    RAISE EXCEPTION 'RSS observation was not stored';
  END IF;
  IF (SELECT source_url FROM snownow_private.official_observations WHERE source_id = source)
      IS DISTINCT FROM endpoint THEN
    RAISE EXCEPTION 'RSS permalink overwrote the approved feed endpoint';
  END IF;
  BEGIN
    PERFORM public.store_official_observation(source, resort, endpoint, 'kitanaganuma-rss',
      report || jsonb_build_object('reference_url', 'https://elsewhere.invalid/article'));
    RAISE EXCEPTION 'Foreign-origin article URL was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  SET LOCAL ROLE anon;
  IF (SELECT row(source_url, new_snow_cm) FROM public.official_morning_conditions WHERE resort_id = resort)
      IS DISTINCT FROM row(article, 0::numeric) THEN
    RAISE EXCEPTION 'Published RSS observation did not preserve permalink or actual zero';
  END IF;
  SET LOCAL ROLE service_role;
  UPDATE snownow_private.official_sources SET publication_permission = 'denied' WHERE id = source;
  SET LOCAL ROLE authenticated;
  IF EXISTS (SELECT FROM public.official_morning_conditions WHERE resort_id = resort) THEN
    RAISE EXCEPTION 'RSS observation remained visible after publication revocation';
  END IF;
  RESET ROLE;
END;
$rss$;
ROLLBACK;
