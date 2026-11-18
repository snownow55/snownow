export type PostingStatus = { allowed: boolean; nextAllowedAt: string | null; serverTime: string; retryAfterSeconds: number };
export function postingStatus(value: unknown): PostingStatus | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.allowed !== "boolean" || typeof v.serverTime !== "string" || !Number.isFinite(Date.parse(v.serverTime))
    || (v.nextAllowedAt !== null && (typeof v.nextAllowedAt !== "string" || !Number.isFinite(Date.parse(v.nextAllowedAt))))
    || !Number.isInteger(v.retryAfterSeconds) || (v.retryAfterSeconds as number) < 0 || (v.retryAfterSeconds as number) > 2147483647
    || (!v.allowed && (v.nextAllowedAt === null || (v.retryAfterSeconds as number) < 1))) return null;
  return v as PostingStatus;
}
export function remainingPostTime(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}分${safe % 60}秒`;
}

// Called after server responses, never during component rendering.
export function localPostingDeadline(seconds: number): number { return Date.now() + seconds * 1000; }
