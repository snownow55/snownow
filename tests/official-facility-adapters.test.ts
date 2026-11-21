import { test } from "node:test";
import assert from "node:assert/strict";
import { collectOfficialConditions, type CollectionStore } from "../lib/official-collector.ts";
import { facilityAdapter } from "../lib/official-facility-adapters.ts";

const now = () => new Date("2026-11-21T01:00:00Z");
const date = "2026/11/21 08:00";
const field = (name: string, value: string) => "<dt>" + name + "</dt><dd>" + value + "</dd>";
const html = (heading: string, body: string, when = date) =>
  "<h2>" + heading + "</h2><p>観測日時：" + when + "</p><dl>" + body + "</dl>";

async function ingest(key: string, body: string | object, override: Record<string, unknown> = {}) {
  const adapter = facilityAdapter(key);
  assert.ok(adapter);
  const source = {
    id: 1, resort_id: 46, resort_name: adapter.resortName, source_url: adapter.url,
    adapter_key: key, enabled: true, access_permission: "allowed", publication_permission: "allowed",
    ...override,
  } as Awaited<ReturnType<CollectionStore["loadSource"]>>;
  const rows: Parameters<CollectionStore["store"]>[1][] = [];
  let calls = 0;
  const store: CollectionStore = {
    loadSource: async () => source,
    async store(_, row) { rows.push(row); return "saved"; },
  };
  const results = await collectOfficialConditions([{ id: 1, url: adapter.url }], store, {
    now,
    request: async (url, options) => {
      calls++;
      assert.equal(url, adapter.url);
      assert.equal(options?.redirect, "error");
      if (typeof body === "object") return Response.json(body);
      return new Response(body, { headers: { "content-type": adapter.format === "html" ? "text/html" : "application/rss+xml" } });
    },
  });
  return { row: rows[0], results, calls };
}

test("fixed HTML profile only takes documented fields for each facility", async () => {
  const all = field("24時間降雪量", "0 cm") + field("積雪量", "80cm") + field("気温", "−3℃")
    + field("雪質", "圧雪") + field("累計降雪量", "600cm");
  for (const [key, heading, snow, depth] of [
    ["kurodake-html", "本日の運行状況", null, null], ["teine-html", "ゲレンデレポート", 0, 80],
    ["kiroro-html", "ゲレンデ情報", 0, 80], ["onze-html", "本日の営業情報", null, 80],
    ["kamui-html", "ゲレンデコンディション", null, 80], ["tomamu-html", "スキー場営業情報", 0, 80],
  ] as const) {
    const { row } = await ingest(key, html(heading, all));
    assert.equal(row.status, "success", key);
    assert.equal(row.new_snow_cm, snow, key);
    assert.equal(row.snow_depth_cm, depth, key);
    assert.equal(row.temperature_c, -3, key);
    assert.equal(row.observed_at, "2026-11-20T23:00:00.000Z", key);
  }
  const { row } = await ingest("kamui-html", html("ゲレンデ情報", field("昨晩からの山頂降雪", "12cm") + all));
  assert.equal(row.new_snow_cm, 12);
  assert.equal(row.snowfall_period, "昨晩から");
});

test("HTML keeps dated zero, masks residual zero, and never fills summit by mixing stations or sections", async () => {
  const station = "<h3>山頂</h3>" + field("24時間降雪量", "0 cm") + field("気温", "-4℃")
    + "<h3>山麓</h3>" + field("積雪量", "45cm") + field("気温", "1℃");
  const current = await ingest("kiroro-html", html("ゲレンデ情報", station));
  assert.deepEqual([current.row.location_kind, current.row.new_snow_cm, current.row.snow_depth_cm], ["summit", 0, null]);
  const old = await ingest("kiroro-html", html("ゲレンデ情報", station, "2026/04/05 08:00"));
  assert.deepEqual([old.row.status, old.row.new_snow_cm], ["stale", null]);
  const undated = await ingest("kiroro-html", html("ゲレンデ情報", station, "11/21 08:00"));
  assert.deepEqual([undated.row.status, undated.row.new_snow_cm], ["missing", null]);
  const boundary = await ingest("teine-html", html("ゲレンデレポート", field("24時間降雪量", "—"))
    + "<h2>別施設の予報</h2>" + field("気温", "7℃"));
  assert.equal(boundary.row.status, "missing");
  const conflict = await ingest("tomamu-html", html("ゲレンデコンディション",
    "<h3>山頂</h3><p>更新日時：2026/11/20 08:00</p>" + field("24時間降雪量", "0cm")));
  assert.equal(conflict.row.status, "missing");
});

test("Furano JSON keeps station measurements independent and never dates using the operating announcement", async () => {
  const observed_at = "2026-11-21T08:00:00+09:00";
  const base = { name: "山麓", snowbase: "90cm", temperature: "2℃", observed_at };
  const summit = { name: "山頂", last_snowfall: "0", snowbase: "", temperature: "-7", observed_at };
  const { row } = await ingest("furano-json", { info: { data: "11/28 オープン予定" }, weathers: [base, summit] });
  assert.deepEqual([row.location_name, row.new_snow_cm, row.snow_depth_cm, row.temperature_c], ["山頂", 0, null, -7]);
  const undated = await ingest("furano-json", { info: { data: "2026-11-21" }, weathers: [{ ...summit, observed_at: undefined }] });
  assert.equal(undated.row.status, "missing");
});

test("both RSS profiles require matching article and publication dates, and preserve the same-origin permalink", async () => {
  for (const [key, snow, temp] of [["kitanaganuma-rss", "昨夜から約30cmの新雪", null], ["horotachi-rss", "昨日からの降雪0cm。気温：+2℃", 2]] as const) {
    const adapter = facilityAdapter(key)!;
    const article = new URL("/posts/test-snow", adapter.url).href;
    const rss = (date: string, stamp: string, link = article) => "<rss><channel><item><guid>test</guid>" +
      "<link>" + link + "</link><pubDate>" + stamp + "</pubDate><title>積雪情報 " + date +
      "</title><description><![CDATA[<p>" + snow + "</p>]]></description></item></channel></rss>";
    const { row } = await ingest(key, rss("2026年11月21日", "Fri, 20 Nov 2026 23:00:00 GMT"));
    assert.equal(row.status, "success");
    assert.equal(row.new_snow_cm, temp === null ? 30 : 0);
    assert.equal(row.temperature_c, temp);
    assert.equal(row.reference_url, article);
    assert.equal(row.source_url, adapter.url);
    assert.equal((await ingest(key, rss("2026年11月20日", "Fri, 20 Nov 2026 23:00:00 GMT"))).row.status, "missing");
    assert.equal((await ingest(key, rss("2026年11月20日", "Thu, 19 Nov 2026 23:00:00 GMT"))).row.status, "stale");
    assert.equal((await ingest(key, rss("2026年11月21日", "Fri, 20 Nov 2026 23:00:00 GMT", "https://other.invalid/story"))).row.status, "missing");
  }
});

test("the worker skips wrong facility, URL or either missing permission before HTTP", async () => {
  for (const source of [
    { resort_name: "キロロ" }, { source_url: "https://fixture.invalid/" },
    { access_permission: "unconfirmed" }, { publication_permission: "denied" },
  ]) {
    const result = await ingest("teine-html", "", source);
    assert.equal(result.calls, 0);
    assert.equal(result.results[0].result, "skipped");
  }
  assert.equal(facilityAdapter("wakan-html"), undefined);
});

test("Sapporo Kokusai uses only the dated realtime cards and preserves the sole reported location", async () => {
  const card = (value: string, label: string, japanese: string) =>
    "<div><p>" + value + "</p><div><p>" + label + "</p><p>" + japanese + "</p></div></div>";
  const sample = (stamp: string, snow: string) => '<section id="toprealtime"><p>' + stamp + "</p>"
    + card(snow, "SNOWFALL", "昨晩からの降雪") + card("9m", "TOTAL SNOW ACCUMULATION", "総降雪量")
    + card("65cm", "SNOW ACCUMULATION", "山頂積雪") + card("-2.5°c", "TEMPERATURE", "気温")
    + card("圧雪", "SNOW CONDITIONS", "雪質") + "</section>"
    + card("999cm", "SNOWFALL", "昨晩からの降雪");
  const { row } = await ingest("sapporo-kokusai-html", sample("2026年11月21日09時 現在", "0<span>cm</span>"));
  assert.deepEqual([row.new_snow_cm, row.snow_depth_cm, row.temperature_c, row.official_snow_quality], [0, 65, -2.5, "圧雪"]);
  assert.equal(row.snowfall_period, "昨晩から");
  assert.equal(row.published_at, "2026-11-21T00:00:00.000Z");
  assert.equal(row.observed_at, null);
  assert.equal(row.location_kind, "unspecified");
  assert.match(row.location_name, /積雪は山頂/);
  assert.equal((await ingest("sapporo-kokusai-html", sample("2026年11月21日09時 現在", "－"))).row.new_snow_cm, null);
  assert.equal((await ingest("sapporo-kokusai-html", sample("2026年11月20日09時 現在", "0cm"))).row.status, "stale");
  assert.equal((await ingest("sapporo-kokusai-html", sample("11月21日09時 現在", "0cm"))).row.status, "missing");
});
