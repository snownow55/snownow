import Link from "next/link";
import { postUrl, type Resort } from "../lib/resort-master";

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
    <p className="mt-2 text-[10px] text-slate-500">詳細リンクでは既存のユーザー投稿を閲覧できます。</p>
    <ResortActions resort={resort} />
  </article>;
}

// Deliberately accepts master data only, not a post, summary, children, or an
// entitlement flag. Blurred shapes are fixed decoration, never real contents.
export function LockedResortCard({ resort }: { resort: Resort }) {
  return <article aria-labelledby={`resort-${resort.id}`} className="ui-card min-w-0 p-4">
    <p className="mb-1 text-[10px] font-semibold text-brand">ユーザー現地投稿</p>
    <h3 id={`resort-${resort.id}`} className="mb-3 text-base font-bold leading-snug break-words">{resort.display_name}</h3>
    <div className="relative isolate overflow-hidden rounded-xl border border-brand/10 bg-brand-soft">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid grid-cols-2 gap-3 p-4 opacity-35 blur-sm select-none">
        {Array.from({ length: 6 }, (_, index) => <span key={index} className="h-8 rounded-lg bg-brand/25" />)}
      </div>
      <div className="relative flex flex-col items-center bg-white/70 px-3 py-5 text-center">
        <svg aria-hidden="true" className="mb-2 size-6 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></svg>
        <p className="text-xs font-semibold leading-relaxed">現地情報の閲覧には<br />チケットが必要です</p>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-600">投稿でチケットを獲得、<br />または月額500円で見放題</p>
        <Link href="/access" className="mt-3 inline-flex min-h-11 items-center text-xs font-bold text-brand underline underline-offset-4">閲覧方法を見る</Link>
        <span className="text-[10px] text-slate-500">提供予定・UIプレビュー</span>
      </div>
    </div>
    <ResortActions resort={resort} />
  </article>;
}
