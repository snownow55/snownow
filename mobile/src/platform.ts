import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { AppLauncher } from "@capacitor/app-launcher";
import { supabase } from "./supabase";
import { callbackUrl, recoveryState } from "./auth-form";
import { navigate } from "./next/navigation";
export function initializePlatform() {
  document.addEventListener("click", event => {
    const anchor = (event.target as Element).closest?.("a[href]"); if (!anchor) return;
    const url = new URL(anchor.getAttribute("href")!, location.href);
    if (url.origin === location.origin) return;
    event.preventDefault();
    if (url.protocol === "https:") {
      if (Capacitor.isNativePlatform()) void Browser.open({ url: url.href }).catch(() => window.dispatchEvent(new CustomEvent("snow-native-error", { detail: "外部リンクを開けませんでした。" }))); else window.open(url.href, "_blank", "noopener,noreferrer");
    } else if (url.protocol === "mailto:") {
      if (Capacitor.isNativePlatform()) void AppLauncher.openUrl({ url: url.href }).catch(() => window.dispatchEvent(new CustomEvent("snow-native-error", { detail: "メールアプリを開けませんでした。" }))); else location.href = url.href;
    }
  });
  if (!Capacitor.isNativePlatform()) return;
  let recovering = false;
  supabase?.auth.onAuthStateChange(event => { if (event === "PASSWORD_RECOVERY") { recovering = true; recoveryState.allowed = true; } });
  async function openUrl(value: string) {
    try {
      const url = new URL(value); const expected = new URL(callbackUrl);
      if (url.protocol !== expected.protocol || url.host !== expected.host || url.pathname !== expected.pathname || url.hash || !supabase) return;
      const code = url.searchParams.get("code"); if (!code) return;
      recovering = false;
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      navigate(recovering ? "/reset-password" : "/", true);
    } catch { window.dispatchEvent(new CustomEvent("snow-native-error", { detail: "認証リンクを確認できませんでした。メールを再発行してください。" })); }
  }
  void App.addListener("appUrlOpen", event => { void openUrl(event.url); });
  void App.getLaunchUrl().then(result => { if (result?.url) void openUrl(result.url); });
  void App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) { supabase?.auth.startAutoRefresh(); window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); }
    else supabase?.auth.stopAutoRefresh();
  });
}
