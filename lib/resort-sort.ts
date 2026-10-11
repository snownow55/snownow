import type { Resort } from "./resort-master";

export type ResortSort = "kana" | "latest";

// Keyed by the canonical DB name. Read the full display name, including brand names.
// Add a reading here when adding a resort; keep URLs and stored names unchanged.
export const RESORT_READINGS: Readonly<Record<string, string>> = Object.freeze({
  "さっぽろばんけい": "さっぽろばんけい",
  "サッポロテイネ": "さっぽろていね",
  "Fu'sスノーエリア": "ふっずすのーえりあ",
  "札幌国際スキー場": "さっぽろこくさいすきーじょう",
  "キロロ": "きろろ",
  "オーンズ": "すのーくるーずおーんず",
  "朝里川温泉スキー場": "あさりがわおんせんすきーじょう",
  "小樽天狗山スキー場": "おたるてんぐやますきーじょう",
  "コンサドーレ仁木スキーパーク": "こんさどーれにきすきーぱーく",
  "北長沼スキー場": "きたながぬますきーじょう",
  "マウントレースイ": "まうんとれーすい",
  "中山峠スキー場": "なかやまとうげすきーじょう",
  "札幌藻岩山スキー場": "さっぽろもいわやますきーじょう",
  "北海道グリーンランド": "ほっかいどうぐりーんらんど",
  "萩の山スキー場": "はぎのやますきーじょう",
  "桂沢国設スキー場": "かつらざわこくせつすきーじょう",
  "美唄国設スキー場": "びばいこくせつすきーじょう",
  "かもい岳スキー場": "かもいだけすきーじょう",
  "ASHIMOI KANKO 高穂スキー場": "あしもいかんこうたかほすきーじょう",
  "サンタプレゼントパーク": "さんたぷれぜんとぱーく",
  "カムイスキーリンクス": "かむいすきーりんくす",
  "キャンモアスキービレッジ": "きゃんもあすきーびれっじ",
  "ぴっぷスキー場": "ぴっぷすきーじょう",
  "旭岳ロープウェイ": "あさひだけろーぷうぇい",
  "大雪山黒岳スキー場": "たいせつざんくろだけすきーじょう",
  "富良野スキー場": "ふらのすきーじょう",
  "国設南ふらのスキー場": "こくせつみなみふらのすきーじょう",
  "和寒東山スキー場": "わっさむひがしやますきーじょう",
  "ほろたちスキー場": "ほろたちすきーじょう",
  "士別日向スキー場": "しべつひなたすきーじょう",
  "士別あさひスキー場": "しべつあさひすきーじょう",
  "名寄ピヤシリスキー場": "なよろぴやしりすきーじょう",
  "稚内市こまどりスキー場": "わっかないしこまどりすきーじょう",
  "星野リゾート トマム": "ほしのりぞーととまむ",
  "サホロリゾートスキー場": "さほろりぞーとすきーじょう",
  "日高国際スキー場": "ひだかこくさいすきーじょう",
  "ルスツリゾート": "るすつりぞーと",
  "ニセコHANAZONOリゾート": "にせこはなぞのりぞーと",
  "ニセコグラン・ヒラフ": "にせこぐらんひらふ",
  "ニセコアンヌプリ国際スキー場": "にせこあんぬぷりこくさいすきーじょう",
  "ニセコビレッジスキーリゾート": "にせこびれっじすきーりぞーと",
  "ニセコモイワスキーリゾート": "にせこもいわすきーりぞーと",
  "サンライバスキー場": "さんらいばすきーじょう",
  "オロフレスキー場": "おろふれすきーじょう",
  "今金町ピリカスキー場": "いまかねちょうぴりかすきーじょう",
  "グリーンピア大沼スキー場": "ぐりーんぴあおおぬますきーじょう",
  "函館七飯スノーパーク": "はこだてななえすのーぱーく",
  "えんがるロックバレー": "えんがるろっくばれー",
  "ノーザンアークリゾート": "のーざんあーくりぞーと",
  "網走レークビュースキー場": "あばしりれーくびゅーすきーじょう",
  "北見若松市民スキー場": "きたみわかまつしみんすきーじょう",
  "国設阿寒湖畔スキー場 ウタラ": "こくせつあかんこはんすきーじょううたら",
  "ぬかびら源泉郷スキー場": "ぬかびらげんせんきょうすきーじょう",
  "斜里町ウナベツスキー場": "しゃりちょううなべつすきーじょう",
  "紋別市営大山スキー場": "もんべつしえいおおやますきーじょう",
  "湧別町五鹿山スキー場": "ゆうべつちょうごかざんすきーじょう",
  "北見市留辺蘂町八方台スキー場": "きたみしるべしべちょうはっぽうだいすきーじょう",
  "メムロスキー場": "めむろすきーじょう",
  "美幌町リリー山スキー場": "びほろちょうりりーやますきーじょう",
});

const collator = new Intl.Collator("ja", { usage: "sort", sensitivity: "variant" });
export function compareResortReadings(left: Resort, right: Resort): number {
  // Future, unlisted masters remain usable, but need a reading for correct kana order.
  const reading = collator.compare(RESORT_READINGS[left.name] ?? left.display_name, RESORT_READINGS[right.name] ?? right.display_name);
  return reading || collator.compare(left.name, right.name) || left.id - right.id;
}

function timestampParts(value: string): [number, number] {
  // PostgreSQL timestamps have microseconds; Date.parse alone truncates them.
  const fraction = value.match(/\.(\d+)(?:Z|[+-]\d{2}:?\d{2})$/)?.[1] ?? "";
  return [Date.parse(value), Number(fraction.padEnd(6, "0").slice(3, 6))];
}

export function sortResorts(
  resorts: readonly Resort[],
  order: ResortSort,
  latestDates: ReadonlyMap<string, string> = new Map(),
): Resort[] {
  return [...resorts].sort((left, right) => {
    if (order === "latest") {
      const a = latestDates.get(left.name);
      const b = latestDates.get(right.name);
      if (a && b) {
        const [aMillis, aMicros] = timestampParts(a);
        const [bMillis, bMicros] = timestampParts(b);
        const difference = bMillis - aMillis || bMicros - aMicros;
        if (Number.isFinite(difference) && difference) return difference;
      } else if (a || b) {
        return a ? -1 : 1;
      }
    }
    return compareResortReadings(left, right);
  });
}
