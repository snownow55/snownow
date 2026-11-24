import { useState, type FormEvent } from "react";
import Link from "next/link";
import { navigate } from "./next/navigation";
import { supabase } from "./supabase";
import { safeNext } from "../../lib/auth-policy";
export const recoveryState = { allowed: false };
export const callbackUrl = "jp.snowviking.app://auth/callback";
export function NativeAuthForm({ mode }: { mode: "login" | "signup" | "forgot" | "reset" }) {
  const [agreed,setAgreed]=useState(false);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const title = { login: "ログイン", signup: "新規登録", forgot: "パスワード再設定メール", reset: "新しいパスワード" }[mode];
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!supabase || busy) return;
    if (["signup", "reset"].includes(mode) && (password.length < 8 || password !== confirmation)) { setMessage("8文字以上のパスワードと確認入力を一致させてください。"); return; }
    if(mode==="signup"&&!agreed){setMessage("利用規約とプライバシーポリシーをご確認ください。");return;}
    setBusy(true); setMessage("");
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password }); if (error) throw error;
        navigate(safeNext(new URLSearchParams(location.search).get("next")), true);
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: callbackUrl } });
        if (error) throw error;
        if (data.session) { await supabase.auth.signOut({ scope: "local" }); throw new Error("Email confirmation required"); }
        setMessage("登録可能な場合、確認メールを送信しました。この端末でリンクを開いてください。");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: callbackUrl }); if (error) throw error;
        setMessage("登録済みの場合、再設定メールを送信しました。この端末でリンクを開いてください。");
      } else {
        if (!recoveryState.allowed) throw new Error("Recovery confirmation required");
        const { data } = await supabase.auth.getUser(); if (!data.user) throw new Error("Authentication required");
        const { error } = await supabase.auth.updateUser({ password }); if (error) throw error; recoveryState.allowed = false; navigate("/", true);
      }
    } catch { setMessage("認証できませんでした。入力・メール確認状態・接続設定をご確認ください。"); }
    finally { setPassword(""); setConfirmation(""); setBusy(false); }
  }
  return <main className="ui-page px-4 py-8"><form className="ui-card mx-auto max-w-lg space-y-4 p-5" onSubmit={submit}>
    <h1 className="text-xl font-bold">{title}</h1>
    {mode !== "reset" && <label className="block">メールアドレス<input className="ui-input" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>}
    {mode !== "forgot" && <label className="block">パスワード<input className="ui-input" type="password" minLength={mode === "login" ? 1 : 8} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} required value={password} onChange={e => setPassword(e.target.value)} /></label>}
    {["signup", "reset"].includes(mode) && <label className="block">パスワード確認<input className="ui-input" type="password" autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>}
    {mode==="signup"&&<label className="flex gap-2 text-sm"><input type="checkbox" required checked={agreed} onChange={e=>setAgreed(e.target.checked)}/><span>利用規約に同意し、プライバシーポリシーを確認しました。不適切な投稿・嫌がらせは禁止されています。</span></label>}
    <button className="ui-primary w-full" disabled={busy || !supabase}>{busy ? "処理中…" : title}</button>
    <p role="status">{message}</p>
    <Link className="block underline" href="/forgot-password">パスワードを忘れた場合</Link>
    <Link className="block underline" href="/terms">利用規約</Link><Link className="block underline" href="/privacy">プライバシーポリシー</Link>
  </form></main>;
}
