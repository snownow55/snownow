import type { ReactNode } from "react";
import Image from "next/image";
import mascot from "../public/snow-viking-logo.png";

export function Brand() {
  return (
    <span className="inline-flex items-center gap-3">
      <Image src={mascot} alt="SNOW VIKING 公式マスコット" width={48} height={48}
        sizes="(min-width: 640px) 56px, 48px" preload
        className="size-12 shrink-0 object-contain sm:size-14" />
      <span className="ui-brand whitespace-nowrap">SNOW <span className="text-accent">V</span>IKING</span>
    </span>
  );
}

export function PageShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`ui-page ${className}`}>{children}</main>;
}
