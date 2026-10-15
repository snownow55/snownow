import Link from "next/link";
import { postUrl, type Resort } from "../lib/resort-master";
import { formatPostAge, formatPostDate } from "../lib/post-date";

function ResortActions({ resort }: { resort: Resort }) {
  return <div className="mt-3 grid grid-cols-2 gap-2">
    <Link href={`/resort/${encodeURIComponent(resort.name)}`} className="ui-secondary gap-1 text-xs">詳細を見る <span aria-hidden="true">↗</span></Link>
    <Link href={postUrl(resort.name, resort.region_code, "detail")} className="ui-primary gap-1 text-xs"><span aria-hidden="true">＋</span>投稿する</Link>
  </div>;
}

// Official data integration is intentionally absent. Nothing is inferred from
// user posts; future official fields/source links belong to this separate view.
export function MorningResortCard({ resort }: { resort: Resort }) {
  return <article aria-labelledby={`resort-${resort.id}`} className="ui-card min-w-0 p-4">
    <div className="mb-3">
      <p className="mb-1 text-[10px] font-semibold text-brand">公式情報・無料</p>
      <h3 id={`resort-${resort.id}`} className="text-base font-bold leading-snug break-words">{resort.display_name}</h3>
    </div>
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-brand/10">
      {["新雪量", "積雪量", "発表日時"].map((label) => <div key={label} className={`bg-brand-soft px-3 py-2 ${label === "発表日時" ? "col-span-2" : ""}`}>
        <dt className="text-[10px] text-slate-600">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-500">未取得</dd>
      </div>)}
    </dl>
    <Link href={`/resort/${encodeURIComponent(resort.name)}`}
      className="ui-secondary mt-3 w-full min-w-0 px-2 text-xs leading-relaxed break-words sm:text-sm">
      今のゲレンデコンディションを見る
    </Link>
  </article>;
}

export type LatestPostStatus = { state: "loading" | "error" } | { state: "ready"; createdAt: string | null };

// Receives only the master and public timestamp metadata, never post contents
// or an entitlement flag. Blurred shapes are fixed decoration.
export function LockedResortCard({ resort, latest }: { resort: Resort; latest: LatestPostStatus }) {
  const createdAt = latest.state === "ready" ? latest.createdAt : null;
  return <article aria-labelledby={`resort-${resort.id}`} className="ui-card min-w-0 p-3 sm:p-4">
    <h3 id={`resort-${resort.id}`} className="text-base font-bold leading-snug break-words">{resort.display_name}</h3>
    <div className="mt-1 min-h-10 text-[11px] leading-relaxed text-slate-600">
      <p aria-label="投稿状況">{latest.state === "loading" ? "投稿日時を読み込み中…" : latest.state === "error" ? "投稿日時を取得できません" : createdAt ? "最新投稿あり" : "投稿なし"}
        {createdAt && <span aria-label="投稿からの経過時間" className="ml-2 font-semibold text-brand">{formatPostAge(createdAt)}</span>}
      </p>
      {createdAt && <time dateTime={createdAt} aria-label="投稿日時（日本時間）">{formatPostDate(createdAt)}</time>}
    </div>
    <div className="relative mt-2 flex min-h-8 items-center gap-2 overflow-hidden rounded-lg bg-brand-soft px-3 py-2">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-end gap-2 px-3 opacity-40 blur-sm select-none">
        {["w-12", "w-8", "w-10"].map((width) => <span key={width} className={`h-3 rounded bg-brand/30 ${width}`} />)}
      </div>
      <svg aria-hidden="true" className="relative size-3.5 shrink-0 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></svg>
      <p className="relative text-[11px] font-medium">投稿内容はロック中</p>
    </div>
    <ResortActions resort={resort} />
  </article>;
}
