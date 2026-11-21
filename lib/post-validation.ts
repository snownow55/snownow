export const choices: Record<string, readonly string[]> = {
  area: ["山頂・上部", "中腹", "山麓・下部", "全体"],
  snow_type: [
    "パウダー",
    "圧雪",
    "硬めの圧雪",
    "アイスバーン",
    "ザラメ",
    "シャバ雪・べちゃ雪",
    "みぞれ・雨",
  ],
  snowfall: [
    "ほぼ無し",
    "うっすら積もった",
    "そこそこ積もった",
    "かなり積もった",
    "分からない",
  ],
  roughness: ["きれい", "少し荒れている", "かなり荒れている", "ボコボコ"],
  crowd: ["空いている", "普通", "混んでいる"],
};
export type PostInput = {
  resort: string;
  area: string;
  snow_type: string;
  snowfall: string;
  roughness: string;
  crowd: string;
  comment: string;
};

export function validPost(value: unknown, restoringLegacy = false): value is PostInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const post = value as Record<string, unknown>;
  if (
    Object.keys(post).some((key) => !Object.hasOwn(choices, key) && key !== "comment" && key !== "resort")
  )
    return false;
  return (
    // Existence and active status are checked against the DB in the API.
    typeof post.resort === "string" && post.resort.trim().length > 0 && post.resort.length <= 200 &&
    Object.entries(choices).every(
      ([key, values]) =>
        typeof post[key] === "string" && (values.includes(post[key] as string)
          || (restoringLegacy && key === "snow_type" && post[key] === "湿雪")),
    ) &&
    typeof post.comment === "string" &&
    post.comment.length <= 1000
  );
}

// Time-limited browser-payload compatibility only; never forwards condition to DB.
export function transitionalPost(value: unknown, until: string | undefined, now = Date.now()): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value) || !until || !Number.isFinite(Date.parse(until)) || now >= Date.parse(until)) return value;
  const { condition, ...post } = value as Record<string, unknown>;
  return condition === null ? post : value;
}
