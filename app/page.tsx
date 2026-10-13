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
    <main className="min-h-screen bg-[linear-gradient(180deg,#eef8ff_0%,#f6f9fc_320px,#f6f9fc_100%)] text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="mb-6 sm:mb-8">
          <div className="mb-4 flex items-center gap-2.5">
            <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-xl bg-slate-900 text-lg text-white">❄</span>
            <p className="text-sm font-extrabold tracking-[0.18em]">SNOW VIKING</p>
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">今日、どこが滑れる？</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">北海道のスキー場を、現地の声で比較。</p>
          {master.data && <p className="mt-3 text-xs font-medium text-sky-800">{master.data.regions.length}エリア<span aria-hidden="true"> / </span>{master.data.resorts.length}スキー場</p>}
        </header>

        {master.loading && <p role="status" className="mb-6 text-sm text-slate-600">エリア・スキー場を読み込んでいます…</p>}
        {master.error && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm" role="alert">
            <p className="text-amber-900">{master.error}</p>
            <button className="min-h-11 py-3 font-semibold text-sky-800" onClick={master.retry}>再読み込み</button>
          </div>
        )}
        {master.data && (
          <section aria-label="エリア選択" className="mb-6 rounded-2xl border border-sky-100 bg-white/90 p-3 sm:p-4">
            <h2 className="mb-3 text-xs font-semibold text-slate-600">エリアを選ぶ</h2>
            <div className="grid grid-cols-3 gap-2 lg:grid-cols-9">
              {master.data.regions.map((region) => (
                <button key={region.code} aria-pressed={region.code === selectedRegion?.code}
                  onClick={() => router.replace(regionUrl(region.code), { scroll: false })}
                  className={`min-h-11 rounded-xl border px-2 py-2 text-xs font-semibold break-words transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 ${region.code === selectedRegion?.code ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:bg-sky-50"}`}>
                  {region.name}
                </button>
              ))}
            </div>
            {!selectedRegion && <p role="alert" className="mt-3 text-sm text-amber-900">指定されたエリアが見つかりません。エリアを選び直してください。</p>}
          </section>
        )}
        <section aria-label="スキー場一覧">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold tracking-tight">{selectedRegion ? `${selectedRegion.name}のスキー場` : "スキー場"}</h2>
              {selectedRegion && <p className="mt-1 text-xs text-slate-500">{resorts.length}スキー場 · 現地投稿の最新情報</p>}
            </div>
            {master.data && selectedRegion && (
              <fieldset className="rounded-xl border border-slate-200 bg-white p-1">
                <legend className="sr-only">並び順</legend>
                <div className="flex gap-1">
                  {([["kana", "五十音順"], ["latest", "最新投稿順"]] as const).map(([value, label]) => (
                    <button key={value} type="button" aria-pressed={sortOrder === value}
                      disabled={value === "latest" && (postsLoading || !!postsError)} onClick={() => setSortOrder(value)}
                      className={`min-h-11 rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 ${sortOrder === value ? "bg-sky-100 text-sky-900" : "text-slate-600 hover:bg-slate-50"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
          {sortOrder === "latest" && postsLoading && <p role="status" className="mb-3 text-xs text-slate-600">最新投稿順を読み込んでいます…</p>}
          {sortOrder === "latest" && postsError && <p className="mb-3 text-xs text-amber-900">最新投稿順を取得できないため、五十音順で表示しています。</p>}
          {postsError && <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{postsError}</p>}
          {master.data && selectedRegion && !resorts.length && <p className="text-sm text-slate-600">このエリアには現在投稿できるスキー場がありません。</p>}

          <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {resorts.map((resort) => {
              const summary = currentPosts?.summaries.get(resort.name);
              const latestPost = summary?.latest;
              return (
                <article key={resort.name} aria-labelledby={`resort-${resort.id}`}
                  className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.025)] transition hover:border-sky-300">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 id={`resort-${resort.id}`} className="text-base font-bold leading-snug break-words">{resort.display_name}</h3>
                      {latestPost && <p className="mt-1 text-[11px] text-slate-500">最新投稿 {summary?.count}件</p>}
                    </div>
                    {latestPost && <time dateTime={latestPost.created_at} className="shrink-0 rounded-full bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-800">{getTimeAgo(latestPost.created_at)}</time>}
                  </div>
                  {!latestPost && <p className="mb-3 text-xs text-slate-500">{postsLoading ? "投稿情報を読み込んでいます…" : postsError ? "投稿情報を表示できません" : "現地投稿なし"}</p>}
                  <dl className="grid grid-cols-3 divide-x divide-sky-100 rounded-xl bg-sky-50/70 py-2.5 text-center">
                    {([["雪質", latestPost?.snow_type], ["混雑", latestPost?.crowd], ["荒れ具合", latestPost?.roughness]] as const).map(([label, value]) => (
                      <div key={label} className="min-w-0 px-1.5">
                        <dt className="mb-1 text-[10px] font-medium text-slate-500">{label}</dt>
                        <dd className="text-xs font-semibold leading-relaxed break-words">{value?.trim() || "―"}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Link href={`/resort/${encodeURIComponent(resort.name)}`}
                      className="flex min-h-11 items-center justify-center gap-1 rounded-xl border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">
                      詳細を見る <span aria-hidden="true">↗</span>
                    </Link>
                    <Link href={postUrl(resort.name, resort.region_code, "detail")}
                      className="flex min-h-11 items-center justify-center gap-1 rounded-xl bg-slate-900 px-2 py-2 text-xs font-semibold text-white transition hover:bg-sky-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">
                      <span aria-hidden="true">＋</span>投稿する
                    </Link>
                  </div>
                  {latestPost && (
                    <details className="mt-2 text-xs">
                      <summary className="min-h-11 cursor-pointer py-3 font-medium text-slate-500 hover:text-sky-800 focus-visible:outline-2 focus-visible:outline-sky-700">現地メモ</summary>
                      <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-slate-700">
                        <div className="flex justify-between gap-3"><span className="text-slate-500">ゲレンデ内の位置</span><span>{latestPost.area?.trim() || "―"}</span></div>
                        <div className="flex justify-between gap-3"><span className="text-slate-500">営業開始後の降雪</span><span>{latestPost.snowfall?.trim() || "―"}</span></div>
                        {latestPost.comment.trim() && <div className="border-t border-slate-200 pt-2">
                          <p className="mb-1 text-slate-500">現地コメント</p>
                          <p aria-label="現地コメント" className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6">{latestPost.comment}</p>
                        </div>}
                      </div>
                    </details>
                  )}
                </article>
              );
            })}
          </div>
        </section>
        <p className="mt-8 text-center text-[11px] leading-relaxed text-slate-500">現地投稿をもとに表示しています。状況は時間やゲレンデ内の位置によって異なります。</p>
      </div>
    </main>
  );
}

export default function HomePage() {
  return <Suspense fallback={<p role="status" className="min-h-screen bg-sky-50 p-6 text-slate-600">読み込み中…</p>}><Home /></Suspense>;
}
