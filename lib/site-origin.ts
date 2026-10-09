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
