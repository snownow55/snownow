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
