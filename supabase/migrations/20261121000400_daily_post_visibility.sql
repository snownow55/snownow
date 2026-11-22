-- Depends on 20261121000300_owner_post_management.
-- Keep all stored posts and owner RPCs; only public reads are restricted.
CREATE OR REPLACE VIEW public.snow_posts WITH (security_invoker=true) AS
SELECT id,resort,area,snow_type,snowfall,roughness,crowd,comment,created_at,updated_at
FROM snownow_private.snow_posts
WHERE created_at >= (
  date_trunc('day', statement_timestamp() AT TIME ZONE 'Asia/Tokyo')
  AT TIME ZONE 'Asia/Tokyo'
)
AND created_at < (
  (date_trunc('day', statement_timestamp() AT TIME ZONE 'Asia/Tokyo') + interval '1 day')
  AT TIME ZONE 'Asia/Tokyo'
);
