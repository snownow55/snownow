"use client";
import { useRef, useState } from "react";
import { createLocalPost, type LocalDemoPost } from "@/lib/demo/local-posts";
import type { DemoResort } from "@/lib/demo/data";

// Same labels, values and defaults as the normal post form. Shared validPost is
// authoritative; this demo intentionally imports no auth, DB or network client.
export const DEMO_FIELDS = [
  ["area", "ゲレンデ内の位置", ["山頂・上部", "中腹", "山麓・下部", "全体"]],
  ["snow_type", "雪質", ["パウダー", "圧雪", "硬めの圧雪", "アイスバーン", "湿雪", "ザラメ", "シャバ雪・べちゃ雪", "みぞれ・雨"]],
  ["snowfall", "営業開始後の降雪", ["ほぼ無し", "うっすら積もった", "そこそこ積もった", "かなり積もった", "分からない"]],
  ["roughness", "ゲレンデの荒れ具合", ["きれい", "少し荒れている", "かなり荒れている", "ボコボコ"]],
  ["crowd", "混雑", ["空いている", "普通", "混んでいる"]],
] as const;
export function DemoPostForm({ resort, resorts, save, onSaved, blocked }: {
  resort: DemoResort; resorts: readonly DemoResort[]; save: (post: LocalDemoPost) => void; onSaved: () => void; blocked: boolean;
}) {
  const [error, setError] = useState("");
  const saved = useRef(false);
  return <form aria-label="体験投稿フォーム" className="ui-card my-4 space-y-4 p-4" onSubmit={(event) => {
    event.preventDefault();
    if (blocked || saved.current) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    let post: LocalDemoPost;
    try { post = createLocalPost({ ...data, resort: resort.name }, resorts, crypto.randomUUID(), new Date().toISOString()); }
    catch { setError("入力内容を確認してください。コメントは1,000文字以内です。"); return; }
    try { save(post); } catch { setError("ブラウザに保存できませんでした。保存容量や設定を確認してください。入力内容は残っています。"); return; }
    saved.current = true;
    onSaved();
  }}>
    <h2 className="text-lg font-bold break-words">{resort.display_name}のコンディションを体験投稿</h2>
    <p className="text-xs leading-relaxed text-slate-600">投稿内容は体験用であり、実際のゲレンデ状況として公開されません。このブラウザ内にのみ保存します。個人情報は入力しないでください。</p>
    {DEMO_FIELDS.map(([name, label, options]) => <div key={name}>
      <label htmlFor={`demo-${name}`} className="mb-2 block text-sm font-semibold">{label}</label>
      <select id={`demo-${name}`} name={name} defaultValue={options[0]} required className="ui-input">{options.map((value) => <option key={value}>{value}</option>)}</select>
    </div>)}
    <div><label htmlFor="demo-comment" className="mb-2 block text-sm font-semibold">現地コメント</label>
      <textarea id="demo-comment" name="comment" maxLength={1000} rows={4} className="ui-input resize-none" placeholder="例：上部はまだパウダー残ってます！" />
    </div>
    {error && <p role="alert" className="ui-error">{error}</p>}
    <button disabled={blocked} className="ui-primary w-full" type="submit">体験投稿を保存する</button>
  </form>;
}
