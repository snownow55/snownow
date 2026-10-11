const choices: Record<string, readonly string[]> = {
  area: ["山頂・上部", "中腹", "山麓・下部", "全体"],
  snow_type: [
    "パウダー",
    "圧雪",
    "硬めの圧雪",
    "アイスバーン",
    "湿雪",
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
  condition: ["★★★★★", "★★★★☆", "★★★☆☆", "★★☆☆☆", "★☆☆☆☆"],
};
export function validPost(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const post = value as Record<string, unknown>;
  if (
    Object.keys(post).length !== 8 ||
    Object.keys(post).some((key) => !Object.hasOwn(choices, key) && key !== "comment" && key !== "resort")
  )
    return false;
  return (
    // Existence and active status are checked against the DB in the API.
    typeof post.resort === "string" && post.resort.trim().length > 0 && post.resort.length <= 200 &&
    Object.entries(choices).every(
      ([key, values]) =>
        typeof post[key] === "string" && values.includes(post[key] as string),
    ) &&
    typeof post.comment === "string" &&
    post.comment.length <= 1000
  );
}
