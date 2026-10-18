import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/ui";
import { DEMO_DAY_LABEL } from "@/lib/demo/data";

export const metadata: Metadata = {
  title: "SNOW VIKING｜スキー場関係者向けデモ",
  description: "固定日の架空の情報で操作できる、閲覧専用のサービス紹介デモです。",
  robots: { index: false, follow: false },
};
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <div className="ui-page">
    <header className="border-b border-brand/15 bg-white px-4 py-3">
      <div className="mx-auto max-w-6xl">
        <Link href="/demo" aria-label="SNOW VIKING デモ一覧"><Brand /></Link>
        <p className="mt-2 text-sm font-bold text-brand">SNOW VIKING｜スキー場関係者向けデモ</p>
        <p className="mt-1 text-xs text-slate-600">ゲレンデ選びに、今の情報を。 · 閲覧専用・ログイン／課金不要</p>
      </div>
    </header>
    <aside aria-label="デモの注意事項" className="sticky top-0 z-20 border-b border-orange-200 bg-accent-soft px-4 py-3 text-xs leading-relaxed text-slate-800">
      <div className="mx-auto max-w-6xl">
        <p>この画面はサービス紹介用のデモです。旭川・富良野エリアの投稿はすべて架空のサンプルであり、実際のスキー場のコンディションを示すものではありません。</p>
        <p>施設名の掲載は、提携や公式情報の連携完了を意味しません。公式情報は未取得です。</p>
        <p className="mt-1 font-semibold text-accent">デモ想定日：{DEMO_DAY_LABEL} · 表示時刻はすべて日本時間</p>
      </div>
    </aside>
    {children}
  </div>;
}
