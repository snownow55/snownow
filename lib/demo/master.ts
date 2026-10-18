// Server-only file reads of the reviewed registration master; no SQL execution,
// Supabase connection, auth/session, or post-table read is involved.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createDemoPosts, DEMO_REGION_CODE, type DemoCatalog, type DemoResort } from "./data.ts";

export function loadDemoCatalog(): DemoCatalog {
  const folder = join(process.cwd(), "docs/resort-master-review");
  const csv = readFileSync(join(folder, "59-resorts-review.csv"), "utf8");
  const proposal = readFileSync(join(folder, "02-dev-master-change-draft.sql"), "utf8");
  const regionBlock = proposal.split("INSERT INTO pg_temp._expected_regions VALUES")[1]?.split(";")[0] ?? "";
  const regionRows = [...regionBlock.matchAll(/\('([a-z-]+)', '([^']+)', (\d+), (\d+)\)/g)];
  const regions = regionRows.map((row) => ({ code: row[1], name: row[2], sort_order: Number(row[3]), count: Number(row[4]) })).sort((a, b) => a.sort_order - b.sort_order);
  const codes = new Set(regions.map((region) => region.code));
  if (!regions.length || codes.size !== regions.length || !codes.has(DEMO_REGION_CODE)) throw new Error("Invalid demo regions");
  const lines = csv.trim().split(/\r?\n/);
  if (lines.shift() !== "name,display_name,region_code,sort_order,preserved_id") throw new Error("Invalid demo master header");
  const resorts: DemoResort[] = lines.map((line) => {
    const [name, display_name, region_code, order] = line.split(",");
    const sort_order = Number(order);
    if (!name || !display_name || !region_code || !Number.isSafeInteger(sort_order) || sort_order < 1) throw new Error("Invalid demo master row");
    return { name, display_name, region_code, sort_order };
  });
  if (new Set(resorts.map((r) => r.name)).size !== resorts.length || resorts.some((resort) => !codes.has(resort.region_code))
    || regions.some((region) => resorts.filter((resort) => resort.region_code === region.code).length !== region.count)) throw new Error("Incomplete demo master");
  return { regions: regions.map(({ code, name }) => ({ code, name })), resorts, posts: createDemoPosts(resorts) };
}
