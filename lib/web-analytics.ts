// Only the public application is measured. Never send query tokens or user-controlled resort slugs.
export function safeAnalyticsUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.origin !== "https://snowviking.jp") return null;
    if (/^\/resort\/[^/]+$/.test(url.pathname)) return url.origin + "/resort/[name]";
    const pages = ["/", "/post", "/settings", "/login", "/signup", "/account/delete", "/terms", "/privacy", "/contact", "/access"];
    return pages.includes(url.pathname) ? url.origin + url.pathname : null;
  } catch { return null; }
}
