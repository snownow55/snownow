"use client";

import Link from "next/link";
import { PrototypeNotice } from "@/components/prototype-notice";
import { PageShell } from "@/components/ui";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { usePostDay } from "@/lib/use-post-day";
import { useResortMaster } from "@/lib/use-resort-master";
import { useOfficialConditions } from "@/lib/use-official-conditions";
import { useRegionPreferences } from "@/lib/use-region-preferences";
import { prioritizeRegions } from "@/lib/region-preferences";
import { RESORT_READINGS, sortResorts, type ResortSort } from "@/lib/resort-sort";
import { loadResortPostSummaries, POSTS_ERROR, type ResortPostSummary } from "@/lib/resort-post-summary";
import { ResortLiveCard } from "@/components/resort-live-card";
import { MorningResortCard } from "@/components/resort-information-card";

function searchText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ja").replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

function Home() {
  const searchParams = useSearchParams();
  const postDay = usePostDay();
  const master = useResortMaster();
  const preferences = useRegionPreferences();
  const orderedRegions = prioritizeRegions(master.data?.regions ?? [], preferences.codes);
  const regionCode = searchParams.get("region") ?? "all";
  const allRegions = regionCode === "all";
  const selectedRegion = master.data?.regions.find((region) => region.code === regionCode);
  const resortsInRegion = useMemo(() => master.data?.resorts.filter(
    (resort) => (allRegions || resort.region_code === selectedRegion?.code) && resort.is_active,
  ) ?? [], [master.data, selectedRegion?.code, allRegions]);
  const tab = searchParams.get("tab") === "live" ? "live" : "morning";
  const search = searchParams.get("search") ?? "";
  const sortOrder: ResortSort = searchParams.get("sort") === "latest" ? "latest" : "kana";
  function updateListState(changes: Record<string, string>) {
    // Read the current URL synchronously so rapid filter changes cannot overwrite each other.
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    window.history.replaceState(null, "", `/?${params.toString()}`);
  }
  const returnTo = `/?${new URLSearchParams({
    region: regionCode,
    tab,
    sort: sortOrder,
    ...(search ? { search } : {}),
  }).toString()}`;
  const postKey = JSON.stringify([postDay, resortsInRegion.map((resort) => resort.name)]);
  const [postState, setPostState] = useState<{
    key: string;
    summaries: Map<string, ResortPostSummary>;
    error: string;
  } | null>(null);
  // A new region never uses the previous region's dates for sorting.
  const currentPosts = postState?.key === postKey ? postState : null;
  const postsLoading = resortsInRegion.length > 0 && !currentPosts;
  const postsError = currentPosts?.error ?? "";
  const summaries = currentPosts?.summaries ?? new Map<string, ResortPostSummary>();
  const latestDates = new Map([...summaries].flatMap(([name, summary]) => summary.latest ? [[name, summary.latest.created_at] as const] : []));
  const official = useOfficialConditions(tab === "morning");
  const resorts = tab === "morning" ? resortsInRegion.filter((resort) => resort.name !== "和寒東山スキー場") : resortsInRegion;
  const groups = orderedRegions.filter((region) => allRegions || region.code === regionCode).map((region) => ({
    region, resorts: sortResorts(resorts.filter((resort) => resort.region_code === region.code), tab === "morning" ? "kana" : sortOrder, latestDates),
  }));
  const query = searchText(search.trim());
  const visibleResorts = resorts.filter((resort) => [resort.name, resort.display_name, Object.hasOwn(RESORT_READINGS, resort.name) ? RESORT_READINGS[resort.name] : ""].some((name) => searchText(name).includes(query)));

  useEffect(() => {
    if (tab !== "live" || !postDay || !resortsInRegion.length) return;
    const controller = new AbortController();
    loadResortPostSummaries(supabase, resortsInRegion, controller.signal, postDay).then(
      (summaries) => {
        if (!controller.signal.aborted) setPostState({ key: postKey, summaries, error: "" });
      },
      () => {
        if (!controller.signal.aborted) setPostState({ key: postKey, summaries: new Map(), error: POSTS_ERROR });
      },
    );
    return () => controller.abort();
  }, [resortsInRegion, postKey, tab, postDay]);


  return (
    <PageShell>
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-6">
        <h1 className="sr-only">スキー場のコンディション</h1>

        <div role="tablist" aria-label="情報の種類" className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-brand/15 bg-white p-2">
          {([["morning", "朝のコンディション", "無料・公式情報"], ["live", "ゲレンデの今", "ユーザー現地投稿"]] as const).map(([value, label, caption]) => (
            <button key={value} id={`tab-${value}`} role="tab" aria-selected={tab === value}
              aria-controls="information-panel" tabIndex={tab === value ? 0 : -1}
              onClick={() => updateListState({ tab: value })}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? "morning" : event.key === "End" ? "live" : tab === "morning" ? "live" : "morning";
                updateListState({ tab: next });
                document.getElementById(`tab-${next}`)?.focus();
              }}
              className={`min-h-14 rounded-xl px-2 py-2 text-xs font-bold sm:text-sm ${tab === value ? "bg-brand text-white shadow-sm" : "text-brand hover:bg-brand-soft"}`}>
              <span className="block">{label}</span><span className="mt-1 block text-[10px] font-normal">{caption}</span>
            </button>
          ))}
        </div>
        <PrototypeNotice />
        <div id="information-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0}>
          {tab === "live" && <aside aria-label="現地情報の閲覧案内" className="mb-3 rounded-xl border border-orange-200 bg-accent-soft px-3 py-2">
            <p className="text-xs leading-relaxed">先行無料公開中。現地の投稿情報はログインなしで閲覧できます。</p>
            <Link href="/access" className="inline-flex min-h-11 items-center text-xs font-bold text-brand underline underline-offset-4">閲覧方法を見る</Link>
            <p className="text-[10px] leading-relaxed text-slate-600">投稿にはメール確認済みアカウントでのログインが必要です。</p>
          </aside>}

          <Link href="/settings" className="mb-3 inline-flex min-h-11 items-center text-sm text-brand underline">登録エリアを設定</Link>
          {preferences.error && <p role="alert" className="mb-3 text-sm text-amber-900">{preferences.error} 通常のエリア順で表示しています。<button onClick={preferences.retry} className="ml-2 underline">再読み込み</button></p>}
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
                <select id="home-region" className="ui-input text-sm font-semibold text-brand" value={allRegions ? "all" : selectedRegion?.code ?? ""}
                  onChange={(event) => updateListState({ region: event.target.value })}>
                  <option value="all">全エリア（登録エリア優先）</option>
                  {!allRegions && !selectedRegion && <option value="" disabled>地域を選択してください</option>}
                  {orderedRegions.map((region) => <option key={region.code} value={region.code}>{region.name}</option>)}
                </select>
              </div>
              <h2 className="mb-3 hidden text-xs font-semibold text-slate-600 md:block">エリアを選ぶ</h2>
              <div className="hidden grid-cols-3 gap-2 md:grid lg:grid-cols-5">
                <button aria-pressed={allRegions} onClick={() => updateListState({ region: "all" })} className={`ui-tab ${allRegions ? "ui-tab-active" : "ui-tab-idle"}`}>全エリア（登録エリア優先）</button>
                {orderedRegions.map((region) => (
                  <button key={region.code} aria-label={region.name} aria-pressed={region.code === selectedRegion?.code}
                    onClick={() => updateListState({ region: region.code })}
                    className={`ui-tab break-words ${region.code === selectedRegion?.code ? "ui-tab-active" : "ui-tab-idle"}`}>
                    {region.name.split("・").map((part, index, parts) => <span key={index} className="inline-block">{part}{index < parts.length - 1 ? "・" : ""}</span>)}
                  </button>
                ))}
              </div>
              {!allRegions && !selectedRegion && <p role="alert" className="mt-3 text-sm text-amber-900">指定されたエリアが見つかりません。エリアを選び直してください。</p>}
            </section>
          )}
          {master.data && (allRegions || selectedRegion) && <div className="mb-3">
            <label htmlFor="resort-search" className="mb-2 block text-xs font-semibold text-brand">スキー場を検索 <span className="font-normal text-slate-600">（表示中のエリア内）</span></label>
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <svg aria-hidden="true" className="pointer-events-none absolute top-4 left-3 size-4 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></svg>
                <input id="resort-search" type="search" value={search} onChange={(event) => updateListState({ search: event.target.value })} className="ui-input pl-10" placeholder="スキー場名・読み仮名" maxLength={200} />
              </div>
              {search && <button type="button" className="ui-secondary text-xs" onClick={() => updateListState({ search: "" })}>検索をクリア</button>}
            </div>
          </div>}
          {tab === "morning" && official.error && <p role="alert" className="mb-3 text-sm text-amber-900">{official.error}</p>}
          <section aria-label="スキー場一覧">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold tracking-tight">{allRegions ? "全エリアのスキー場" : selectedRegion ? `${selectedRegion.name}のスキー場` : "スキー場"}</h2>
                {(allRegions || selectedRegion) && <p className="mt-1 text-xs text-slate-500">{visibleResorts.length} / {resorts.length}スキー場 · {tab === "morning" ? "公式情報" : "ユーザー現地投稿（無料公開）"}</p>}
              </div>
              {master.data && (allRegions || selectedRegion) && tab === "live" && (
                <fieldset className="rounded-xl border border-slate-200 bg-white p-1">
                  <legend className="sr-only">並び順</legend>
                  <div className="flex gap-1">
                    {([["kana", "五十音順"], ["latest", "最新投稿順"]] as const).map(([value, label]) => (
                      <button key={value} type="button" aria-pressed={sortOrder === value}
                        disabled={value === "latest" && (postsLoading || !!postsError)} onClick={() => updateListState({ sort: value })}
                        className={`min-h-11 rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-50 ${sortOrder === value ? "bg-brand text-white" : "text-slate-600 hover:bg-brand-soft"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>
            {tab === "live" && <p className="mb-2 text-[10px] text-slate-500">各エリア内の最新投稿順：ユーザー投稿日時順（公式発表順ではありません）</p>}
            {tab === "live" && sortOrder === "latest" && postsLoading && <p role="status" className="mb-3 text-xs text-slate-600">最新投稿順を読み込んでいます…</p>}
            {tab === "live" && sortOrder === "latest" && postsError && <p className="mb-3 text-xs text-amber-900">最新投稿順を取得できないため、五十音順で表示しています。</p>}
            {postsError && <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{postsError}</p>}
            {master.data && (allRegions || selectedRegion) && !resorts.length && <p className="text-sm text-slate-600">このエリアには現在投稿できるスキー場がありません。</p>}

            {resorts.length > 0 && !visibleResorts.length && <p role="status" className="ui-card mb-4 p-5 text-sm">検索に一致するスキー場がありません。検索語を変更してください。</p>}
            {groups.map(({ region, resorts: inRegion }) => {
              const visible = inRegion.filter((resort) => visibleResorts.includes(resort));
              if (!visible.length) return null;
              return <section key={region.code} aria-label={`${region.name}の一覧`} className="mb-6">
                <h3 className="mb-3 font-bold">{region.name}{preferences.codes.includes(region.code) && <span className="ml-2 text-xs font-normal text-brand">登録エリア</span>}</h3>
                <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {visible.map((resort) => tab === "morning"
                    ? <MorningResortCard key={resort.name} resort={resort} returnTo={returnTo} condition={official.rows.find((row) => row.resort_id === resort.id)} now={official.now} />
                    : <ResortLiveCard key={resort.name} resort={resort} returnTo={returnTo} summary={summaries.get(resort.name)} postsLoading={postsLoading} postsError={postsError} />)}
                </div>
              </section>;
            })}
          </section>
        </div>
        <p className="mt-8 text-center text-[11px] leading-relaxed text-slate-500">公式発表とユーザー現地投稿は別の情報です。現地の投稿情報は無料で閲覧できます。</p>
      </div>
    </PageShell>
  );
}

export default function HomePage() {
  return <Suspense fallback={<p role="status" className="ui-page p-6 text-slate-600">読み込み中…</p>}><Home /></Suspense>;
}
