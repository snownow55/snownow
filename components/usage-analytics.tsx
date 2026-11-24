"use client";
import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Analytics } from "@vercel/analytics/next";
import { UsageTracker, usageMode, usagePlatform, usageSource, safeUsageUrl, type UsageEvent } from "@/lib/usage-analytics";

class Controller {
  private core = new UsageTracker(window.localStorage, window.sessionStorage, () => crypto.randomUUID());
  private refs = 0;
  private failed = false;
  private first = true;
  private lastActivity = 0;
  private media = window.matchMedia("(display-mode: standalone)");
  private initialSource = usageSource(location.search, document.referrer);
  private context() {
    const nav = navigator as Navigator & { standalone?: boolean };
    return { now: Date.now(), path: location.pathname, mode: usageMode(this.media.matches, nav.standalone),
      platform: usagePlatform(nav.userAgent, nav.platform, nav.maxTouchPoints), source: this.first ? this.initialSource : "direct_unknown" as const };
  }
  private send(events: UsageEvent[]) {
    for (let i = 0; i < events.length; i += 3) {
      void fetch("/api/usage", { method: "POST", credentials: "omit", cache: "no-store", redirect: "error", keepalive: true,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(events.slice(i, i + 3)) }).catch(() => {});
    }
  }
  route = () => {
    if (this.failed) return;
    try { this.send(this.core.activate(this.context(), true)); this.first = false; } catch { this.failed = true; }
  };
  private activate = () => {
    if (this.failed || document.visibilityState !== "visible") return;
    try { this.send(this.core.activate(this.context())); this.first = false; } catch { this.failed = true; }
  };
  private activity = () => { const now = Date.now(); if (now - this.lastActivity >= 30_000) { this.lastActivity = now; this.activate(); } };
  private installed = () => {
    if (this.failed) return;
    try { this.send(this.core.install(this.context())); this.first = false; } catch { this.failed = true; }
  };
  retain() {
    if (++this.refs === 1) {
      window.addEventListener("focus", this.activate); window.addEventListener("pageshow", this.activate);
      window.addEventListener("appinstalled", this.installed); this.media.addEventListener("change", this.activate);
      document.addEventListener("visibilitychange", this.activate);
      document.addEventListener("pointerdown", this.activity, { passive: true }); document.addEventListener("keydown", this.activity);
    }
    return () => {
      if (--this.refs === 0) {
        window.removeEventListener("focus", this.activate); window.removeEventListener("pageshow", this.activate);
        window.removeEventListener("appinstalled", this.installed); this.media.removeEventListener("change", this.activate);
        document.removeEventListener("visibilitychange", this.activate);
        document.removeEventListener("pointerdown", this.activity); document.removeEventListener("keydown", this.activity);
      }
    };
  }
}
let controller: Controller | undefined;
const subscribeOrigin = () => () => {};
const productionEnabled = () => process.env.NEXT_PUBLIC_USAGE_ANALYTICS_ENABLED === "true" && location.origin === "https://snowviking.jp";
export function UsageAnalytics() {
  const pathname = usePathname(); const enabled = useSyncExternalStore(subscribeOrigin, productionEnabled, () => false);
  useEffect(() => {
    if (!enabled) return;
    try { controller ??= new Controller(); return controller.retain(); } catch { /* Storage denied: skip independent ID tracking. */ }
  }, [enabled]);
  useEffect(() => { if (enabled) controller?.route(); }, [pathname, enabled]);
  return enabled ? <Analytics beforeSend={event => {
    const url = safeUsageUrl(event.url); return url ? { ...event, url } : null;
  }} /> : null;
}
