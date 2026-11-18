import master from "../../data/resort-master.json" with { type: "json" };
import { createDemoPosts, type DemoCatalog } from "./data.ts";

// The approved live seed and embedded demo share the same 63-facility manifest.
// This module never connects to Supabase or initializes authentication.
export function loadDemoCatalog(): DemoCatalog {
  const regions = master.regions.map(({ code, name }) => ({ code, name }));
  const resorts = master.resorts.map((resort) => ({ ...resort }));
  return { regions, resorts, posts: createDemoPosts(resorts) };
}
