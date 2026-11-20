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
    function refresh() {
      setNow(new Date());
      loadOfficialConditions(supabase).then(
        (data) => { if (active) { setRows(data); setError(""); } },
        () => { if (active) { setRows([]); setError("公式情報を取得できませんでした。"); } },
      );
    }
    refresh();
    // Re-evaluate JST validity even if the page stays open overnight.
    const timer = setInterval(() => setNow(new Date()), 1000);
    window.addEventListener("focus", refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [enabled]);
  return { rows, now, error };
}
