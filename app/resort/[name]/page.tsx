"use client";

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
  condition: string;
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
      .select("id,resort,area,snow_type,snowfall,roughness,crowd,condition,comment,created_at")
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
      condition: post.condition,
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
  if (master.error) return <main className="p-6">
    <p role="alert" className="text-amber-300">{master.error}</p>
    <button className="min-h-11 py-3 text-sky-400" onClick={master.retry}>再読み込み</button>
    <Link className="block py-3 text-sky-400" href="/">スキー場一覧へ戻る</Link>
  </main>;
  if (!resort) return <main className="p-6">
    <h1 className="text-xl font-bold">指定されたスキー場が見つかりません</h1>
    <Link className="block py-3 text-sky-400" href="/">スキー場一覧へ戻る</Link>
  </main>;

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-md px-5 py-8">

        <Link
          href={regionUrl(resort.region_code)}
          className="text-sm font-semibold text-sky-400"
        >
          ← スキー場一覧
        </Link>

        <header className="mb-8 mt-6">
          <p className="mb-2 text-sm font-semibold tracking-[0.3em] text-sky-400">
            SNOW NOW
          </p>

          <h1 className="text-3xl font-bold break-words">
            {resort.display_name}
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            {region?.name}・現地からのリアルタイム速報
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

        {postsLoading ? <p role="status">投稿情報を読み込んでいます…</p> : postsError ? <p role="alert" className="text-amber-300">{postsError}</p> : posts.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
            <p className="font-semibold">
              まだ投稿がありません
            </p>

            <p className="mt-2 text-sm text-slate-400">
              現地から最初の速報を投稿しよう
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <article
                key={post.id}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
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

                  <span className="text-lg">
                    {post.condition}
                  </span>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">
                      雪質
                    </span>
                    <span>{post.snowType}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">
                      営業開始後
                    </span>
                    <span>{post.snowfall}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">
                      荒れ具合
                    </span>
                    <span>{post.roughness}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">
                      混雑
                    </span>
                    <span>{post.crowd}</span>
                  </div>
                </div>

                {post.comment && (
                  <div className="mt-4 rounded-xl bg-slate-950 p-3">
                    <p className="text-sm text-slate-300">
                      「{post.comment}」
                    </p>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        {resort.is_active ? <Link
          href={postUrl(resort.name, resort.region_code)}
      
          className="mt-6 block w-full rounded-2xl bg-sky-500 px-4 py-4 text-center font-bold"
        >
          ＋ このスキー場の情報を投稿
        </Link> : <p role="status" className="mt-6 text-amber-300">現在はこのスキー場への投稿を受け付けていません。</p>}
      </div>
    </main>
  );
}
