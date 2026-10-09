"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
const AuthContext = createContext<{ user: User | null; loading: boolean }>({
  user: null,
  loading: true,
});
export const useAuth = () => useContext(AuthContext);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!supabase);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    });
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (active) {
          setUser(data.user);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setUser(null);
          setLoading(false);
        }
      });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  async function logout() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setError("ログアウトに失敗しました。もう一度お試しください。");
    else {
      setUser(null);
      setError("");
      router.replace("/");
      router.refresh();
    }
  }
  return (
    <AuthContext.Provider value={{ user, loading }}>
      <nav
        aria-label="アカウント"
        className="border-b border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white"
      >
        <div className="mx-auto flex max-w-md flex-wrap items-center justify-between gap-3">
          <Link href="/" className="font-bold text-sky-400">
            SNOW NOW
          </Link>
          {loading ? (
            <span role="status">確認中…</span>
          ) : user ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="max-w-48 truncate">
                {user.email_confirmed_at ? "ログイン中" : "メール確認待ち"}：
                {user.email}
              </span>
              <button onClick={logout} className="min-h-11 text-sky-400">
                ログアウト
              </button>
            </div>
          ) : (
            <div className="flex gap-4">
              <Link className="py-3" href="/login">
                ログイン
              </Link>
              <Link className="py-3 text-sky-400" href="/signup">
                新規登録
              </Link>
            </div>
          )}
        </div>
        {error && <p role="alert">{error}</p>}
      </nav>
      {!supabase && (
        <p
          role="status"
          className="bg-slate-900 px-5 py-3 text-center text-sm text-amber-300"
        >
          接続設定が未完了のため、投稿データの取得と認証機能は利用できません。
        </p>
      )}
      {children}
    </AuthContext.Provider>
  );
}
