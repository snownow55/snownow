import { japanDate } from "./official-conditions.ts";

export type FacilityFormat = "html" | "json" | "rss";
type Field = "new_snow" | "snowfall_24h" | "snow_depth" | "temperature" | "snow_quality";
type Labels = Partial<Record<Field, RegExp>>;
type Adapter = {
  resortName: string;
  url: string;
  format: FacilityFormat;
  parse(body: unknown, fetched: Date): Record<string, unknown>;
};
const labels = {
  snowfall_24h: /^(?:24時間(?:降雪量?|積雪量)|SNOW LAST 24h|24h(?:降雪量?)?)\s*[:：]?\s*/i,
  new_snow: /^(?:昨晩からの(?:山頂)?降雪量?|昨晩からの新雪量?|新雪量?)\s*[:：]?\s*/,
  snow_depth: /^(?:総積雪量?|積雪(?:量|深)?)\s*[:：]?\s*/,
  temperature: /^(?:気温|温度)\s*[:：]?\s*/,
  snow_quality: /^雪質\s*[:：]?\s*/,
};
const station = /^(?:山頂(?:エリア)?|山麓(?:エリア)?|山頂・上部|山麓・下部|TOP|BASE|SUMMIT)$/i;
const jstDate = /(\d{4})\s*(?:[-/.]|年)\s*(\d{1,2})\s*(?:[-/.]|月)\s*(\d{1,2})(?:日)?/;

function decode(text: string) {
  return text.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, entity =>
    ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " ", "&#39;": "'" })[entity] ?? entity);
}

function lines(html: string): string[] {
  return decode(html.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?(?:td|th|tr|dt|dd|div|p|time|header|section|li|h[1-6]|br)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, ""))
    .normalize("NFKC").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function dateOn(line: string): string | undefined {
  const match = jstDate.exec(line);
  if (!match) return undefined;
  const [, year, month, day] = match;
  return year + "-" + month.padStart(2, "0") + "-" + day.padStart(2, "0");
}

function dateAndTime(line: string, date: string, allowUndated = false): string | undefined {
  if (!allowUndated && !dateOn(line)) return undefined;
  const time = /(?:午前\s*)?(\d{1,2})(?:[:：](\d{2})|時(?:(\d{1,2})分)?)/.exec(line.replace(jstDate, ""));
  return time ? date + "T" + time[1].padStart(2, "0") + ":" + (time[2] ?? time[3] ?? "0").padStart(2, "0") + ":00+09:00" : undefined;
}

function location(name?: string) {
  if (!name) return {};
  return { location_name: name, location_kind: /山頂|TOP|SUMMIT/i.test(name) ? "summit" : "base" };
}

function measure(raw: unknown, unit: "cm" | "C") {
  if (typeof raw === "number") return { value: raw, unit };
  if (typeof raw !== "string") return null;
  const value = raw.normalize("NFKC").trim().replace(/−/g, "-");
  const pattern = unit === "cm" ? /^([+-]?\d+(?:\.\d+)?)\s*(cm)?$/i : /^([+-]?\d+(?:\.\d+)?)\s*(°C|℃|C)?$/i;
  const match = pattern.exec(value);
  return match ? { value: Number(match[1]), unit } : null;
}

function fixedHtml(heading: RegExp, fields: Labels, period?: string) {
  return (body: unknown, fetched: Date) => {
    if (typeof body !== "string") throw new Error("Expected HTML");
    // Bound extraction at the next unrelated headings, while retaining station headings.
    const all = lines(body.replace(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]\s*>/gi, (element, contents: string) => {
      const title = lines(contents).join(" ");
      return heading.test(title) || station.test(title) ? element : "<p>\u0001</p>" + element;
    }));
    const start = all.findIndex(line => heading.test(line));
    const missing = { status: "missing", observation_date: japanDate(fetched) };
    if (start < 0) return missing;
    const end = all.indexOf("\u0001", start + 1);
    const block = all.slice(start, end < 0 ? start + 100 : Math.min(end, start + 100));
    const stationStarts = block.flatMap((line, i) => station.test(line) ? [i] : []);
    const shared = block.slice(0, stationStarts[0] ?? block.length);
    const dateLabel = /^(?:観測(?:日|時刻|日時)?|計測(?:日|日時)?|更新(?:日|時刻|日時)?|発表(?:日|日時)?)/;
    const dates = (rows: string[]) => rows.filter(line => dateLabel.test(line)).map(dateOn).filter(Boolean);
    const stations = stationStarts.map((index, i) => block.slice(index, stationStarts[i + 1] ?? block.length));
    if (!stations.length) stations.push(block);
    stations.sort((a, b) => Number(/山頂|TOP|SUMMIT/i.test(b[0])) - Number(/山頂|TOP|SUMMIT/i.test(a[0])));
    let older: Record<string, unknown> | undefined;
    for (const rows of stations) {
      const datesHere = new Set([...dates(shared), ...dates(rows)]);
      const date = [...datesHere][0];
      if (!date || datesHere.size !== 1) continue;
      const clock = [...rows, ...shared].find(line => dateLabel.test(line) && dateOn(line) === date);
      const at = clock && dateAndTime(clock, date);
      const report: Record<string, unknown> = {
        status: /整備運休|営業準備中|シーズン終了|休場/.test(shared.join(" ")) ? "closed" : "success",
        observation_date: date, ...location(station.test(rows[0]) ? rows[0] : undefined),
        ...(clock?.startsWith("更新") || clock?.startsWith("発表") ? { published_at: at } : { observed_at: at }),
        snowfall_period: period,
      };
      for (const [field, pattern] of Object.entries(fields)) {
        const index = rows.findIndex(line => pattern.test(line));
        if (index < 0) continue;
        const raw = rows[index].replace(pattern, "").trim() || rows[index + 1] || "";
        report[field] = field === "snow_quality" ? (/^[-—–－]+$/.test(raw) ? null : raw)
          : measure(raw, field === "temperature" ? "C" : "cm");
      }
      if (report.status === "closed" || Object.keys(fields).some(field => report[field] != null)) {
        if (date === japanDate(fetched)) return report;
        if (date < japanDate(fetched) && (!older || String(older.observation_date) < date)) older = report;
      }
    }
    return older ?? missing;
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function furano(body: unknown, fetched: Date) {
  const feed = record(body);
  if (!Array.isArray(feed?.weathers)) throw new Error("Unknown weathers schema");
  for (const name of ["山頂", "山麓"]) {
    const station = feed.weathers.map(record).find(row => row?.name === name);
    if (!station) continue;
    // The operating message in info.data is not observation metadata.
    const observed = typeof station.observed_at === "string" ? station.observed_at : undefined;
    const at = observed && new Date(observed);
    if (!at || !Number.isFinite(at.getTime())) continue;
    const new_snow = measure(station.last_snowfall, "cm");
    const snow_depth = measure(station.snowbase, "cm");
    const temperature = measure(station.temperature, "C");
    if (new_snow || snow_depth || temperature) return {
      status: "success", observation_date: japanDate(at), observed_at: observed, ...location(name),
      new_snow, snow_depth, temperature, snowfall_period: "降雪量（期間未発表）",
    };
  }
  return { status: "missing", observation_date: japanDate(fetched) };
}

function rssField(item: string, tag: string) {
  return new RegExp("<" + tag + "\\b[^>]*>([\\s\\S]*?)</" + tag + "\\s*>", "i")
    .exec(item)?.[1].trim().replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1") ?? "";
}

function rss(endpoint: string, withTemperature: boolean) {
  return (body: unknown, fetched: Date) => {
    if (typeof body !== "string" || !/<rss\b/i.test(body) || /<!DOCTYPE|<!ENTITY/i.test(body)) throw new Error("Unknown RSS schema");
    const candidates: { timestamp: number; report: Record<string, unknown> }[] = [];
    for (const match of body.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi)) {
      const item = match[1];
      const pubDate = rssField(item, "pubDate");
      if (!/(?:GMT|UTC|[+-]\d{4})$/i.test(pubDate)) continue;
      const published = new Date(pubDate);
      if (!Number.isFinite(published.getTime()) || published > fetched || !rssField(item, "guid")) continue;
      let link: URL;
      try { link = new URL(decode(rssField(item, "link"))); } catch { continue; }
      if (link.origin !== new URL(endpoint).origin || link.username || link.password || link.hash) continue;
      const date = japanDate(published);
      const content = lines(rssField(item, "content:encoded") || rssField(item, "description")).join(" ");
      const article = lines(rssField(item, "title")).join(" ") + " " + content;
      const fullDate = dateOn(article);
      const short = /(?:^|[^\d])(\d{1,2})月(\d{1,2})日/.exec(article);
      const articleDate = fullDate ?? (short && date.slice(0, 4) + "-" + short[1].padStart(2, "0") + "-" + short[2].padStart(2, "0"));
      if (articleDate !== date) continue;
      const snow = /(昨夜から|昨晩から|昨日から|営業終了後から)(?:の)?(?:新雪|降雪|雪)?\s*(?:は|が|[:：])?\s*(約)?\s*(\d+(?:\.\d+)?)\s*cm/i.exec(content);
      if (!snow) continue;
      const temperature = withTemperature ? /(?:気温)\s*[:：]?\s*([+−-]?\d+(?:\.\d+)?\s*(?:℃|°C))/i.exec(content) : null;
      candidates.push({ timestamp: published.getTime(), report: {
        status: "success", observation_date: date, published_at: published.toISOString(), reference_url: link.href,
        new_snow: measure(snow[3], "cm"), snowfall_period: snow[1] + (snow[2] ? "（約）" : ""),
        temperature: temperature ? measure(temperature[1], "C") : null,
      } });
    }
    return candidates.sort((a, b) => b.timestamp - a.timestamp)[0]?.report
      ?? { status: "missing", observation_date: japanDate(fetched) };
  };
}

function html(resortName: string, url: string, heading: RegExp, fields: Labels, period?: string): Adapter {
  return { resortName, url, format: "html", parse: fixedHtml(heading, fields, period) };
}

const kitanaganuma = "https://ski-kitanaganuma.com/feed/";
const horotachi = "https://www.horotachi-horokanai.com/blog-feed.xml";
const { snowfall_24h, new_snow, snow_depth, temperature, snow_quality } = labels;
const four = { snowfall_24h, snow_depth, temperature, snow_quality };
const adapters = new Map<string, Adapter>([
  ["kurodake-html", html("大雪山黒岳スキー場", "https://rinyu.co.jp/kurodake/index.html", /^本日の運行(?:状況|情報)/, { temperature })],
  ["teine-html", html("サッポロテイネ", "https://sapporo-teine.com/snow/gelande-report", /^ゲレンデレポート/, four)],
  ["kiroro-html", html("キロロ", "https://www.kiroro.co.jp/ja/dashboard/", /^(?:ゲレンデ情報|ゲレンデコンディション|Snow Report)/i, four)],
  ["onze-html", html("オーンズ", "https://onze.jp/", /^(?:本日の)?営業情報/, { snow_depth, temperature, snow_quality })],
  ["kitanaganuma-rss", { resortName: "北長沼スキー場", url: kitanaganuma, format: "rss", parse: rss(kitanaganuma, false) }],
  ["kamui-html", html("カムイスキーリンクス", "https://www.kamui-skilinks.com/", /^(?:ゲレンデ情報|ゲレンデコンディション)/, { new_snow, snow_depth, temperature }, "昨晩から")],
  ["tomamu-html", html("星野リゾート トマム", "https://www.snowtomamu.jp/winter/ski/ski-slope/condition/", /^(?:ゲレンデコンディション|スキー場営業情報)/, four)],
  ["furano-json", { resortName: "富良野スキー場", url: "https://furapuri.com/ski/data.json", format: "json", parse: furano }],
  ["horotachi-rss", { resortName: "ほろたちスキー場", url: horotachi, format: "rss", parse: rss(horotachi, true) }],
]);

export function facilityAdapter(key: string) {
  return adapters.get(key);
}
