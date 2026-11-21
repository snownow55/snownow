"use client";
import { useSyncExternalStore } from "react";
import { DEMO_STORAGE_KEY, readLocalPosts, type LocalDemoPost } from "@/lib/demo/local-posts";
import type { DemoResort } from "@/lib/demo/data";
const eventName = "snow-viking-demo-posts-changed";
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(eventName, listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener(eventName, listener); };
}
function snapshot() {
  try { return window.localStorage.getItem(DEMO_STORAGE_KEY); } catch { return "unavailable"; }
}
const serverSnapshot = () => null;
export function useLocalDemoPosts(resorts: readonly DemoResort[]) {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  let posts: LocalDemoPost[] = [];
  let error = "";
  try { posts = readLocalPosts(raw, resorts); } catch { error = "体験投稿の保存データを読み込めません。ブラウザの保存設定を確認してください。既存の保存内容は変更していません。"; }
  function save(post: LocalDemoPost) {
    // Re-read at write time so navigation and other open tabs do not lose known posts.
    const current = readLocalPosts(window.localStorage.getItem(DEMO_STORAGE_KEY), resorts);
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ version: 1, posts: [...current, post] }));
    window.dispatchEvent(new Event(eventName));
  }
  return { posts, error, save };
}
