// Demo-only values: never pass these records to the application post API.
export const DEMO_DAY = "2026-02-14";
export const DEMO_DAY_LABEL = "2026年2月14日（日本時間）";
export const DEMO_REGION_CODE = "asahikawa-furano";
export type DemoResort = { name: string; display_name: string; region_code: string; sort_order: number };
export type DemoPost = {
  resort: string; createdAt: string; area: string; snowType: string;
  snowfall: string; roughness: string; crowd: string; comment: string;
};
export type DemoCatalog = { region: { code: string; name: string }; resorts: DemoResort[]; posts: DemoPost[] };

// Generic fictional changes, deliberately unrelated to any resort's geography
// or reputation. Scenario assignment follows the reviewed master order.
const scenarios = [
  [
    ["山頂・上部", "パウダー", "うっすら積もった", "きれい", "空いている", "朝は柔らかい雪を楽しめる想定。最初の滑走を比較するサンプルです。"],
    ["中腹", "パウダー", "そこそこ積もった", "少し荒れている", "普通", "人が通る場所は少し荒れ、脇には柔らかい雪が残る架空のシナリオ。"],
    ["山頂・上部", "パウダー", "うっすら積もった", "少し荒れている", "空いている", "午後にもパウダーが残る想定です。実際の残雪や滑走可能範囲の案内ではありません。"],
  ],
  [
    ["全体", "圧雪", "ほぼ無し", "きれい", "空いている", "朝一番の整った圧雪を想定しています。架空の比較用データです。"],
    ["中腹", "硬めの圧雪", "ほぼ無し", "少し荒れている", "普通", "時間とともに圧雪が硬く感じられる変化を想定。現地の状態ではありません。"],
    ["山麓・下部", "硬めの圧雪", "ほぼ無し", "かなり荒れている", "普通", "午後は硬い圧雪と荒れが増える想定。朝の投稿と比べるためのサンプルです。"],
  ],
  [
    ["山麓・下部", "圧雪", "うっすら積もった", "きれい", "空いている", "朝はゆったり滑れる混雑度を設定した架空のシナリオです。"],
    ["全体", "湿雪", "ほぼ無し", "少し荒れている", "普通", "昼に人が増え、雪の表面も変わる想定。実際の天候や気温とは無関係です。"],
    ["中腹", "湿雪", "ほぼ無し", "ボコボコ", "混んでいる", "午後は混雑と荒れが進む想定です。別のスキー場と比較する操作をお試しください。"],
  ],
  [
    ["中腹", "圧雪", "ほぼ無し", "きれい", "普通", "朝から一定の人出がある場合を想定した架空の投稿です。"],
    ["山頂・上部", "パウダー", "うっすら積もった", "きれい", "空いている", "場所を変えると雪質も異なる例。ゲレンデ内の位置を比較するための想定です。"],
    ["山麓・下部", "圧雪", "ほぼ無し", "少し荒れている", "空いている", "午後は空いて落ち着いたコンディションという想定。営業情報や安全情報ではありません。"],
  ],
] as const;

export function createDemoPosts(resorts: readonly DemoResort[]): DemoPost[] {
  return resorts.flatMap((resort) => {
    const index = resort.sort_order - 1;
    const times = ["09:00", "11:30", `14:${String((index % 3) * 10).padStart(2, "0")}`];
    return scenarios[index % scenarios.length].map(([area, snowType, snowfall, roughness, crowd, comment], step) => ({
      resort: resort.name, createdAt: `${DEMO_DAY}T${times[step]}:00+09:00`,
      area, snowType, snowfall, roughness, crowd, comment,
    }));
  });
}

export function demoListUrl(tab = "morning", search = "", sort = "kana"): string {
  const params = new URLSearchParams({ tab: tab === "live" ? "live" : "morning", sort: sort === "latest" ? "latest" : "kana" });
  if (search) params.set("search", search.slice(0, 200));
  return `/demo?${params}`;
}
