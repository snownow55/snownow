"use client";
import { Brand, PageShell } from "@/components/ui";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useResortMaster } from "@/lib/use-resort-master";
import { postUrl, regionUrl } from "@/lib/resort-master";
type SnowPost = {
  id: number;
  resort: string;
  area: string;
  snowType: string;
  snowfall: string;
  roughness: string;
  crowd: string;
  comment: string;
  createdAt: string;
  timeAgo: string;
};

  function getTimeAgo(createdAt: string) {
    const minutes = Math.floor(
      (Date.now() - new Date(createdAt).getTime()) / 60000
    );

    if (minutes < 1) return "たった今";
    if (minutes < 60) return `${minutes}分前`;

    const hours = Math.floor(minutes / 60);

    if (hours < 24) return `${hours}時間前`;

    return `${Math.floor(hours / 24)}日前`;
  }


export default function ResortPage() {
  const { name: segment } = useParams<{ name: string }>();
  let resortName = "";
  try { resortName = decodeURIComponent(segment); } catch { /* Invalid URL: no master match. */ }
  const master = useResortMaster();
  const resort = master.data?.resorts.find((item) => item.name === resortName);
  const region = master.data?.regions.find((item) => item.code === resort?.region_code);
  const canonicalName = resort?.name;

  const [postState, setPostState] = useState<{ name: string; posts: SnowPost[]; error: string }>({ name: "", posts: [], error: "" });
  const posts = postState.name === canonicalName ? postState.posts : [];
  const postsLoading = postState.name !== canonicalName;
  const postsError = postState.name === canonicalName ? postState.error : "";

 useEffect(() => {
  if (!canonicalName) return;
  let active = true;
  async function loadPosts() {
    if (!supabase) throw new Error("Unavailable");
    const { data, error } = await supabase
      .from("snow_posts")
      .select("id,resort,area,snow_type,snowfall,roughness,crowd,comment,created_at")
      .eq("resort", canonicalName)
      .order("created_at", { ascending: false });

    if (error || !Array.isArray(data)) throw new Error("Post read failed");

    const formattedPosts: SnowPost[] = data.map((post) => ({
      id: post.id,
      resort: post.resort,
      area: post.area,
      snowType: post.snow_type,
      snowfall: post.snowfall,
      roughness: post.roughness,
      crowd: post.crowd,
      comment: post.comment,
      createdAt: post.created_at,
      timeAgo: getTimeAgo(post.created_at),
    }));

    if (active) setPostState({ name: canonicalName!, posts: formattedPosts, error: "" });
  }

  loadPosts().catch(() => {
    if (active) setPostState({ name: canonicalName, posts: [], error: "投稿情報を取得できませんでした。" });
  });
  return () => { active = false; };
}, [canonicalName]);

  if (master.loading) return <p role="status" className="p-6">スキー場を読み込んでいます…</p>;
  if (master.error) return <PageShell className="p-6">
    <p role="alert" className="ui-error">{master.error}</p>
    <button className="min-h-11 py-3 text-brand" onClick={master.retry}>再読み込み</button>
    <Link className="block py-3 text-brand" href="/">スキー場一覧へ戻る</Link>
  </PageShell>;
  if (!resort) return <PageShell className="p-6">
    <h1 className="text-xl font-bold">指定されたスキー場が見つかりません</h1>
    <Link className="block py-3 text-brand" href="/">スキー場一覧へ戻る</Link>
  </PageShell>;

  return (
    <PageShell>
      <div className="mx-auto max-w-md px-5 py-8">

        <Link
          href={regionUrl(resort.region_code)}
          className="text-sm font-semibold text-brand"
        >
          ← スキー場一覧
        </Link>

        <header className="mb-8 mt-6">
          <div className="mb-3"><Brand /></div>

          <h1 className="text-3xl font-bold break-words">
            {resort.display_name}
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            {region?.name}・ユーザーの現地投稿
          </p>
        </header>

        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">
            最新投稿
          </h2>

          <span className="text-xs text-slate-500">
            {posts.length}件
          </span>
        </div>

        {postsLoading ? <p role="status">投稿情報を読み込んでいます…</p> : postsError ? <p role="alert" className="ui-error">{postsError}</p> : posts.length === 0 ? (
          <div className="ui-card p-6 text-center">
            <p className="font-semibold">
              まだ投稿がありません
            </p>

            <p className="mt-2 text-sm text-slate-600">
              現地から最初の速報を投稿しよう
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <article
                key={post.id}
                className="ui-card p-5"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <p className="font-bold">
                      {post.area}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {post.timeAgo}
                    </p>
                  </div>

                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">
                      雪質
                    </span>
                    <span>{post.snowType}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-600">
                      営業開始後の降雪
                    </span>
                    <span>{post.snowfall}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-600">
                      荒れ具合
                    </span>
                    <span>{post.roughness}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-600">
                      混雑
                    </span>
                    <span>{post.crowd}</span>
                  </div>
                </div>

                {post.comment && (
                  <div className="mt-4 rounded-xl bg-brand-soft p-3">
                    <p className="text-sm text-slate-600">
                      「{post.comment}」
                    </p>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        {resort.is_active ? <Link
          href={postUrl(resort.name, resort.region_code, "detail")}
      
          className="ui-primary mt-6 w-full"
        >
          ＋ このスキー場の情報を投稿
        </Link> : <p role="status" className="mt-6 ui-error">現在はこのスキー場への投稿を受け付けていません。</p>}
      </div>
    </PageShell>
  );
}
