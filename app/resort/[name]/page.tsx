"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
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
};

export default function ResortPage() {
  const params = useParams();
  const resortName = decodeURIComponent(params.name as string);

  const [posts, setPosts] = useState<SnowPost[]>([]);

 useEffect(() => {
  async function loadPosts() {
    const { data, error } = await supabase
      .from("snow_posts")
      .select("*")
      .eq("resort", resortName)
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
    }));

    setPosts(formattedPosts);
  }

  loadPosts();
}, [resortName]);

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

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-md px-5 py-8">

        <Link
          href="/"
          className="text-sm font-semibold text-sky-400"
        >
          ← スキー場一覧
        </Link>

        <header className="mb-8 mt-6">
          <p className="mb-2 text-sm font-semibold tracking-[0.3em] text-sky-400">
            SNOW NOW
          </p>

          <h1 className="text-3xl font-bold">
            {resortName}
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            現地からのリアルタイム速報
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

        {posts.length === 0 ? (
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
                      {getTimeAgo(post.createdAt)}
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

        <Link
          href={`/post?resort=${encodeURIComponent(resortName)}`}
      
          className="mt-6 block w-full rounded-2xl bg-sky-500 px-4 py-4 text-center font-bold"
        >
          ＋ このスキー場の情報を投稿
        </Link>
      </div>
    </main>
  );
}