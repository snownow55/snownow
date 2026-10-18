import { Suspense } from "react";
import { DemoExplorer } from "@/components/demo/explorer";
import { loadDemoCatalog } from "@/lib/demo/master";

export default function DemoPage() {
  return <Suspense fallback={<p className="p-4" role="status">デモを読み込んでいます…</p>}><DemoExplorer catalog={loadDemoCatalog()} /></Suspense>;
}
