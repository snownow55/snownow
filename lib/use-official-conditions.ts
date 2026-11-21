"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { loadOfficialConditions, type OfficialCondition } from "./official-conditions";
export function useOfficialConditions(enabled: boolean) {
  const [rows, setRows] = useState<OfficialCondition[]>([]);
  const [now, setNow] = useState<Date | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let request = 0;
    function refresh() {
      const revision = ++request;
      setNow(new Date());
      loadOfficialConditions(supabase).then(
        (data) => { if (active && revision === request) { setRows(data); setError(""); } },
        () => { if (active && revision === request) { setRows([]); setError("公式情報を取得できませんでした。"); } },
      );
    }
    refresh();
    // Re-evaluate JST validity even if the page stays open overnight.
    const timer = setInterval(() => setNow(new Date()), 1000);
    const refreshTimer = setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => { active = false; clearInterval(timer); clearInterval(refreshTimer); window.removeEventListener("focus", refresh); };
  }, [enabled]);
  return { rows, now, error };
}
