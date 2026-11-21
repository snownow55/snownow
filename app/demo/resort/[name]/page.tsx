import { Suspense } from "react";
import { notFound } from "next/navigation";
import { loadDemoCatalog } from "@/lib/demo/master";
import { DemoExplorer } from "@/components/demo/explorer";

export default async function DemoResortPage({ params }: PageProps<"/demo/resort/[name]">) {
  const { name: segment } = await params;
  let name: string;
  try { name = decodeURIComponent(segment); } catch { notFound(); }
  const catalog = loadDemoCatalog();
  if (!catalog.resorts.some((resort) => resort.name === name)) notFound();
  return <Suspense fallback={<p className="p-4" role="status">デモを読み込んでいます…</p>}><DemoExplorer catalog={catalog} detailName={name} /></Suspense>;
}
