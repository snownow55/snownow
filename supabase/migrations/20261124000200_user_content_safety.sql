-- Depends on foundation + owner-post-management + daily visibility, NOT collection/analytics.
-- Run in one migration transaction. Preserves posts, timestamps and cooldowns.
DO $$BEGIN
 IF current_user<>'postgres' OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN RAISE EXCEPTION 'MODERATION_REVIEWED_MIGRATION_ROLE_REQUIRED'; END IF;
 IF to_regprocedure('snownow_private.current_user_id()') IS NULL OR to_regprocedure('public.edit_snow_post(bigint,jsonb)') IS NULL THEN RAISE EXCEPTION 'MODERATION_DEPENDENCIES_MISSING'; END IF;
END$$;
CREATE TABLE snownow_private.user_blocks(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 blocker uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 blocked uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(blocker,blocked),CHECK(blocker<>blocked)
);
CREATE TABLE snownow_private.post_reports(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 reporter uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 post_id bigint NOT NULL REFERENCES snownow_private.snow_posts(id) ON DELETE CASCADE,
 reason text NOT NULL CHECK(reason IN('abuse','spam','personal_information','dangerous','other')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','reviewed','dismissed')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),reviewed_at timestamptz,
 UNIQUE(reporter,post_id)
);
CREATE INDEX post_reports_queue ON snownow_private.post_reports(status,created_at);
CREATE TABLE snownow_private.hidden_posts(post_id bigint PRIMARY KEY REFERENCES snownow_private.snow_posts(id) ON DELETE CASCADE,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE snownow_private.suspended_authors(user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE snownow_private.content_filter_terms(term text PRIMARY KEY CHECK(length(term) BETWEEN 2 AND 40));
-- Minimal configurable rejection filter; operator review is still required.
INSERT INTO snownow_private.content_filter_terms VALUES('殺す'),('死ね'),('児童ポルノ');
ALTER TABLE snownow_private.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE snownow_private.post_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE snownow_private.hidden_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE snownow_private.suspended_authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE snownow_private.content_filter_terms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON snownow_private.user_blocks,snownow_private.post_reports,snownow_private.hidden_posts,snownow_private.suspended_authors,snownow_private.content_filter_terms FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE snownow_private.post_reports_id_seq FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION snownow_private.reader_can_see_post(p_post bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET row_security=off AS $$
 SELECT EXISTS(SELECT 1 FROM snownow_private.snow_posts p WHERE p.id=p_post
 AND NOT EXISTS(SELECT 1 FROM snownow_private.hidden_posts h WHERE h.post_id=p.id)
 AND NOT EXISTS(SELECT 1 FROM snownow_private.suspended_authors s WHERE s.user_id=p.user_id)
 AND NOT EXISTS(SELECT 1 FROM snownow_private.user_blocks b WHERE b.blocker=snownow_private.current_user_id() AND b.blocked=p.user_id))
$$;
REVOKE ALL ON FUNCTION snownow_private.reader_can_see_post(bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION snownow_private.reader_can_see_post(bigint) TO anon,authenticated;
CREATE POLICY posts_safety_read ON snownow_private.snow_posts AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING(snownow_private.reader_can_see_post(id));

CREATE FUNCTION snownow_private.enforce_post_safety() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$BEGIN
 IF EXISTS(SELECT 1 FROM snownow_private.suspended_authors WHERE user_id=NEW.user_id) THEN
  RAISE EXCEPTION 'Posting unavailable' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM snownow_private.content_filter_terms WHERE position(term IN regexp_replace(lower(coalesce(NEW.comment,'')),'[[:space:][:punct:]]','','g'))>0) THEN
  RAISE EXCEPTION 'Comment requires revision' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION snownow_private.enforce_post_safety() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER post_content_safety BEFORE INSERT OR UPDATE ON snownow_private.snow_posts FOR EACH ROW EXECUTE FUNCTION snownow_private.enforce_post_safety();

CREATE FUNCTION public.report_snow_post(p_post bigint,p_reason text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE actor uuid:=snownow_private.current_user_id();author uuid;
BEGIN
 IF actor IS NULL OR NOT snownow_private.posting_user_verified() THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_reason IS NULL OR p_reason NOT IN('abuse','spam','personal_information','dangerous','other') THEN RAISE EXCEPTION 'Invalid reason' USING ERRCODE='22023'; END IF;
 SELECT user_id INTO author FROM snownow_private.snow_posts WHERE id=p_post;
 IF author IS NULL OR author=actor OR NOT snownow_private.reader_can_see_post(p_post) THEN RAISE EXCEPTION 'Post unavailable' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,241124));
 IF EXISTS(SELECT 1 FROM snownow_private.post_reports WHERE reporter=actor AND post_id=p_post) THEN RETURN true; END IF;
 IF (SELECT count(*) FROM snownow_private.post_reports WHERE reporter=actor AND created_at>=date_trunc('day',clock_timestamp() AT TIME ZONE 'Asia/Tokyo') AT TIME ZONE 'Asia/Tokyo')>=20 THEN RAISE EXCEPTION 'Report limit reached' USING ERRCODE='22023'; END IF;
 INSERT INTO snownow_private.post_reports(reporter,post_id,reason) VALUES(actor,p_post,p_reason);
 RETURN true;
END$$;
CREATE FUNCTION public.block_snow_post_author(p_post bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE actor uuid:=snownow_private.current_user_id();author uuid;
BEGIN
 IF actor IS NULL OR NOT snownow_private.posting_user_verified() THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT user_id INTO author FROM snownow_private.snow_posts WHERE id=p_post;
 IF author IS NULL OR author=actor THEN RAISE EXCEPTION 'Post unavailable' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,241124));
 IF EXISTS(SELECT 1 FROM snownow_private.user_blocks WHERE blocker=actor AND blocked=author) THEN RETURN true; END IF;
 IF NOT snownow_private.reader_can_see_post(p_post) OR (SELECT count(*) FROM snownow_private.user_blocks WHERE blocker=actor)>=500 THEN RAISE EXCEPTION 'Block unavailable' USING ERRCODE='22023'; END IF;
 INSERT INTO snownow_private.user_blocks(blocker,blocked) VALUES(actor,author);
 RETURN true;
END$$;
CREATE FUNCTION public.my_blocked_authors() RETURNS TABLE(block_id uuid,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET row_security=off AS $$
 SELECT id,created_at FROM snownow_private.user_blocks WHERE blocker=snownow_private.current_user_id() ORDER BY created_at DESC
$$;
CREATE FUNCTION public.unblock_snow_author(p_block uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE n integer;BEGIN
 IF snownow_private.current_user_id() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 DELETE FROM snownow_private.user_blocks WHERE id=p_block AND blocker=snownow_private.current_user_id();GET DIAGNOSTICS n=ROW_COUNT;RETURN n=1;
END$$;
REVOKE ALL ON FUNCTION public.report_snow_post(bigint,text),public.block_snow_post_author(bigint),public.my_blocked_authors(),public.unblock_snow_author(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.report_snow_post(bigint,text),public.block_snow_post_author(bigint),public.my_blocked_authors(),public.unblock_snow_author(uuid) TO authenticated;

-- SQL Editor/operator only. There is no browser admin key or public admin endpoint.
CREATE FUNCTION snownow_private.review_post_report(p_report bigint,p_action text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE target bigint;author uuid;BEGIN
 SELECT post_id INTO target FROM snownow_private.post_reports WHERE id=p_report FOR UPDATE;
 IF target IS NULL THEN RAISE EXCEPTION 'Report unavailable'; END IF;
 SELECT user_id INTO author FROM snownow_private.snow_posts WHERE id=target;
 IF p_action='hide' THEN INSERT INTO snownow_private.hidden_posts(post_id) VALUES(target) ON CONFLICT DO NOTHING;
 ELSIF p_action='suspend' THEN INSERT INTO snownow_private.suspended_authors(user_id) VALUES(author) ON CONFLICT DO NOTHING;
 ELSIF p_action='restore_post' THEN DELETE FROM snownow_private.hidden_posts WHERE post_id=target;
 ELSIF p_action='resume_author' THEN DELETE FROM snownow_private.suspended_authors WHERE user_id=author;
 ELSIF p_action IS DISTINCT FROM 'dismiss' THEN RAISE EXCEPTION 'Invalid action'; END IF;
 UPDATE snownow_private.post_reports SET status=CASE WHEN p_action='dismiss' THEN 'dismissed' ELSE 'reviewed' END,reviewed_at=clock_timestamp() WHERE id=p_report;
 RETURN true;
END$$;
REVOKE ALL ON FUNCTION snownow_private.review_post_report(bigint,text) FROM PUBLIC,anon,authenticated,service_role;
