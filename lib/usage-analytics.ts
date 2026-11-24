export const USAGE_EVENT_TYPES = ["visit", "page_view", "session_start", "pwa_install"] as const;
export const USAGE_MODES = ["browser", "standalone"] as const;
export const USAGE_PLATFORMS = ["android", "iphone", "ipad", "other"] as const;
export const USAGE_SOURCES = ["x", "instagram", "line", "facebook", "youtube", "tiktok", "other", "direct_unknown"] as const;
export const USAGE_PAGES = ["home", "resort", "post", "settings", "login", "signup", "account_delete", "terms", "privacy", "contact", "access", "other"] as const;
export type UsageSource = typeof USAGE_SOURCES[number];
export type UsageMode = typeof USAGE_MODES[number];
export type UsageEvent = {
  event_id: string; day_jst: string; visitor_day_id: string; session_id: string;
  event_type: typeof USAGE_EVENT_TYPES[number]; display_mode: UsageMode;
  platform: typeof USAGE_PLATFORMS[number]; entry_source: UsageSource; page_kind: typeof USAGE_PAGES[number];
};
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SESSION_IDLE_MS = 30 * 60 * 1000;
export function usageDay(now: number): string { return new Date(now + 9 * 3600000).toISOString().slice(0, 10); }
export function usageMode(standalone: boolean, iosStandalone?: boolean): UsageMode { return standalone || iosStandalone === true ? "standalone" : "browser"; }
export function usagePlatform(agent: string, platform = "", touches = 0): UsageEvent["platform"] {
  if (/Android/i.test(agent)) return "android";
  if (/iPhone|iPod/i.test(agent)) return "iphone";
  if (/iPad/i.test(agent) || (platform === "MacIntel" && touches > 1)) return "ipad";
  return "other";
}
export function usagePage(path: string): UsageEvent["page_kind"] | null {
  const pages: Record<string, UsageEvent["page_kind"]> = { "/": "home", "/post": "post", "/settings": "settings", "/login": "login", "/signup": "signup", "/account/delete": "account_delete", "/terms": "terms", "/privacy": "privacy", "/contact": "contact", "/access": "access" };
  if (pages[path]) return pages[path];
  return /^\/resort\/[^/]+$/.test(path) ? "resort" : null;
}
export function usageSource(search: string, referrer: string, ownHost = "snowviking.jp"): UsageSource {
  const value = new URLSearchParams(search).get("utm_source")?.trim().toLowerCase();
  const aliases: Record<string, UsageSource> = { x: "x", twitter: "x", instagram: "instagram", ig: "instagram", line: "line", facebook: "facebook", fb: "facebook", youtube: "youtube", yt: "youtube", tiktok: "tiktok", tik_tok: "tiktok" };
  if (value) return aliases[value] ?? "other";
  if (!referrer) return "direct_unknown";
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    if (host === ownHost) return "direct_unknown";
    const matches = (domain: string) => host === domain || host.endsWith("." + domain);
    for (const [domains, source] of [ [["x.com", "twitter.com", "t.co"], "x"], [["instagram.com"], "instagram"], [["line.me"], "line"], [["facebook.com", "fb.com"], "facebook"], [["youtube.com", "youtu.be"], "youtube"], [["tiktok.com"], "tiktok"] ] as const) if (domains.some(matches)) return source;
    return "other";
  } catch { return "direct_unknown"; }
}
export function safeUsageUrl(raw: string): string | null {
  try { const u = new URL(raw); const kind = usagePage(u.pathname); if (u.origin !== "https://snowviking.jp" || !kind) return null;
    return u.origin + (kind === "resort" ? "/resort/[name]" : u.pathname);
  } catch { return null; }
}
export function validUsageBatch(value: unknown, day: string): value is UsageEvent[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) return false;
  return value.every(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const e = item as Record<string, unknown>;
    return Object.keys(e).length === 9 && e.day_jst === day
      && [e.event_id,e.visitor_day_id,e.session_id].every(x => typeof x === "string" && UUID.test(x))
      && (USAGE_EVENT_TYPES as readonly unknown[]).includes(e.event_type) && (USAGE_MODES as readonly unknown[]).includes(e.display_mode)
      && (USAGE_PLATFORMS as readonly unknown[]).includes(e.platform) && (USAGE_SOURCES as readonly unknown[]).includes(e.entry_source)
      && (USAGE_PAGES as readonly unknown[]).includes(e.page_kind);
  });
}
type StorageLike = Pick<Storage, "getItem" | "setItem">;
type Session = { id: string; day: string; mode: UsageMode; last: number; source: UsageSource; visits: string[] };
export type UsageContext = { now: number; path: string; mode: UsageMode; platform: UsageEvent["platform"]; source: UsageSource };
export class UsageTracker {
  private lastPath: string | null = null;
  private session: Session | null = null;
  private local: StorageLike;
  private tab: StorageLike;
  private random: () => string;
  constructor(local: StorageLike, tab: StorageLike, random: () => string) { this.local = local; this.tab = tab; this.random = random; }
  activate(context: UsageContext, pageView = false): UsageEvent[] {
    const page = usagePage(context.path); if (!page) return [];
    const day = usageDay(context.now);
    let visitor: { day: string; id: string } | null = null;
    try { visitor = JSON.parse(this.local.getItem("snow-usage-visitor") ?? "null"); } catch { /* Reset invalid local metadata. */ }
    if (visitor?.day !== day || !UUID.test(visitor?.id ?? "")) { visitor = { day, id: this.random() }; this.local.setItem("snow-usage-visitor", JSON.stringify(visitor)); }
    if (!this.session) {
      try { const s = JSON.parse(this.tab.getItem("snow-usage-session") ?? "null");
        if (s && typeof s.day === "string" && UUID.test(s.id) && (USAGE_MODES as readonly string[]).includes(s.mode) && Number.isFinite(s.last)
          && (USAGE_SOURCES as readonly string[]).includes(s.source) && Array.isArray(s.visits) && s.visits.every((v: unknown) => typeof v === "string")) this.session = s;
      } catch { /* Reset invalid session metadata. */ }
    }
    const previousVisits = this.session?.visits.filter(v => v.startsWith(day + ":")) ?? [];
    const fresh = !this.session || this.session.mode !== context.mode || context.now - this.session.last >= SESSION_IDLE_MS || context.now < this.session.last;
    if (fresh) this.session = { id: this.random(), day, mode: context.mode, last: context.now, source: context.source, visits: previousVisits };
    const s = this.session!;
    if (s.day !== day) { s.id = this.random(); s.day = day; }
    s.visits = previousVisits; s.last = context.now;
    const make = (event_type: UsageEvent["event_type"]): UsageEvent => ({ event_id: this.random(), day_jst: day, visitor_day_id: visitor!.id, session_id: s.id,
      event_type, display_mode: context.mode, platform: context.platform, entry_source: s.source, page_kind: page });
    const result: UsageEvent[] = [];
    const visitKey = day + ":" + context.mode;
    if (!s.visits.includes(visitKey)) { result.push(make("visit")); s.visits.push(visitKey); }
    if (fresh) result.push(make("session_start"));
    if (pageView && this.lastPath !== context.path) { result.push(make("page_view")); this.lastPath = context.path; }
    this.tab.setItem("snow-usage-session", JSON.stringify(s)); return result;
  }
  install(context: UsageContext): UsageEvent[] {
    const events = this.activate(context);
    const s = this.session; const page = usagePage(context.path); if (!s || !page) return events;
    const visitor = JSON.parse(this.local.getItem("snow-usage-visitor")!);
    return [...events, { event_id: this.random(), day_jst: usageDay(context.now), visitor_day_id: visitor.id, session_id: s.id,
      event_type: "pwa_install", display_mode: context.mode, platform: context.platform, entry_source: s.source, page_kind: page }];
  }
}
