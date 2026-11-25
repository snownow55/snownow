-- Operator SQL Editor only. Never expose this query or its result through a public API.
BEGIN TRANSACTION READ ONLY;
SELECT r.id AS report_id,r.reason,r.status,r.created_at,r.reviewed_at,
 p.id AS post_id,p.resort,p.created_at AS posted_at,p.comment,
 EXISTS(SELECT 1 FROM snownow_private.hidden_posts h WHERE h.post_id=p.id) AS hidden,
 EXISTS(SELECT 1 FROM snownow_private.suspended_authors s WHERE s.user_id=p.user_id) AS author_suspended
FROM snownow_private.post_reports r JOIN snownow_private.snow_posts p ON p.id=r.post_id
ORDER BY (r.status='open') DESC,r.created_at ASC LIMIT 100;
COMMIT;
