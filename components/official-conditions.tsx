// Official feeds are not connected yet. Never infer these fields from user
// posts, demo scenarios, the current clock, or synthetic numeric defaults.
export function OfficialConditions() {
  return <div role="group" aria-label="朝の公式情報">
    <dl className="grid grid-cols-2 gap-2">
      {["新雪量", "雪質", "積雪量", "気温"].map((label) => <div key={label} className="min-w-0 rounded-lg bg-brand-soft px-3 py-2">
        <dt className="text-[10px] text-slate-600">{label}</dt>
        <dd className="mt-1 text-sm font-semibold text-slate-500">未取得</dd>
      </div>)}
    </dl>
    <p aria-label="公式情報の発表日時" className="mt-2 text-[10px] leading-relaxed text-slate-500">発表日時：未取得</p>
  </div>;
}

export function OfficialConditionsSection() {
  return <section aria-label="朝のコンディション（公式情報）" className="ui-card my-5 p-4">
    <h2 className="mb-2 font-bold">朝のコンディション（公式情報）</h2>
    <p className="mb-3 text-xs leading-relaxed text-slate-600">公式情報は未取得です。現地投稿・架空サンプルからの補完は行っていません。</p>
    <OfficialConditions />
  </section>;
}
