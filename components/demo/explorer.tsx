"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RESORT_READINGS } from "@/lib/resort-sort";
import { formatPostDate } from "@/lib/post-date";
import { demoListUrl, type DemoCatalog, type DemoPost } from "@/lib/demo/data";

function Metrics({ post }: { post: DemoPost }) {
  return <dl className="grid grid-cols-2 gap-2 text-xs">
    {[["ゲレンデ内の位置", post.area], ["雪質", post.snowType], ["営業開始後の降雪", post.snowfall], ["荒れ具合", post.roughness], ["混雑", post.crowd]].map(([label, value]) => (
      <div key={label} className="rounded-lg bg-brand-soft p-2"><dt className="text-[10px] text-slate-600">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>
    ))}
  </dl>;
}
function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ja").replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

export function DemoExplorer({ catalog, detailName }: { catalog: DemoCatalog; detailName?: string }) {
  const params = useSearchParams();
  const tab = params.get("tab") === "live" ? "live" : "morning";
  const sort = params.get("sort") === "latest" ? "latest" : "kana";
  const search = (params.get("search") ?? "").slice(0, 200);
  const home = demoListUrl(tab, search, sort);
  function update(changes: { tab?: string; search?: string; sort?: string }) {
    const current = new URLSearchParams(window.location.search);
    window.history.replaceState(null, "", demoListUrl(changes.tab ?? current.get("tab") ?? "morning", changes.search ?? current.get("search") ?? "", changes.sort ?? current.get("sort") ?? "kana"));
  }
  const resort = catalog.resorts.find((item) => item.name === detailName);
  if (detailName && resort) {
    const posts = catalog.posts.filter((post) => post.resort === resort.name).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    return <main className="mx-auto max-w-2xl px-4 py-6">
      <Link href={home} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand">← デモのスキー場一覧</Link>
      <h1 className="mt-4 text-2xl font-bold break-words">{resort.display_name}</h1>
      <p className="mt-2 text-sm text-slate-600">{catalog.region.name} · 架空のシナリオ・全{posts.length}件</p>
      <p className="my-4 text-xs leading-relaxed text-slate-600">朝から午後への変化を、古い時刻から順に比較できます。すべてサンプルで、投稿・編集・削除はできません。</p>
      <ol aria-label="デモ投稿の時系列" className="space-y-4">
        {posts.map((post, index) => <li key={post.createdAt}>
          <article className="ui-card p-4" aria-label={`サンプル${index + 1}`}>
            <h2 className="mb-3 font-bold"><time dateTime={post.createdAt}>{formatPostDate(post.createdAt)}</time><span className="ml-2 text-xs text-accent">架空の投稿</span></h2>
            <Metrics post={post} />
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{post.comment}</p>
          </article>
        </li>)}
      </ol>
      <Link href={home} className="ui-secondary mt-6 w-full">一覧に戻って比較する</Link>
    </main>;
  }

  const collator = new Intl.Collator("ja");
  const postsByName = new Map(catalog.resorts.map((item) => [item.name, catalog.posts.filter((post) => post.resort === item.name).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))]));
  const resorts = [...catalog.resorts].sort((a, b) => {
    if (tab === "live" && sort === "latest") {
      const difference = Date.parse(postsByName.get(b.name)![0].createdAt) - Date.parse(postsByName.get(a.name)![0].createdAt);
      if (difference) return difference;
    }
    return collator.compare(RESORT_READINGS[a.name] ?? a.display_name, RESORT_READINGS[b.name] ?? b.display_name) || collator.compare(a.name, b.name);
  }).filter((item) => [item.name, item.display_name, RESORT_READINGS[item.name] ?? ""].some((name) => normalize(name).includes(normalize(search.trim()))));
  return <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
    <h1 className="text-xl font-bold">{catalog.region.name}のスキー場を比較</h1>
    <p className="mt-2 text-xs text-slate-600">{catalog.resorts.length}スキー場・{catalog.posts.length}件の架空投稿 · 同じ日の変化を体験</p>
    <div role="tablist" aria-label="デモ情報の種類" className="my-4 grid grid-cols-2 gap-2 rounded-xl bg-white p-2">
      {([["morning", "朝のコンディション"], ["live", "ゲレンデの今"]] as const).map(([value, label]) => <button key={value} id={`demo-tab-${value}`} role="tab" aria-selected={tab === value} aria-controls="demo-panel" tabIndex={tab === value ? 0 : -1}
        onClick={() => update({ tab: value })}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? "morning" : event.key === "End" ? "live" : tab === "morning" ? "live" : "morning";
          update({ tab: next }); document.getElementById(`demo-tab-${next}`)?.focus();
        }} className={`min-h-12 rounded-lg px-2 py-3 text-xs font-bold sm:text-sm ${tab === value ? "bg-brand text-white" : "text-brand hover:bg-brand-soft"}`}>{label}</button>)}
    </div>
    <div id="demo-panel" role="tabpanel" aria-labelledby={`demo-tab-${tab}`}>
      <p className="mb-4 text-xs leading-relaxed text-slate-600">{tab === "morning" ? "公式情報の表示イメージです。取得連携は未実装のため、公式の新雪量・積雪量は表示していません。" : "現地投稿の表示イメージです。ログインや閲覧チケットなしで、すべての架空サンプルを比較できます。"}</p>
      <label htmlFor="demo-search" className="mb-2 block text-xs font-semibold text-brand">スキー場名で検索</label>
      <input id="demo-search" type="search" value={search} maxLength={200} placeholder="名前・読み仮名" className="ui-input" onChange={(event) => update({ search: event.target.value })} />
      <div className="my-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-600">{resorts.length} / {catalog.resorts.length}スキー場</p>
        {tab === "live" ? <fieldset className="flex gap-1 rounded-lg bg-white p-1"><legend className="sr-only">並び順</legend>
          {([["kana", "五十音順"], ["latest", "最新投稿順"]] as const).map(([value, label]) => <button key={value} onClick={() => update({ sort: value })} aria-pressed={sort === value} className={`min-h-11 rounded-lg px-3 text-xs font-semibold ${sort === value ? "bg-brand text-white" : "text-brand"}`}>{label}</button>)}
        </fieldset> : <p className="text-xs text-slate-600">五十音順</p>}
      </div>
      {!resorts.length && <p role="status" className="ui-card p-5 text-sm">検索に一致するスキー場がありません。</p>}
      <section aria-label="デモのスキー場一覧" className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {resorts.map((item) => {
          const posts = postsByName.get(item.name)!;
          const latest = posts[0];
          const href = `/demo/resort/${encodeURIComponent(item.name)}?${home.split("?")[1]}`;
          return <article key={item.name} aria-label={item.display_name} className="ui-card min-w-0 p-4">
            <p className="mb-1 text-[10px] font-semibold text-accent">{tab === "morning" ? "公式情報の枠・取得未実装" : "架空の現地サンプル"}</p>
            <h2 className="mb-3 text-base font-bold break-words">{item.display_name}</h2>
            {tab === "morning" ? <dl className="grid grid-cols-2 gap-2 text-xs">
              {["新雪量", "積雪量", "発表日時"].map((label) => <div key={label} className="rounded-lg bg-brand-soft p-2"><dt className="text-[10px] text-slate-600">{label}</dt><dd className="mt-1 font-semibold text-slate-500">未取得</dd></div>)}
            </dl> : <>
              <p className="mb-3 text-xs text-slate-600">最新サンプル：<time dateTime={latest.createdAt}>{formatPostDate(latest.createdAt)}</time></p>
              <Metrics post={latest} />
              <p className="mt-3 break-words text-xs leading-relaxed">{latest.comment}</p>
            </>}
            <Link href={href} className="ui-primary mt-4 w-full text-xs">{posts.length}件のサンプルを見る</Link>
          </article>;
        })}
      </section>
    </div>
    <p className="mt-6 text-xs leading-relaxed text-slate-600">このデモは閲覧専用です。サンプルはアプリ内の固定データで、公式発表・実際のユーザー投稿・有料閲覧権とは接続していません。</p>
  </main>;
}
