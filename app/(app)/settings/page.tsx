"use client";

import Link from "next/link";
import { useState } from "react";
import { PageShell } from "@/components/ui";
import { useResortMaster } from "@/lib/use-resort-master";
import { useRegionPreferences } from "@/lib/use-region-preferences";
import { normalizeRegionCodes, saveRegionPreferences, REGION_SAVE_ERROR } from "@/lib/region-preferences";
import type { Region } from "@/lib/resort-master";
import { supabase } from "@/lib/supabase";

function RegionEditor({ userId, regions, codes }: { userId: string; regions: Region[]; codes: string[] }) {
  const [selected, setSelected] = useState(() => normalizeRegionCodes(codes, regions));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || saving) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await saveRegionPreferences(supabase, userId, normalizeRegionCodes(selected, regions));
      setMessage("登録エリアを保存しました。");
    } catch { setError(REGION_SAVE_ERROR); }
    finally { setSaving(false); }
  }
  return <form onSubmit={save} className="ui-card mt-4 p-4">
    <fieldset disabled={saving}>
      <legend className="font-bold">優先表示するエリア（複数選択可）</legend>
      <p className="my-2 text-sm text-slate-600">朝のコンディションとゲレンデの今で優先表示します。その他のエリアも閲覧できます。未選択の場合は通常のエリア順で表示します。</p>
      {regions.map((region) => <label key={region.code} className="flex min-h-11 items-center gap-3">
        <input type="checkbox" checked={selected.includes(region.code)} onChange={(event) => {
          setSelected(event.target.checked ? [...selected, region.code] : selected.filter((code) => code !== region.code));
          setMessage("");
        }} />{region.name}
      </label>)}
      <button className="ui-primary mt-4" type="submit">{saving ? "保存中…" : "登録エリアを保存"}</button>
    </fieldset>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-amber-900">{error}</p>}
  </form>;
}

export default function SettingsPage() {
  const master = useResortMaster();
  const preferences = useRegionPreferences();
  return <PageShell><div className="mx-auto max-w-xl px-4 py-6">
    <h1 className="text-xl font-bold">登録エリアの設定</h1>
    {preferences.loading ? <p role="status">読み込み中…</p>
      : !preferences.user ? <p className="mt-4"><Link href="/login?next=%2Fsettings" className="text-brand underline">ログインして登録エリアを設定</Link></p>
      : preferences.error ? <div role="alert"><p>{preferences.error}</p><button className="ui-secondary" onClick={preferences.retry}>再読み込み</button></div>
      : master.error ? <div role="alert"><p>{master.error}</p><button className="ui-secondary" onClick={master.retry}>再読み込み</button></div>
      : !master.data ? <p role="status">エリアを読み込んでいます…</p>
      : <RegionEditor key={preferences.user.id} userId={preferences.user.id} regions={master.data.regions} codes={preferences.codes} />}
    <Link href="/" className="mt-4 inline-flex min-h-11 items-center text-brand underline">一覧に戻る</Link>
  </div></PageShell>;
}
