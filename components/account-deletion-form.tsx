"use client";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { PageShell } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { CONTACT_EMAIL, DELETE_CONFIRMATION } from "@/lib/account-deletion";

function DeleteForm() {
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [error, setError] = useState("");
  return <form className="ui-card mt-5 p-4" onSubmit={async event => {
    event.preventDefault();
    if (busy || unconfirmed || !confirmed || !password) return;
    if (!window.confirm("認証アカウントと、過去分を含むすべての投稿・地域設定・投稿制限履歴を削除します。取り消せません。削除しますか？")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmation: DELETE_CONFIRMATION }),
      });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.ok === true) {
        setPassword("");
        await supabase?.auth.signOut({ scope: "local" }).catch(() => {});
        window.location.replace("/?account=deleted");
        return;
      }
      if (data?.code === "DELETION_UNCONFIRMED") {
        setUnconfirmed(true);
        setError("削除の完了を確認できませんでした。再実行せず、下記窓口へお問い合わせください。");
      } else setError(response.status === 403 ? "再認証できませんでした。現在のパスワードをご確認ください。"
        : response.status === 401 ? "ログイン状態を確認してから、もう一度お試しください。"
        : "現在は削除を受け付けられません。下記窓口へお問い合わせください。");
    } catch {
      setUnconfirmed(true);
      setError("通信が途切れたため削除結果を確認できません。再実行せず、下記窓口へお問い合わせください。");
    } finally { setPassword(""); setBusy(false); }
  }}>
    <fieldset disabled={busy || unconfirmed}>
      <label className="block text-sm">現在のパスワード
        <input className="ui-input mt-2" type="password" autoComplete="current-password" maxLength={128}
          required value={password} onChange={event => setPassword(event.target.value)} />
      </label>
      <label className="my-4 flex min-h-11 items-start gap-3 text-sm">
        <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
        アカウントと関連データが削除され、取り消せないことを確認しました。
      </label>
      <button className="ui-primary w-full" type="submit" disabled={!password || !confirmed}>
        {busy ? "本人確認・削除処理中…" : "再認証してアカウントを削除"}
      </button>
    </fieldset>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
  </form>;
}

export function AccountDeletionForm({ available }: { available: boolean }) {
  const { user, loading } = useAuth();
  return <PageShell><div className="mx-auto max-w-xl px-4 py-8">
    <h1 className="text-xl font-bold">アカウントの削除</h1>
    <p className="mt-4 text-sm leading-relaxed">このページを開いただけでは削除されません。削除には現在のパスワードによる本人確認と最終確認が必要です。</p>
    <p className="mt-3 text-sm leading-relaxed">認証アカウント、過去分を含むすべての投稿、登録エリア、投稿制限履歴を削除します。投稿の匿名化保存は行いません。削除は取り消せません。</p>
    <p className="mt-3 text-xs leading-relaxed text-slate-600">バックアップや外部サービスのログは同時に即時消去されるものではありません。詳しくはお問い合わせください。</p>
    {loading ? <p role="status" className="mt-5">ログイン状態を確認中…</p>
      : !user ? <Link href="/login?next=%2Faccount%2Fdelete" className="ui-primary mt-5">ログインして削除手続きへ</Link>
      : !available ? <p role="status" className="mt-5">現在、アカウントの削除は問い合わせ窓口で受け付けています。</p>
      : <DeleteForm key={user.id} />}
    <p className="mt-5 text-sm">お問い合わせ：<a className="break-all underline text-brand" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
    <Link className="ui-secondary mt-5" href="/">削除せずトップへ戻る</Link>
  </div></PageShell>;
}
