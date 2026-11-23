import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { supabase } from "./supabase";
const allowedPaths = new Set(["/api/posts", "/api/posts/manage", "/api/account/delete"]);
const configured = import.meta.env.VITE_API_BASE_URL || "https://snowviking.jp";
const base = new URL(configured);
if (base.origin !== "https://snowviking.jp" && !(import.meta.env.DEV && base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))) throw new Error("Unapproved API origin");
if (base.username || base.password || base.pathname !== "/" || base.search || base.hash) throw new Error("Invalid API base URL");
export function initializeApi() {
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    if (typeof input !== "string" || !allowedPaths.has(input)) return original(input, init);
    const { data, error } = supabase ? await supabase.auth.getSession() : { data: { session: null }, error: null };
    if (error) throw new Error("Session unavailable");
    const headers = new Headers(init?.headers);
    if (data.session?.access_token) headers.set("Authorization", `Bearer ${data.session.access_token}`);
    headers.set("Accept", "application/json");
    if (Capacitor.isNativePlatform()) {
      headers.set("Origin", "capacitor://localhost");
      const result = await CapacitorHttp.request({ url: base.origin + input, method: init?.method ?? "GET",
        headers: Object.fromEntries(headers), data: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
        connectTimeout: 15000, readTimeout: 20000, disableRedirects: true });
      return new Response(JSON.stringify(result.data), { status: result.status, headers: { "Content-Type": "application/json" } });
    }
    return original(base.origin + input, { ...init, headers, credentials: "omit", cache: "no-store", redirect: "error" });
  };
}
