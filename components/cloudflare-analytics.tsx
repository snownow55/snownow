"use client";
import Script from "next/script";
export function CloudflareAnalytics() {
  const token = process.env.NEXT_PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN;
  // Public beacon token only; missing configuration leaves analytics disabled.
  if (!token || !/^[a-f0-9]{32}$/i.test(token)) return null;
  return <Script id="cloudflare-web-analytics" strategy="afterInteractive"
    src="https://static.cloudflareinsights.com/beacon.min.js"
    data-cf-beacon={JSON.stringify({ token, spa: true })} />;
}
