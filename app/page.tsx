"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useResortMaster } from "@/lib/use-resort-master";
import { postUrl, regionUrl } from "@/lib/resort-master";
import { sortResorts, type ResortSort } from "@/lib/resort-sort";
import { loadResortPostSummaries, POSTS_ERROR, type ResortPostSummary } from "@/lib/resort-post-summary";

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


function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const master = useResortMaster();
  const regionCode = searchParams.get("region") ?? master.data?.regions[0]?.code;
  const selectedRegion = master.data?.regions.find((region) => region.code === regionCode);
  const resortsInRegion = useMemo(() => master.data?.resorts.filter(
    (resort) => resort.region_code === selectedRegion?.code && resort.is_active,
  ) ?? [], [master.data, selectedRegion?.code]);
  const [sortOrder, setSortOrder] = useState<ResortSort>("kana");
  const postKey = JSON.stringify(resortsInRegion.map((resort) => resort.name));
  const [postState, setPostState] = useState<{
    key: string;
    summaries: Map<string, ResortPostSummary>;
    error: string;
  } | null>(null);
  // A new region never displays the previous region's counts or post content.
  const currentPosts = postState?.key === postKey ? postState : null;
  const postsLoading = resortsInRegion.length > 0 && !currentPosts;
  const postsError = currentPosts?.error ?? "";
  const latestDates = new Map<string, string>();
  currentPosts?.summaries.forEach((summary, name) => {
    if (summary.latest) latestDates.set(name, summary.latest.created_at);
  });
  const resorts = sortResorts(resortsInRegion, sortOrder, latestDates);

  useEffect(() => {
    if (!resortsInRegion.length) return;
    const controller = new AbortController();
    loadResortPostSummaries(supabase, resortsInRegion, controller.signal).then(
      (summaries) => {
        if (!controller.signal.aborted) setPostState({ key: postKey, summaries, error: "" });
      },
      () => {
        if (!controller.signal.aborted) setPostState({ key: postKey, summaries: new Map(), error: POSTS_ERROR });
      },
    );
    return () => controller.abort();
  }, [resortsInRegion, postKey]);


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

        {master.loading && <p role="status" className="mb-6">エリア・スキー場を読み込んでいます…</p>}
        {master.error && (
          <div className="mb-6" role="alert">
            <p className="text-amber-300">{master.error}</p>
            <button className="min-h-11 py-3 text-sky-400" onClick={master.retry}>再読み込み</button>
          </div>
        )}
        {master.data && (
          <section aria-label="エリア選択" className="mb-8">
            <h2 className="mb-3 text-lg font-semibold">エリアを選ぶ</h2>
            <div className="grid grid-cols-3 gap-2">
              {master.data.regions.map((region) => (
                <button key={region.code} aria-pressed={region.code === selectedRegion?.code}
                  onClick={() => router.replace(regionUrl(region.code), { scroll: false })}
                  className={`min-h-11 rounded-xl border px-2 py-3 text-sm break-words ${region.code === selectedRegion?.code ? "border-sky-400 bg-sky-500/20 text-sky-300" : "border-slate-700 bg-slate-900"}`}>
                  {region.name}
                </button>
              ))}
            </div>
            {!selectedRegion && <p role="alert" className="mt-3 text-amber-300">指定されたエリアが見つかりません。エリアを選び直してください。</p>}
          </section>
        )}
        <section aria-label="スキー場一覧">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {selectedRegion ? `${selectedRegion.name}のスキー場` : "スキー場"}
            </h2>

            <span className="text-xs text-slate-500">
              現地速報
            </span>
          </div>
          {master.data && selectedRegion && (
            <fieldset className="mb-4">
              <legend className="mb-2 text-sm font-semibold text-slate-300">並び順</legend>
              <div className="grid grid-cols-2 gap-2">
                {([["kana", "五十音順"], ["latest", "最新投稿順"]] as const).map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={sortOrder === value}
                    disabled={value === "latest" && (postsLoading || !!postsError)}
                    onClick={() => setSortOrder(value)}
                    className={`min-h-11 rounded-xl border px-3 py-3 text-sm font-semibold disabled:opacity-50 ${sortOrder === value ? "border-sky-400 bg-sky-500/20 text-sky-300" : "border-slate-700 bg-slate-900"}`}>
                    {label}
                  </button>
                ))}
              </div>
              {sortOrder === "latest" && postsLoading && <p role="status" className="mt-2 text-xs text-slate-400">最新投稿順を読み込んでいます…</p>}
              {sortOrder === "latest" && postsError && <p className="mt-2 text-xs text-amber-300">最新投稿順を取得できないため、五十音順で表示しています。</p>}
            </fieldset>
          )}
          {postsError && <p role="alert" className="mb-4 text-amber-300">{postsError}</p>}
          {master.data && selectedRegion && !resorts.length && <p>このエリアには現在投稿できるスキー場がありません。</p>}

          <div className="space-y-4">
            {resorts.map((resort) => {
              const summary = currentPosts?.summaries.get(resort.name);
              const latestPost = summary?.latest;

              return (
                <article
                  key={resort.name}
                  aria-labelledby={`resort-${resort.id}`}
                  className="block rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-sky-500"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div>
                      <h3 id={`resort-${resort.id}`} className="text-xl font-bold break-words">
                        {resort.display_name}
                      </h3>

                      <p className="text-sm text-slate-400">
                        {selectedRegion?.name}
                      </p>
                    </div>

                    {latestPost && (
                      <div className="text-right">
                        <span className="rounded-full bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-400">
                          LIVE
                        </span>

                        <p className="mt-2 text-xs text-sky-400">
                          {getTimeAgo(latestPost.created_at)}
                        </p>
                      </div>
                    )}
                  </div>

                  {latestPost ? (
                    <>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between gap-3">
                          <span className="text-slate-400">ゲレンデ内の位置</span>
                          <span>{latestPost.area}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">
                            雪質
                          </span>

                          <span className="font-semibold">
                            {latestPost.snow_type}
                          </span>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-slate-400">
                            営業開始後の降雪
                          </span>

                          <span>
                            {latestPost.snowfall}
                          </span>
                        </div>

                        <div className="flex justify-between gap-3">
                          <span className="text-slate-400">荒れ具合</span>
                          <span>{latestPost.roughness}</span>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-slate-400">
                            混雑
                          </span>

                          <span>
                            {latestPost.crowd}
                          </span>
                        </div>

                      </div>
                      {latestPost.comment.trim() && (
                        <div className="mt-4 rounded-xl bg-slate-950 p-3">
                          <p className="mb-1 text-xs text-slate-400">現地コメント</p>
                          <p aria-label="現地コメント" className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-slate-200">
                            {latestPost.comment}
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-xl bg-slate-950 p-4">
                      <p className="text-sm text-slate-400">
                        {postsLoading ? "投稿情報を読み込んでいます…" : postsError ? "投稿情報を表示できません" : "まだ現地速報がありません"}
                      </p>
                    </div>
                  )}
                  <div className="mt-4 border-t border-slate-800 pt-3">
                    {latestPost && <p className="mb-3 text-xs text-slate-500">最新投稿 {summary?.count}件</p>}
                    <div className="grid grid-cols-2 gap-2">
                      <Link href={`/resort/${encodeURIComponent(resort.name)}`}
                        className="flex min-h-11 items-center justify-center rounded-xl border border-slate-700 px-2 py-3 text-center text-sm font-semibold text-sky-400">
                        過去投稿を見る
                      </Link>
                      <Link href={postUrl(resort.name, resort.region_code, "detail")}
                        className="flex min-h-11 items-center justify-center rounded-xl bg-sky-500 px-2 py-3 text-center text-sm font-semibold text-slate-950">
                        ＋ 投稿する
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <p className="mt-6 text-center text-xs text-slate-600">
          Prototype v0.4
        </p>

      </div>
    </main>
  );
}

export default function HomePage() {
  return <Suspense fallback={<p role="status" className="p-6">読み込み中…</p>}><Home /></Suspense>;
}
