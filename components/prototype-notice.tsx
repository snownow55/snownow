export function PrototypeNotice() {
  return <aside aria-label="開発版について" className="mb-3 rounded-xl border border-orange-200 bg-accent-soft px-3 py-2 text-xs leading-relaxed text-slate-700">
    <p className="font-semibold text-accent">開発中のプロトタイプ</p>
    <p>公式情報の取得・チケット・決済・有料閲覧制御は未実装です。ロック表示は見本で、詳細ページ・APIの投稿情報は現在公開されています。</p>
  </aside>;
}

export function ResortDemoNotice({ name }: { name: string }) {
  if (name !== "ほろたちスキー場") return null;
  return <p aria-label="デモ情報の注意" className="my-3 rounded-lg bg-accent-soft p-3 text-xs leading-relaxed text-slate-700">
    ほろたちスキー場の開発用テスト投稿にはデモ情報が含まれます。実際の現地コンディションを示す情報ではありません。ゲレンデ選びの判断には使用しないでください。
  </p>;
}
