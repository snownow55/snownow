import Link from "next/link";
import type { ReactNode } from "react";
import { PageShell } from "@/components/ui";

export function LegalPage({ title, children, updatedAt = "2026年11月23日" }: { title: string; children: ReactNode; updatedAt?: string }) {
  return <PageShell><article className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
    <h1 className="text-2xl font-bold">{title}</h1>
    <p className="mt-2 text-xs text-slate-600">最終更新日：{updatedAt}</p>
    <div className="mt-6 space-y-5 text-sm leading-7 break-words">{children}</div>
    <Link href="/" className="ui-secondary mt-8 w-full">トップページへ戻る</Link>
  </article></PageShell>;
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="ui-card p-5 sm:p-6">
    <h2 className="mb-3 text-base font-bold">{title}</h2>
    {children}
  </section>;
}
