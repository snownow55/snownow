// A configured canonical origin avoids trusting Host / forwarded headers for redirects.
export function siteOrigin(requestUrl: string): string | null {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    const url = new URL(configured || requestUrl);
    if (
      url.username ||
      url.password ||
      (configured && (url.pathname !== "/" || url.search || url.hash))
    )
      return null;
    if (url.protocol === "https:" && configured) return url.origin;
    if (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
      (configured || process.env.NODE_ENV !== "production")
    )
      return url.origin;
  } catch {
    /* Missing or invalid configuration is handled by the caller. */
  }
  return null;
}

// POST only: redirects continue to use the canonical siteOrigin above.
// Trust exact server-provided Vercel hosts, never Host/forwarded headers or a
// wildcard that would include other projects. Production keeps its old policy.
export function isAllowedPostOrigin(requestUrl: string, origin: string | null): boolean {
  if (!origin) return false;
  const canonical = siteOrigin(requestUrl);
  if (canonical && origin === canonical) return true;
  if (process.env.VERCEL !== "1" || process.env.VERCEL_ENV !== "preview") return false;

  return [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL].some((host) => {
    if (!host || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/i.test(host)) return false;
    return origin === `https://${host.toLowerCase()}`;
  });
}
