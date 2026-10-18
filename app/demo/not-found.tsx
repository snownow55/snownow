import Link from "next/link";
export default function DemoNotFound() {
  return <main className="mx-auto max-w-2xl px-4 py-8">
    <h1 className="text-xl font-bold">デモ対象のスキー場が見つかりません</h1>
    <p className="mt-3 text-sm">公開対象のエリア内から選択してください。</p>
    <Link href="/demo" className="ui-secondary mt-5">デモ一覧へ戻る</Link>
  </main>;
}
