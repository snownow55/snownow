import {
  japanDate, mayFetchOfficialSource, mayPublishOfficialSource,
  type OfficialObservationInput, type OfficialSource,
} from "./official-conditions.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { facilityAdapter, type FacilityFormat } from "./official-facility-adapters.ts";

export type CollectorSource = Omit<OfficialSource, "permission_scope"> & { adapter_key: string | null; resort_name?: string };
type Observation = Omit<OfficialObservationInput, "fetched_at"> & {
  fetched_at: string;
  failure_code: FailureCode | null;
  reference_url?: string;
};
type FailureCode = "timeout" | "network" | "http" | "invalid_response";
export type StoreResult = "saved" | "duplicate" | "superseded" | "permission_changed";
export type CollectionStore = {
  loadSource(id: number): Promise<CollectorSource | null>;
  store(source: CollectorSource, observation: Observation): Promise<StoreResult>;
};

export function createCollectionStore(client: Pick<SupabaseClient, "rpc">): CollectionStore {
  return {
    async loadSource(id) {
      const { data, error } = await client.rpc("get_official_collection_source", { p_source_id: id });
      if (error) throw new Error("Official source lookup failed.");
      return data as CollectorSource | null;
    },
    async store(source, observation) {
      const { data, error } = await client.rpc("store_official_observation", {
        p_source_id: source.id, p_resort_id: source.resort_id, p_source_url: source.source_url,
        p_adapter_key: source.adapter_key, p_observation: observation,
      });
      if (error || (data !== "saved" && data !== "duplicate" && data !== "superseded" && data !== "permission_changed")) {
        throw new Error("Official observation write failed.");
      }
      return data;
    },
  };
}
type Approval = { id: number; url: string };
type CollectionResult = {
  id: number;
  result: StoreResult | "skipped" | "database_error";
  failure?: FailureCode;
};
type JsonObject = Record<string, unknown>;
class CollectionFailure extends Error {
  readonly code: FailureCode;

  constructor(code: FailureCode) {
    super(code);
    this.code = code;
  }
}

const maxBodyBytes = 256 * 1024;

function invalid(): never {
  throw new CollectionFailure("invalid_response");
}

function object(value: unknown): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as JsonObject;
}

function text(value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > maxLength || /[\u0000-\u001f\u007f]/u.test(value)) return invalid();
  return value.trim() || null;
}

function isoDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return invalid();
  const date = new Date(value + "T00:00:00Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value.startsWith("0000")) return invalid();
  return value;
}

function timestamp(value: unknown, fetched: Date): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return invalid();
  isoDate(value.slice(0, 10));
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() > fetched.getTime()) return invalid();
  return date.toISOString();
}

function measure(value: unknown, units: ReadonlyMap<string, (n: number) => number>, min: number, max: number): number | null {
  if (value === undefined || value === null) return null;
  const entry = object(value);
  const convert = typeof entry.unit === "string" ? units.get(entry.unit) : undefined;
  if (!convert || typeof entry.value !== "number" || !Number.isFinite(entry.value)) return invalid();
  const normalized = convert(entry.value);
  if (normalized < min || normalized > max) return invalid();
  return Math.round(normalized * 100) / 100 || 0;
}

const snowUnits = new Map<string, (n: number) => number>([["cm", n => n], ["mm", n => n / 10], ["m", n => n * 100]]);
const temperatureUnits = new Map<string, (n: number) => number>([["C", n => n], ["F", n => (n - 32) * 5 / 9]]);

function emptyObservation(source: CollectorSource, fetched: Date): Observation {
  return {
    source_id: source.id, resort_id: source.resort_id, source_url: source.source_url,
    observation_date: japanDate(fetched), observed_at: null, published_at: null, fetched_at: fetched.toISOString(),
    location_kind: "unspecified", location_name: "観測地点未発表", snowfall_period: null,
    new_snow_cm: null, snow_depth_cm: null, temperature_c: null, official_snow_quality: null,
    status: "missing", failure_code: null,
  };
}

function normalizeJsonObservation(value: unknown, source: CollectorSource, fetched: Date): Observation {
  const feed = object(value);
  const observation = emptyObservation(source, fetched);
  const date = isoDate(feed.observation_date);
  const observed = timestamp(feed.observed_at, fetched);
  const published = timestamp(feed.published_at, fetched);
  if ((observed && japanDate(new Date(observed)) !== date) || date > observation.observation_date) return invalid();
  if (feed.status !== "success" && feed.status !== "missing" && feed.status !== "closed") return invalid();
  const location = feed.location_kind ?? "unspecified";
  if (location !== "summit" && location !== "base" && location !== "unspecified") return invalid();
  Object.assign(observation, {
    observation_date: date, observed_at: observed, published_at: published, location_kind: location,
    location_name: text(feed.location_name, 100) ?? observation.location_name,
  });
  if (date < japanDate(fetched) || (published && japanDate(new Date(published)) !== date)) {
    return { ...observation, status: "stale" };
  }
  if (feed.status !== "success") return { ...observation, status: feed.status };
  const newSnow = measure(feed.new_snow, snowUnits, 0, 1000);
  const snowfall24h = newSnow === null ? measure(feed.snowfall_24h, snowUnits, 0, 1000) : null;
  const measurements = {
    new_snow_cm: newSnow ?? snowfall24h,
    snow_depth_cm: measure(feed.snow_depth, snowUnits, 0, 3000),
    temperature_c: measure(feed.temperature, temperatureUnits, -90, 65),
    official_snow_quality: text(feed.snow_quality, 100),
  };
  if (Object.values(measurements).every(field => field === null)) return observation;
  const period = snowfall24h !== null ? "24時間" : text(feed.snowfall_period, 100);
  return { ...observation, ...measurements, status: "success", snowfall_period: period };
}

function approvedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash && url.href === value;
  } catch {
    return false;
  }
}

export function parseSourceApprovals(raw: string): Approval[] {
  const entries = Object.entries(object(JSON.parse(raw)));
  if (!entries.length) throw new Error("At least one explicit source approval is required.");
  return entries.map(([id, url]) => {
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || typeof url !== "string" || !approvedUrl(url)) {
      throw new Error("Invalid source approval.");
    }
    return { id: Number(id), url };
  });
}

const mediaTypes: Record<FacilityFormat, RegExp> = {
  json: /^application\/(?:json|[a-z0-9.+-]+\+json)(?:\s*;|$)/i,
  html: /^(?:text\/html|application\/xhtml\+xml)(?:\s*;|$)/i,
  rss: /^(?:application\/(?:rss\+xml|xml)|text\/xml)(?:\s*;|$)/i,
};
const accept: Record<FacilityFormat, string> = {
  json: "application/json",
  html: "text/html, application/xhtml+xml",
  rss: "application/rss+xml, application/xml, text/xml",
};

async function readResponse(response: Response, format: FacilityFormat): Promise<unknown> {
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    throw new CollectionFailure("http");
  }
  if (!response.body || !mediaTypes[format].test(response.headers.get("content-type") ?? "")) {
    void response.body?.cancel().catch(() => {});
    return invalid();
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let length = 0;
  let body = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBodyBytes) return invalid();
      body += decoder.decode(value, { stream: true });
    }
    const decoded = body + decoder.decode();
    return format === "json" ? JSON.parse(decoded) : decoded;
  } catch (error) {
    if (error instanceof TypeError || error instanceof SyntaxError) return invalid();
    throw error;
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function collect(source: CollectorSource, adapter: ReturnType<typeof facilityAdapter>, request: typeof fetch, now: () => Date, timeoutMs: number) {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const format = adapter?.format ?? "json";
    const response = await request(source.source_url, {
      signal, redirect: "error", cache: "no-store", headers: { Accept: accept[format] },
    });
    const data = await readResponse(response, format);
    const fetched = now();
    let feed: unknown = data;
    if (adapter) {
      try { feed = adapter.parse(data, fetched); } catch { return invalid(); }
    }
    const observation = normalizeJsonObservation(feed, source, fetched);
    const reference = adapter?.format === "rss" && object(feed).reference_url;
    if (observation.status === "success" && typeof reference === "string") observation.reference_url = reference;
    return observation;
  } catch (error) {
    const failure_code = signal.aborted ? "timeout" : error instanceof CollectionFailure ? error.code : "network";
    return { ...emptyObservation(source, now()), status: "failed" as const, failure_code };
  }
}

export async function collectOfficialConditions(
  approvals: readonly Approval[],
  repository: CollectionStore,
  { request = fetch, now = () => new Date(), timeoutMs = 8_000 }: {
    request?: typeof fetch; now?: () => Date; timeoutMs?: number;
  } = {},
): Promise<CollectionResult[]> {
  const results: CollectionResult[] = [];
  for (const { id, url } of approvals) {
    try {
      const source = await repository.loadSource(id);
      const adapter = facilityAdapter(source?.adapter_key ?? "");
      if (!source || source.id !== id || !Number.isSafeInteger(source.resort_id) || source.resort_id <= 0
        || (!adapter && source.adapter_key !== "json-v1") || source.source_url !== url || !approvedUrl(url)
        || (adapter && (adapter.url !== url || adapter.resortName !== source.resort_name))
        || !mayFetchOfficialSource(source) || !mayPublishOfficialSource(source)) {
        results.push({ id, result: "skipped" });
        continue;
      }
      const observation = await collect(source, adapter, request, now, timeoutMs);
      const result = await repository.store(source, observation);
      results.push({ id, result, ...(observation.failure_code ? { failure: observation.failure_code } : {}) });
    } catch {
      results.push({ id, result: "database_error" });
    }
  }
  return results;
}
