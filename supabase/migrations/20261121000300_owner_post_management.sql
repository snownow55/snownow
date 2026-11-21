-- Owner-only maintenance. New-post RPC and cooldown history are unchanged.
ALTER TABLE snownow_private.snow_posts ADD COLUMN updated_at timestamptz;
CREATE OR REPLACE VIEW public.snow_posts WITH(security_invoker=true) AS
SELECT id,resort,area,snow_type,snowfall,roughness,crowd,comment,created_at,updated_at
FROM snownow_private.snow_posts;
GRANT SELECT(updated_at) ON snownow_private.snow_posts TO anon,authenticated;
GRANT SELECT(id,user_id) ON snownow_private.snow_posts TO snownow_post_writer;
GRANT UPDATE(area,snow_type,snowfall,roughness,crowd,comment,updated_at),DELETE
 ON snownow_private.snow_posts TO snownow_post_writer;
CREATE POLICY writer_own_read ON snownow_private.snow_posts FOR SELECT TO snownow_post_writer
 USING(user_id=snownow_private.current_user_id());
CREATE POLICY writer_own_update ON snownow_private.snow_posts FOR UPDATE TO snownow_post_writer
 USING(user_id=snownow_private.current_user_id()) WITH CHECK(user_id=snownow_private.current_user_id());
CREATE POLICY writer_own_delete ON snownow_private.snow_posts FOR DELETE TO snownow_post_writer
 USING(user_id=snownow_private.current_user_id());
CREATE FUNCTION public.my_post_ids() RETURNS bigint[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(array_agg(id),'{}'::bigint[]) FROM snownow_private.snow_posts
 WHERE user_id=snownow_private.current_user_id()
$$;
CREATE FUNCTION public.edit_snow_post(post_id bigint,payload jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE affected integer; BEGIN
 IF snownow_private.current_user_id() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid edit'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(payload))<>6 OR EXISTS(
 SELECT 1 FROM unnest(ARRAY['area','snow_type','snowfall','roughness','crowd','comment']) k
 WHERE jsonb_typeof(payload->k) IS DISTINCT FROM 'string') THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid edit'; END IF;
 IF payload->>'area' NOT IN ('山頂・上部','中腹','山麓・下部','全体')
 OR payload->>'snow_type' NOT IN ('パウダー','圧雪','硬めの圧雪','アイスバーン','湿雪','ザラメ','シャバ雪・べちゃ雪','みぞれ・雨')
 OR payload->>'snowfall' NOT IN ('ほぼ無し','うっすら積もった','そこそこ積もった','かなり積もった','分からない')
 OR payload->>'roughness' NOT IN ('きれい','少し荒れている','かなり荒れている','ボコボコ')
 OR payload->>'crowd' NOT IN ('空いている','普通','混んでいる')
 OR snownow_private.utf16_length(payload->>'comment')>1000 THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid post'; END IF;

 UPDATE snownow_private.snow_posts SET area=payload->>'area',snow_type=payload->>'snow_type',
 snowfall=payload->>'snowfall',roughness=payload->>'roughness',crowd=payload->>'crowd',
 comment=payload->>'comment',updated_at=clock_timestamp()
 WHERE id=post_id AND user_id=snownow_private.current_user_id();
 GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN affected=1;
END $$;
CREATE FUNCTION public.delete_snow_post(post_id bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE affected integer; BEGIN
 IF snownow_private.current_user_id() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 DELETE FROM snownow_private.snow_posts WHERE id=post_id AND user_id=snownow_private.current_user_id();
 GET DIAGNOSTICS affected=ROW_COUNT; RETURN affected=1;
END $$;
REVOKE ALL ON FUNCTION public.my_post_ids(),public.edit_snow_post(bigint,jsonb),public.delete_snow_post(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.my_post_ids(),public.edit_snow_post(bigint,jsonb),public.delete_snow_post(bigint) TO authenticated;
GRANT CREATE ON SCHEMA public TO snownow_post_writer;
ALTER FUNCTION public.my_post_ids() OWNER TO snownow_post_writer;
ALTER FUNCTION public.edit_snow_post(bigint,jsonb) OWNER TO snownow_post_writer;
ALTER FUNCTION public.delete_snow_post(bigint) OWNER TO snownow_post_writer;
REVOKE CREATE ON SCHEMA public FROM snownow_post_writer;
