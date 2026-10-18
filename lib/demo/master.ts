// Server-only file reads of the reviewed registration master; no SQL execution,
// Supabase connection, auth/session, or post-table read is involved.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createDemoPosts, DEMO_REGION_CODE, type DemoCatalog, type DemoResort } from "./data.ts";

export function loadDemoCatalog(code = DEMO_REGION_CODE): DemoCatalog {
  const folder = join(process.cwd(), "docs/resort-master-review");
  const csv = readFileSync(join(folder, "59-resorts-review.csv"), "utf8");
  const proposal = readFileSync(join(folder, "02-dev-master-change-draft.sql"), "utf8");
  const regionBlock = proposal.split("INSERT INTO pg_temp._expected_regions VALUES")[1]?.split(";")[0] ?? "";
  const regionRows = [...regionBlock.matchAll(/\('([a-z-]+)', '([^']+)', (\d+), (\d+)\)/g)];
  const region = regionRows.find((row) => row[1] === code);
  if (!region) throw new Error("Demo region is not in the reviewed master");
  const lines = csv.trim().split(/\r?\n/);
  if (lines.shift() !== "name,display_name,region_code,sort_order,preserved_id") throw new Error("Invalid demo master header");
  const resorts: DemoResort[] = lines.map((line) => {
    const [name, display_name, region_code, order] = line.split(",");
    const sort_order = Number(order);
    if (!name || !display_name || !region_code || !Number.isSafeInteger(sort_order) || sort_order < 1) throw new Error("Invalid demo master row");
    return { name, display_name, region_code, sort_order };
  }).filter((resort) => resort.region_code === code).sort((a, b) => a.sort_order - b.sort_order);
  if (resorts.length !== Number(region[4]) || new Set(resorts.map((r) => r.name)).size !== resorts.length) throw new Error("Incomplete demo master");
  return { region: { code, name: region[2] }, resorts, posts: createDemoPosts(resorts) };
}
