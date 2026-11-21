import { isCurrentOfficial, officialStatusLabel, type OfficialCondition } from "@/lib/official-conditions";

export function OfficialConditions({ condition, now }: { condition?: OfficialCondition; now?: Date | null }) {
  const current = !!condition && !!now && isCurrentOfficial(condition, now);
  const status = condition && !now ? "未取得" : officialStatusLabel(condition, now ?? new Date());
  const fields: [string, string][] = [
    ["新雪量", current && condition.new_snow_cm !== null ? `新雪 +${condition.new_snow_cm}cm` : "—"],
    ["積雪量", current && condition.snow_depth_cm !== null ? `${condition.snow_depth_cm}cm` : "—"],
    ["気温", current && condition.temperature_c !== null ? `${condition.temperature_c}℃` : "—"],
  ];
  if (current && condition.official_snow_quality?.trim()) fields.push(["公式雪質", condition.official_snow_quality]);
  const showTime = (time: string) => <time dateTime={time}>{new Date(time).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</time>;
  return <div role="group" aria-label="朝の公式情報">
    {status && <p className="mb-2 text-xs text-slate-500">{status}</p>}
    <dl className="grid grid-cols-2 gap-2">
      {fields.map(([label, value]) => <div key={label} className="min-w-0 rounded-lg bg-brand-soft px-3 py-2">
        <dt className="text-[10px] text-slate-600">{label}</dt>
        <dd className="mt-1 text-sm font-semibold text-slate-600">{value}</dd>
      </div>)}
    </dl>
    {current && <p className="mt-2 text-[10px] text-slate-500">観測日：{condition.observation_date} · {condition.location_name}</p>}
    {current && condition.new_snow_cm !== null && condition.snowfall_period && <p className="mt-1 text-[10px] text-slate-500">
      新雪の観測期間：{condition.snowfall_period}
    </p>}
    {current && condition.published_at && <p aria-label="公式情報の発表日時" className="mt-2 text-[10px] text-slate-500">
      公式発表時刻：{showTime(condition.published_at)}
    </p>}
    {current && condition.fetched_at && <p className="mt-1 text-[10px] text-slate-500">
      取得時刻：{showTime(condition.fetched_at)}
    </p>}
    {condition && <a href={condition.source_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-11 items-center text-xs text-brand underline">公式情報を見る</a>}
  </div>;
}

export function OfficialConditionsSection() {
  return <section aria-label="朝のコンディション（公式情報）" className="ui-card my-5 p-4">
    <h2 className="mb-2 font-bold">朝のコンディション（公式情報）</h2>
    <p className="mb-3 text-xs leading-relaxed text-slate-600">公式情報は未取得です。現地投稿・架空サンプルからの補完は行っていません。</p>
    <OfficialConditions />
  </section>;
}
