import Link from "next/link";
import { PageShell } from "@/components/ui";

export default function AccessPage() {
  return <PageShell><div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
    <p className="text-xs font-semibold text-accent">先行無料公開</p>
    <h1 className="mt-2 text-2xl font-bold">現地情報の閲覧方法</h1>
    <section className="ui-card mt-6 p-5">
      <h2 className="text-lg font-bold">ログインなしで無料閲覧</h2>
      <p className="mt-3 text-sm leading-relaxed">ゲレンデの今の投稿情報は、ログイン状態にかかわらず無料で閲覧できます。</p>
      <p className="mt-3 text-sm leading-relaxed">朝のコンディションには、当日の有効な公式情報がある場合に表示します。未取得・未発表の数値を0として表示することはありません。</p>
    </section>
    <section className="ui-card mt-4 p-5">
      <h2 className="text-lg font-bold">投稿にはログインが必要です</h2>
      <p className="mt-3 text-sm leading-relaxed">投稿は無料です。メール確認済みのアカウントでログインしてください。投稿は全スキー場共通で60分に1回までです。</p>
    </section>
    <Link href="/" className="ui-secondary mt-6 w-full">トップページへ戻る</Link>
  </div></PageShell>;
}
