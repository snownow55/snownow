"use client";
import { Brand, PageShell } from "@/components/ui";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { safeNext } from "@/lib/auth-policy";
import { useAuth } from "./auth-provider";
type Mode = "login" | "signup" | "forgot" | "reset";
const MIN_PASSWORD_LENGTH = 8;
const titles = {
  login: "ログイン",
  signup: "新規登録",
  forgot: "パスワード再設定メール",
  reset: "新しいパスワード",
};
export function AuthForm({ mode }: { mode: Mode }) {
  const params = useSearchParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const next = safeNext(params.get("next"));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;
    setError("");
    setMessage("");
    if (
      (mode === "signup" || mode === "reset") &&
      password.length < MIN_PASSWORD_LENGTH
    ) {
      setError(`パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください。`);
      return;
    }
    if ((mode === "signup" || mode === "reset") && password !== confirmation) {
      setError("パスワードが一致していません。");
      return;
    }
    setBusy(true);
    try {
      const callback = new URL("/auth/callback", window.location.origin);
      if (mode === "signup") {
        callback.searchParams.set("next", next);
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: callback.href },
        });
        if (error) throw error;
        if (data.session) {
          await supabase.auth.signOut();
          setError(
            "メール確認が必須になっていません。運営にお問い合わせください。",
          );
        } else
          setMessage(
            "登録可能な場合、確認メールを送信しました。メール内のリンクから登録を完了してください。",
          );
      } else if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        router.replace(next);
        router.refresh();
      } else if (mode === "forgot") {
        callback.searchParams.set("type", "recovery");
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: callback.href },
        );
        if (error) throw error;
        setMessage(
          "登録済みのメールアドレスであれば、再設定メールを送信しました。",
        );
      } else {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user || data.user.is_anonymous)
          throw new Error("No authenticated user");
        const { error: updateError } = await supabase.auth.updateUser({
          password,
        });
        if (updateError) throw updateError;
        await supabase.auth.signOut();
        router.replace("/login?notice=password-updated");
        router.refresh();
      }
      setPassword("");
      setConfirmation("");
    } catch {
      setError(
        mode === "login"
          ? "ログインできませんでした。メールアドレス・パスワード・メール確認の完了をご確認ください。"
          : "処理を完了できませんでした。リンクの期限や入力内容を確認し、もう一度お試しください。",
      );
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    if (!supabase || busy || !email.trim()) {
      setError("メールアドレスを入力してください。");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const callback = new URL("/auth/callback", window.location.origin);
      callback.searchParams.set("next", next);
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: callback.href },
      });
      if (error)
        setError(
          "確認メールを再送できませんでした。時間を置いてお試しください。",
        );
      else setMessage("再送可能な場合、確認メールを送信しました。");
    } catch {
      setError("通信に失敗しました。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }
  const resetUnavailable =
    mode === "reset" && (loading || !user || user.is_anonymous);
  const input =
    "ui-input mt-2";
  return (
    <PageShell className="px-5 py-8">
      <div className="ui-card mx-auto max-w-md p-5 sm:p-7">
        <div className="mb-3"><Brand /></div>
        <h1 className="mb-4 text-2xl font-bold">{titles[mode]}</h1>
        {!supabase && (
          <p role="alert" className="mb-5 ui-error">
            認証サービスの設定が未完了です。現在は登録・ログインできません。
          </p>
        )}
        {params.get("error") === "callback" && (
          <p role="alert" className="mb-5 ui-error">
            認証リンクが無効または期限切れです。確認メールは新規登録画面から再送できます。パスワード再設定は下のリンクからやり直してください。
          </p>
        )}
        {params.get("notice") === "password-updated" && (
          <p role="status" className="mb-5">
            パスワードを変更しました。再度ログインしてください。
          </p>
        )}
        {resetUnavailable && (
          <p role="status" className="mb-5">
            {loading
              ? "認証を確認しています…"
              : "再設定メールのリンクから開いてください。"}
          </p>
        )}
        <form onSubmit={submit} className="space-y-5">
          {mode !== "reset" && (
            <label className="block">
              メールアドレス
              <input
                className={input}
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          {mode !== "forgot" && (
            <label className="block">
              {mode === "reset" ? "新しいパスワード" : "パスワード"}
              <input
                className={input}
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={mode === "login" ? undefined : MIN_PASSWORD_LENGTH}
                maxLength={128}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {(mode === "signup" || mode === "reset") && (
            <>
              <p className="text-sm text-slate-600">
                {MIN_PASSWORD_LENGTH}文字以上で入力してください。
              </p>
              <label className="block">
                パスワード（確認）
                <input
                  className={input}
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </label>
            </>
          )}
          {error && (
            <p role="alert" className="ui-error">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="text-brand">
              {message}
            </p>
          )}
          <button
            disabled={!supabase || busy || resetUnavailable}
            className="ui-primary min-h-12 w-full"
          >
            {busy
              ? "処理中…"
              : mode === "forgot"
                ? "再設定メールを送信"
                : mode === "reset"
                  ? "パスワードを変更"
                  : titles[mode]}
          </button>
          {mode === "signup" && (
            <button
              type="button"
              disabled={!supabase || busy}
              onClick={resend}
              className="ui-secondary min-h-12 w-full"
            >
              確認メールを再送
            </button>
          )}
        </form>
        <div className="mt-6 flex flex-col gap-4 text-brand">
          <Link href={`/login?next=${encodeURIComponent(next)}`}>ログイン</Link>
          <Link href={`/signup?next=${encodeURIComponent(next)}`}>
            新規登録
          </Link>
          <Link href="/forgot-password">パスワードを忘れた方</Link>
          <Link href="/">スキー場一覧へ戻る</Link>
        </div>
      </div>
    </PageShell>
  );
}
