"use client";

import Link from "next/link";
import { PageShell } from "@/components/ui";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useResortMaster } from "@/lib/use-resort-master";
import { regionUrl } from "@/lib/resort-master";
import { RESORT_READINGS, sortResorts, type ResortSort } from "@/lib/resort-sort";
import { loadResortLatestDates, LATEST_DATES_ERROR } from "@/lib/resort-latest-dates";
import { LockedResortCard, MorningResortCard } from "@/components/resort-information-card";

function searchText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ja").replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
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
  const [tab, setTab] = useState<"morning" | "live">("morning");
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<ResortSort>("kana");
  const postKey = JSON.stringify(resortsInRegion.map((resort) => resort.name));
  const [postState, setPostState] = useState<{
    key: string;
    dates: Map<string, string>;
    error: string;
  } | null>(null);
  // A new region never uses the previous region's dates for sorting.
  const currentPosts = postState?.key === postKey ? postState : null;
  const postsLoading = resortsInRegion.length > 0 && !currentPosts;
  const postsError = currentPosts?.error ?? "";
  const latestDates = currentPosts?.dates ?? new Map<string, string>();
  const resorts = sortResorts(resortsInRegion, tab === "morning" ? "kana" : sortOrder, latestDates);
  const query = searchText(search.trim());
  const visibleResorts = resorts.filter((resort) => [resort.name, resort.display_name, Object.hasOwn(RESORT_READINGS, resort.name) ? RESORT_READINGS[resort.name] : ""].some((name) => searchText(name).includes(query)));

  useEffect(() => {
    if (!resortsInRegion.length) return;
    const controller = new AbortController();
    loadResortLatestDates(supabase, resortsInRegion, controller.signal).then(
      (dates) => {
        if (!controller.signal.aborted) setPostState({ key: postKey, dates, error: "" });
      },
      () => {
        if (!controller.signal.aborted) setPostState({ key: postKey, dates: new Map(), error: LATEST_DATES_ERROR });
      },
    );
    return () => controller.abort();
  }, [resortsInRegion, postKey]);


  return (
    <PageShell>
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-6">
        <h1 className="sr-only">スキー場のコンディション</h1>

        <div role="tablist" aria-label="情報の種類" className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-brand/15 bg-white p-2">
          {([["morning", "朝のコンディション", "無料・公式情報"], ["live", "ゲレンデの今", "ユーザー現地投稿"]] as const).map(([value, label, caption]) => (
            <button key={value} id={`tab-${value}`} role="tab" aria-selected={tab === value}
              aria-controls="information-panel" tabIndex={tab === value ? 0 : -1}
              onClick={() => setTab(value)}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? "morning" : event.key === "End" ? "live" : tab === "morning" ? "live" : "morning";
                setTab(next);
                document.getElementById(`tab-${next}`)?.focus();
              }}
              className={`min-h-14 rounded-xl px-2 py-2 text-xs font-bold sm:text-sm ${tab === value ? "bg-brand text-white shadow-sm" : "text-brand hover:bg-brand-soft"}`}>
              <span className="block">{label}</span><span className="mt-1 block text-[10px] font-normal">{caption}</span>
            </button>
          ))}
        </div>
        <div id="information-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0}>
          {tab === "morning" ? <p className="mb-3 text-xs leading-relaxed text-slate-600">【開発中のプロトタイプ】公式情報は無料で提供予定です。新雪量・積雪量は現在未取得です。</p> : <aside aria-label="現地情報の閲覧案内" className="mb-3 rounded-xl border border-orange-200 bg-accent-soft px-3 py-2">
            <p className="text-xs leading-relaxed">投稿でチケットを獲得、または月額500円で見放題 <span className="text-slate-500">（提供予定）</span></p>
            <Link href="/access" className="inline-flex min-h-11 items-center text-xs font-bold text-brand underline underline-offset-4">閲覧方法を見る</Link>
            <p className="text-[10px] leading-relaxed text-slate-600">ロックは固定の見本です。閲覧制御は未実装で、既存の詳細ページ・APIは公開されたままです。</p>
          </aside>}

          {master.loading && <p role="status" className="mb-6 text-sm text-slate-600">エリア・スキー場を読み込んでいます…</p>}
          {master.error && (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm" role="alert">
              <p className="text-amber-900">{master.error}</p>
              <button className="min-h-11 py-3 font-semibold text-brand" onClick={master.retry}>再読み込み</button>
            </div>
          )}
          {master.data && (
            <section aria-label="エリア選択" className="mb-3 rounded-2xl border border-brand/15 bg-white p-2 md:p-4">
              <div className="md:hidden">
                <label htmlFor="home-region" className="sr-only">地域を選択</label>
                <select id="home-region" className="ui-input text-sm font-semibold text-brand" value={selectedRegion?.code ?? ""}
                  onChange={(event) => router.replace(regionUrl(event.target.value), { scroll: false })}>
                  {!selectedRegion && <option value="" disabled>地域を選択してください</option>}
                  {master.data.regions.map((region) => <option key={region.code} value={region.code}>{region.name}</option>)}
                </select>
              </div>
              <h2 className="mb-3 hidden text-xs font-semibold text-slate-600 md:block">エリアを選ぶ</h2>
              <div className="hidden grid-cols-3 gap-2 md:grid lg:grid-cols-9">
                {master.data.regions.map((region) => (
                  <button key={region.code} aria-label={region.name} aria-pressed={region.code === selectedRegion?.code}
                    onClick={() => router.replace(regionUrl(region.code), { scroll: false })}
                    className={`ui-tab break-words ${region.code === selectedRegion?.code ? "ui-tab-active" : "ui-tab-idle"}`}>
                    {region.name.split("・").map((part, index, parts) => <span key={index} className="inline-block">{part}{index < parts.length - 1 ? "・" : ""}</span>)}
                  </button>
                ))}
              </div>
              {!selectedRegion && <p role="alert" className="mt-3 text-sm text-amber-900">指定されたエリアが見つかりません。エリアを選び直してください。</p>}
            </section>
          )}
          {master.data && selectedRegion && <div className="mb-3">
            <label htmlFor="resort-search" className="mb-2 block text-xs font-semibold text-brand">スキー場を検索 <span className="font-normal text-slate-600">（選択中のエリア内）</span></label>
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <svg aria-hidden="true" className="pointer-events-none absolute top-4 left-3 size-4 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></svg>
                <input id="resort-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="ui-input pl-10" placeholder="スキー場名・読み仮名" maxLength={200} />
              </div>
              {search && <button type="button" className="ui-secondary text-xs" onClick={() => setSearch("")}>検索をクリア</button>}
            </div>
          </div>}
          <section aria-label="スキー場一覧">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold tracking-tight">{selectedRegion ? `${selectedRegion.name}のスキー場` : "スキー場"}</h2>
                {selectedRegion && <p className="mt-1 text-xs text-slate-500">{visibleResorts.length} / {resorts.length}スキー場 · {tab === "morning" ? "公式情報（取得準備中）" : "ユーザー現地投稿（閲覧準備中）"}</p>}
              </div>
              {master.data && selectedRegion && tab === "live" && (
                <fieldset className="rounded-xl border border-slate-200 bg-white p-1">
                  <legend className="sr-only">並び順</legend>
                  <div className="flex gap-1">
                    {([["kana", "五十音順"], ["latest", "最新投稿順"]] as const).map(([value, label]) => (
                      <button key={value} type="button" aria-pressed={sortOrder === value}
                        disabled={value === "latest" && (postsLoading || !!postsError)} onClick={() => setSortOrder(value)}
                        className={`min-h-11 rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-50 ${sortOrder === value ? "bg-brand text-white" : "text-slate-600 hover:bg-brand-soft"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>
            {tab === "live" && <p className="mb-2 text-[10px] text-slate-500">最新投稿順：ユーザー投稿日時順（公式発表順ではありません）</p>}
            {sortOrder === "latest" && postsLoading && <p role="status" className="mb-3 text-xs text-slate-600">最新投稿順を読み込んでいます…</p>}
            {sortOrder === "latest" && postsError && <p className="mb-3 text-xs text-amber-900">最新投稿順を取得できないため、五十音順で表示しています。</p>}
            {postsError && <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{postsError}</p>}
            {master.data && selectedRegion && !resorts.length && <p className="text-sm text-slate-600">このエリアには現在投稿できるスキー場がありません。</p>}

            {resorts.length > 0 && !visibleResorts.length && <p role="status" className="ui-card mb-4 p-5 text-sm">検索に一致するスキー場がありません。検索語を変更してください。</p>}
            <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleResorts.map((resort) => tab === "morning"
                ? <MorningResortCard key={resort.name} resort={resort} />
                : <LockedResortCard key={resort.name} resort={resort} latest={postsLoading ? { state: "loading" }
                  : postsError ? { state: "error" } : { state: "ready", createdAt: latestDates.get(resort.name) ?? null }} />)}
            </div>
          </section>
        </div>
        <p className="mt-8 text-center text-[11px] leading-relaxed text-slate-500">公式発表とユーザー現地投稿は別の情報です。閲覧制限は未実装で、既存の投稿詳細ページ・APIは引き続き公開されています。</p>
      </div>
    </PageShell>
  );
}

export default function HomePage() {
  return <Suspense fallback={<p role="status" className="ui-page p-6 text-slate-600">読み込み中…</p>}><Home /></Suspense>;
}
