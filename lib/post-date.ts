const japanDate = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// Always derive the absolute timestamp from the stored post, never from now.
export function formatPostDate(createdAt: string): string {
  const date = new Date(createdAt);
  if (!createdAt || !Number.isFinite(date.getTime())) return "―";
  const parts = Object.fromEntries(japanDate.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}`;
}

export function formatPostAge(createdAt: string, now = Date.now()): string {
  const timestamp = Date.parse(createdAt);
  if (!createdAt || !Number.isFinite(timestamp) || !Number.isFinite(now)) return "―";
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}時間前` : `${Math.floor(hours / 24)}日前`;
}
