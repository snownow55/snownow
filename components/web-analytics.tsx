"use client";
import { useSyncExternalStore } from "react";
import { Analytics } from "@vercel/analytics/next";
import { safeAnalyticsUrl } from "@/lib/web-analytics";
const subscribe = () => () => {};
const isPublicOrigin = () => location.origin === "https://snowviking.jp";
export function WebAnalytics() {
  const enabled = useSyncExternalStore(subscribe, isPublicOrigin, () => false);
  return enabled ? <Analytics beforeSend={event => {
    const url = safeAnalyticsUrl(event.url);
    return url ? { ...event, url } : null;
  }} /> : null;
}
