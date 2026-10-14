import Link from "next/link";
import { Brand, PageShell } from "@/components/ui";

export default function AccessPage() {
  return <PageShell><div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
    <Brand placeholder />
    <p className="mt-6 text-xs font-semibold text-accent">提供予定のサービス</p>
    <h1 className="mt-2 text-2xl font-bold">現地情報の閲覧方法</h1>
    <p className="mt-3 text-sm leading-relaxed text-slate-600">朝の公式情報は誰でも無料。ゲレンデの今は、現地からの投稿で獲得するチケット、または月額会員で閲覧できる予定です。</p>
    <section className="ui-card mt-6 p-5" aria-labelledby="ticket-guide">
      <h2 id="ticket-guide" className="text-lg font-bold">投稿して、チケットで見る</h2>
      <ul className="mt-3 list-disc space-y-3 pl-5 text-sm leading-relaxed">
        <li>現地投稿は無料です。</li><li>1投稿で閲覧チケット1枚を獲得。</li>
        <li>チケット付与は2時間に1回まで。保有上限は3枚。</li>
        <li>チケット1枚で、選択したスキー場の現地情報を1時間閲覧。</li>
      </ul>
    </section>
    <section className="ui-card mt-4 p-5" aria-labelledby="membership-guide">
      <h2 id="membership-guide" className="text-lg font-bold">月額500円で見放題</h2>
      <p className="mt-3 text-sm leading-relaxed">全スキー場の現地情報を無制限で閲覧できる予定です。</p>
      <p className="mt-3 text-sm leading-relaxed">新規登録者には、本人が開始する7日間無料体験を予定しています。</p>
    </section>
    <p className="mt-5 rounded-xl bg-accent-soft p-4 text-xs leading-relaxed text-slate-700">現在は説明とロック表示のUIプレビューです。チケット付与・消費、決済、無料体験の開始、閲覧権の判定は実装していません。既存の投稿詳細ページ・APIの公開範囲は変わっていません。</p>
    <Link href="/" className="ui-secondary mt-6 w-full">トップページへ戻る</Link>
  </div></PageShell>;
}
