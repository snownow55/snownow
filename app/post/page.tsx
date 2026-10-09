"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { canPost } from "@/lib/auth-policy";
function PostForm() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const searchParams = useSearchParams();
  const selectedResort = searchParams.get("resort") || "オーンズ";
  const [resort, setResort] = useState(selectedResort);
  const [area, setArea] = useState("山頂・上部");
  const [snowType, setSnowType] = useState("パウダー");
  const [snowfall, setSnowfall] = useState("ほぼ無し");
  const [roughness, setRoughness] = useState("きれい");
  const [crowd, setCrowd] = useState("空いている");
  const [condition, setCondition] = useState("★★★★★");
  const [comment, setComment] = useState("");

  async function handleSubmit() {
    if (!canPost(user) || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resort,
          area,
          snow_type: snowType,
          snowfall,
          roughness,
          crowd,
          condition,
          comment,
        }),
      });
      if (!response.ok) {
        setSubmitError(
          response.status === 401 || response.status === 403
            ? "メール確認済みのアカウントでログインしてください。"
            : "投稿に失敗しました。入力内容や通信状態を確認してください。",
        );
        return;
      }
      router.push("/");
    } catch {
      setSubmitError("通信に失敗しました。もう一度お試しください。");
    } finally {
      setSubmitting(false);
    }
  }
  const loginNext = "/post?resort=" + encodeURIComponent(selectedResort);
  if (loading)
    return (
      <p role="status" className="p-6">
        ログイン状態を確認しています…
      </p>
    );
  if (!canPost(user))
    return (
      <main className="min-h-screen bg-slate-950 px-5 py-8 text-white">
        <div className="mx-auto max-w-md">
          <h1 className="text-2xl font-bold">投稿にはログインが必要です</h1>
          <p className="my-5">
            メール認証を完了したアカウントをご利用ください。
          </p>
          <Link
            className="block rounded-xl bg-sky-500 p-4 text-center font-bold"
            href={"/login?next=" + encodeURIComponent(loginNext)}
          >
            ログイン
          </Link>
          <Link
            className="mt-4 block p-3 text-sky-400"
            href={"/signup?next=" + encodeURIComponent(loginNext)}
          >
            新規登録
          </Link>
          <Link className="mt-4 block p-3 text-sky-400" href="/">
            スキー場一覧へ戻る
          </Link>
        </div>
      </main>
    );

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-md px-5 py-8">
        <button
          onClick={() => router.push("/")}
          className="mb-6 text-sm text-sky-400"
        >
          ← 戻る
        </button>

        <header className="mb-8">
          <p className="mb-2 text-sm font-semibold tracking-[0.3em] text-sky-400">
            SNOW NOW
          </p>

          <h1 className="text-3xl font-bold">コンディションを投稿</h1>

          <p className="mt-2 text-sm text-slate-400">
            今いるスキー場の状況を教えてください
          </p>
        </header>

        <div className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-semibold">スキー場</label>

            <select
              value={resort}
              onChange={(e) => setResort(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 p-4"
            >
              <option>オーンズ</option>
              <option>キロロ</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">エリア</label>

            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 p-4"
            >
              <option>山頂・上部</option>
              <option>中腹</option>
              <option>山麓・下部</option>
              <option>全体</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">雪質</label>

            <select
              value={snowType}
              onChange={(e) => setSnowType(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 p-4"
            >
              <option>パウダー</option>
              <option>圧雪</option>
              <option>硬めの圧雪</option>
              <option>アイスバーン</option>
              <option>湿雪</option>
              <option>ザラメ</option>
              <option>シャバ雪・べちゃ雪</option>
              <option>みぞれ・雨</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">
              営業開始後の積雪
            </label>

            <select
              value={snowfall}
              onChange={(e) => setSnowfall(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 p-4"
            >
              <option>ほぼ無し</option>
              <option>うっすら積もった</option>
              <option>そこそこ積もった</option>
              <option>かなり積もった</option>
              <option>分からない</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">
              ゲレンデの荒れ具合
            </label>

            <select
              value={roughness}
              onChange={(e) => setRoughness(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 p-4"
            >
              <option>きれい</option>
              <option>少し荒れている</option>
              <option>かなり荒れている</option>
              <option>ボコボコ</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">混雑</label>

            <select
              value={crowd}
              onChange={(e) => setCrowd(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 p-4"
            >
              <option>空いている</option>
              <option>普通</option>
              <option>混んでいる</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">
              今日のコンディション
            </label>

            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 p-4"
            >
              <option value="★★★★★">★★★★★ 最高</option>
              <option value="★★★★☆">★★★★☆ 良い</option>
              <option value="★★★☆☆">★★★☆☆ 普通</option>
              <option value="★★☆☆☆">★★☆☆☆ 微妙</option>
              <option value="★☆☆☆☆">★☆☆☆☆ 厳しい</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">
              現地コメント
            </label>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="例：上部はまだパウダー残ってます！"
              className="w-full resize-none rounded-xl border border-slate-700 bg-slate-900 p-4"
            />
          </div>

          {submitError && (
            <p role="alert" className="text-amber-300">
              {submitError}
            </p>
          )}
          <button
            disabled={submitting}
            onClick={handleSubmit}
            className="w-full rounded-2xl bg-sky-500 px-4 py-4 font-bold"
          >
            {submitting ? "投稿中…" : "投稿する"}
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">
          Prototype v0.3
        </p>
      </div>
    </main>
  );
}
export default function PostPage() {
  return (
    <Suspense fallback={<div>読み込み中...</div>}>
      <PostForm />
    </Suspense>
  );
}
