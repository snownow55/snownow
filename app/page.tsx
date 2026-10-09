"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
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

const resorts = [
  {
    name: "オーンズ",
    area: "札幌・小樽",
  },
  {
    name: "キロロ",
    area: "赤井川",
  },
];

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


export default function Home() {
  const [posts, setPosts] = useState<SnowPost[]>([]);

 useEffect(() => {
  async function loadPosts() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("snow_posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("読み込みエラー:", error);
      return;
    }

    const formattedPosts: SnowPost[] = (data || []).map((post) => ({
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

    setPosts(formattedPosts);
  }

  loadPosts();
}, []);


  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-md px-5 py-8">

        <header className="mb-8">
          <p className="mb-2 text-sm font-semibold tracking-[0.3em] text-sky-400">
            SNOW NOW
          </p>

          <h1 className="text-3xl font-bold">
            今日、どこが滑れる？
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            北海道のリアルタイム雪山コンディション
          </p>
        </header>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              スキー場
            </h2>

            <span className="text-xs text-slate-500">
              現地速報
            </span>
          </div>

          <div className="space-y-4">
            {resorts.map((resort) => {
              const resortPosts = posts.filter(
                (post) => post.resort === resort.name
              );

              const latestPost = resortPosts[0];

              return (
                <Link
                  key={resort.name}
                  href={`/resort/${encodeURIComponent(resort.name)}`}
                  className="block rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-sky-500"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div>
                      <h3 className="text-xl font-bold">
                        {resort.name}
                      </h3>

                      <p className="text-sm text-slate-400">
                        {resort.area}
                      </p>
                    </div>

                    {latestPost && (
                      <div className="text-right">
                        <span className="rounded-full bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-400">
                          LIVE
                        </span>

                        <p className="mt-2 text-xs text-sky-400">
                          {latestPost.timeAgo}
                        </p>
                      </div>
                    )}
                  </div>

                  {latestPost ? (
                    <>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-400">
                            雪質
                          </span>

                          <span className="font-semibold">
                            {latestPost.snowType}
                          </span>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-slate-400">
                            営業開始後
                          </span>

                          <span>
                            {latestPost.snowfall}
                          </span>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-slate-400">
                            混雑
                          </span>

                          <span>
                            {latestPost.crowd}
                          </span>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-slate-400">
                            総合
                          </span>

                          <span>
                            {latestPost.condition}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3">
                        <span className="text-xs text-slate-500">
                          最新投稿 {resortPosts.length}件
                        </span>

                        <span className="text-sm font-semibold text-sky-400">
                          詳細を見る →
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-xl bg-slate-950 p-4">
                      <p className="text-sm text-slate-400">
                        まだ現地速報がありません
                      </p>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </section>

        <Link
          href="/post"
          className="mt-6 block w-full rounded-2xl bg-sky-500 px-4 py-4 text-center font-bold"
        >
          ＋ 現地のコンディションを投稿
        </Link>

        <p className="mt-6 text-center text-xs text-slate-600">
          Prototype v0.4
        </p>

      </div>
    </main>
  );
}
