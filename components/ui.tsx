import type { ReactNode } from "react";
import Image from "next/image";
import mascot from "../public/snow-viking-logo.png";

export function Brand() {
  return (
    <span className="inline-block max-w-full align-middle">
      <Image src={mascot} alt="SNOW VIKING｜ゲレンデ選びに今の情報を"
        unoptimized preload
        className="block h-auto w-72 max-w-full sm:w-80" />
    </span>
  );
}

export function PageShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`ui-page ${className}`}>{children}</main>;
}
