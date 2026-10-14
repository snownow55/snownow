import type { ReactNode } from "react";

export function Brand({ placeholder = false }: { placeholder?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      {placeholder && <span className="rounded-xl border border-dashed border-brand/40 bg-white px-3 py-2 text-[10px] font-medium tracking-normal text-slate-600" aria-label="正式なロゴ・キャラクター素材は準備中">LOGO 準備中</span>}
      <span className="ui-brand">SNOW VIKING</span>
    </span>
  );
}

export function PageShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`ui-page ${className}`}>{children}</main>;
}
