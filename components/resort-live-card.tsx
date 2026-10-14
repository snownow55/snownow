"use client";

import Link from "next/link";
import { ResortMemo } from "./resort-memo";
import { formatPostDate } from "../lib/post-date";
import { postUrl, type Resort } from "../lib/resort-master";
import type { ResortPostSummary } from "../lib/resort-post-summary";

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


// Reserved for a future server-authorized view. Never pass this data to a locked
// card. This presentation component does not implement access control.
export function ResortLiveCard({ resort, summary, postsLoading = false, postsError = "" }: {
  resort: Resort; summary?: ResortPostSummary; postsLoading?: boolean; postsError?: string;
}) {
  const latestPost = summary?.latest;
  return (
    <article aria-labelledby={`resort-${resort.id}`}
      className="ui-card min-w-0 p-4 transition hover:border-brand/40">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`resort-${resort.id}`} className="text-base font-bold leading-snug break-words">{resort.display_name}</h3>
          {latestPost && <p className="mt-1 text-[11px] text-slate-500">最新投稿 {summary?.count}件</p>}
        </div>
        {latestPost && <div className="shrink-0 text-right">
          <span aria-label="投稿からの経過時間" className="inline-block rounded-full bg-accent-soft px-2 py-1 text-[11px] font-medium text-brand">{getTimeAgo(latestPost.created_at)}</span>
          <time dateTime={latestPost.created_at} aria-label="投稿日時（日本時間）" className="mt-1 block text-[11px] text-slate-600">{formatPostDate(latestPost.created_at)}</time>
        </div>}
      </div>
      {!latestPost && <p className="mb-3 text-xs text-slate-500">{postsLoading ? "投稿情報を読み込んでいます…" : postsError ? "投稿情報を表示できません" : "現地投稿なし"}</p>}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-brand/10">
        {([["雪質", latestPost?.snow_type], ["荒れ具合", latestPost?.roughness], ["営業開始後の降雪", latestPost?.snowfall], ["混雑", latestPost?.crowd]] as const).map(([label, value]) => (
          <div key={label} className="min-w-0 bg-brand-soft px-3 py-2">
            <dt className="mb-0.5 text-[10px] font-medium text-slate-600">{label}</dt>
            <dd className="text-xs font-semibold leading-relaxed break-words">{value?.trim() || "―"}</dd>
          </div>
        ))}
      </dl>
      {latestPost && <ResortMemo key={latestPost.id} area={latestPost.area} comment={latestPost.comment} />}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link href={`/resort/${encodeURIComponent(resort.name)}`}
          className="ui-secondary gap-1 text-xs">
          詳細を見る <span aria-hidden="true">↗</span>
        </Link>
        <Link href={postUrl(resort.name, resort.region_code, "detail")}
          className="ui-primary gap-1 text-xs">
          <span aria-hidden="true">＋</span>投稿する
        </Link>
      </div>
    </article>
  );
}
