import { useMemo, useSyncExternalStore } from "react";
let revision = 0;
const eventName = "snow-native-location";
export function initializeNavigation() {
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method].bind(history);
    history[method] = (...args) => { original(...args); window.dispatchEvent(new Event(eventName)); };
  }
}
function subscribe(notify: () => void) {
  window.addEventListener(eventName, notify); window.addEventListener("popstate", notify);
  return () => { window.removeEventListener(eventName, notify); window.removeEventListener("popstate", notify); };
}
function snapshot() { return location.pathname + location.search + "|" + revision; }
export function useLocation() { return useSyncExternalStore(subscribe, snapshot, snapshot); }
export function navigate(url: string, replace = false) {
  const target = new URL(url, location.href);
  if (target.origin !== location.origin) throw new Error("External navigation refused");
  history[replace ? "replaceState" : "pushState"]({}, "", target.pathname + target.search + target.hash);
}
export function useRouter() {
  return useMemo(() => ({ push: (url: string, _options?: { scroll?: boolean }) => navigate(url), replace: (url: string, _options?: { scroll?: boolean }) => navigate(url, true),
    refresh: () => { revision++; window.dispatchEvent(new Event(eventName)); } }), []);
}
export function useSearchParams() { const value = useLocation(); return useMemo(() => new URLSearchParams(value.split("|")[0].split("?")[1] ?? ""), [value]); }
export function useParams<T extends Record<string, string> = { name: string }>() {
  const value = useLocation(); return useMemo(() => {
    const match = value.split("|")[0].split("?")[0].match(/^\/resort\/(.+)$/);
    try { return { name: match ? decodeURIComponent(match[1]) : "" } as unknown as T; } catch { return { name: "" } as unknown as T; }
  }, [value]);
}
