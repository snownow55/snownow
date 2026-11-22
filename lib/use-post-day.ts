"use client";
import { useSyncExternalStore } from "react";
import { japanPostDayStart, POST_DAY_MS } from "./post-date";

function subscribe(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  function check() {
    onChange();
    clearTimeout(timer);
    const now = Date.now();
    timer = setTimeout(check, japanPostDayStart(now) + POST_DAY_MS - now + 1);
  }
  check();
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", check);
  return () => {
    clearTimeout(timer);
    window.removeEventListener("focus", check);
    document.removeEventListener("visibilitychange", check);
  };
}
const serverSnapshot = () => 0;

export function usePostDay() {
  return useSyncExternalStore(subscribe, japanPostDayStart, serverSnapshot);
}
