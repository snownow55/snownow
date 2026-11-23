import { createClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { SecureStoragePlugin } from "capacitor-secure-storage-plugin";
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const project = import.meta.env.VITE_SUPABASE_PROJECT_REF as string | undefined;
const valid = Boolean(url && key && ["viidjrhaoxcvunbfdbni", "rtgqyctqjfoercdymssd"].includes(project ?? "")
  && url === `https://${project}.supabase.co` && !key?.startsWith("sb_secret_"));
if (key?.startsWith("eyJ")) {
  try { const payload = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); if (payload.role !== "anon" || payload.ref !== project) throw new Error("SERVER_KEY_REFUSED"); }
  catch { throw new Error("Invalid public key configuration"); }
}
const storage = {
  async getItem(name: string) {
    if (!Capacitor.isNativePlatform()) return sessionStorage.getItem(name);
    const { value: keys } = await SecureStoragePlugin.keys();
    return keys.includes(name) ? (await SecureStoragePlugin.get({ key: name })).value : null;
  },
  async setItem(name: string, value: string) {
    if (Capacitor.isNativePlatform()) await SecureStoragePlugin.set({ key: name, value });
    else sessionStorage.setItem(name, value);
  },
  async removeItem(name: string) {
    if (Capacitor.isNativePlatform()) { const { value } = await SecureStoragePlugin.keys(); if (value.includes(name)) await SecureStoragePlugin.remove({ key: name }); }
    else sessionStorage.removeItem(name);
  },
};
export const supabase = valid ? createClient(url!, key!, { auth: {
  storage, storageKey: `snow-native-${project}-auth`, persistSession: true, autoRefreshToken: true,
  detectSessionInUrl: false, flowType: "pkce",
} }) : null;
