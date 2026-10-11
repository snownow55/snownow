"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { loadResortMaster, MASTER_ERROR, type ResortMaster } from "./resort-master";

export function useResortMaster() {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ data: ResortMaster | null; loading: boolean; error: string }>(
    { data: null, loading: true, error: "" },
  );
  useEffect(() => {
    let active = true;
    loadResortMaster(supabase).then(
      (data) => { if (active) setState({ data, loading: false, error: "" }); },
      () => { if (active) setState({ data: null, loading: false, error: MASTER_ERROR }); },
    );
    return () => { active = false; };
  }, [revision]);
  function retry() {
    setState({ data: null, loading: true, error: "" });
    setRevision((value) => value + 1);
  }
  return { ...state, retry };
}
