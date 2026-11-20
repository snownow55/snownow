"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "./supabase";
import { loadRegionPreferences, REGION_PREFERENCES_ERROR } from "./region-preferences";

export function useRegionPreferences() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ userId: string; revision: number; codes: string[]; error: string } | null>(null);
  useEffect(() => {
    if (!userId || !supabase) return;
    let active = true;
    loadRegionPreferences(supabase, userId).then(
      (codes) => { if (active) setState({ userId, revision, codes, error: "" }); },
      () => { if (active) setState({ userId, revision, codes: [], error: REGION_PREFERENCES_ERROR }); },
    );
    return () => { active = false; };
  }, [userId, revision]);
  // Never expose the previous account's preferences while authentication changes.
  const current = state?.userId === userId && state?.revision === revision ? state : null;
  return {
    user, codes: userId ? current?.codes ?? [] : [],
    loading: authLoading || !!(userId && !current),
    error: userId ? current?.error ?? "" : "",
    retry: () => setRevision((value) => value + 1),
  };
}
