import { validPost, type PostInput } from "../post-validation.ts";
import type { DemoPost, DemoResort } from "./data.ts";

export const DEMO_STORAGE_KEY = "snow-viking:demo-posts:v1";
export type LocalDemoPost = DemoPost & { localId: string };
export function toPostInput(post: DemoPost): PostInput {
  return { resort: post.resort, area: post.area, snow_type: post.snowType, snowfall: post.snowfall, roughness: post.roughness, crowd: post.crowd, comment: post.comment };
}
export function createLocalPost(input: unknown, resorts: readonly DemoResort[], id: string, now: string): LocalDemoPost {
  if (!validPost(input) || !resorts.some((resort) => resort.name === input.resort) || !id || !Number.isFinite(Date.parse(now))) throw new Error("Invalid demo post");
  return { localId: id, resort: input.resort, createdAt: now, area: input.area, snowType: input.snow_type, snowfall: input.snowfall, roughness: input.roughness, crowd: input.crowd, comment: input.comment };
}
// Treat storage as untrusted input. Never overwrite unreadable/invalid existing data.
export function readLocalPosts(raw: string | null, resorts: readonly DemoResort[]): LocalDemoPost[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== "object" || !("version" in data) || data.version !== 1 || !("posts" in data) || !Array.isArray(data.posts)) throw new Error("Invalid demo storage");
  const ids = new Set<string>();
  return data.posts.map((value: unknown) => {
    if (!value || typeof value !== "object") throw new Error("Invalid demo post");
    const post = value as LocalDemoPost;
    if (typeof post.localId !== "string" || typeof post.createdAt !== "string" || ids.has(post.localId)) throw new Error("Invalid demo ID/date");
    const checked = createLocalPost(toPostInput(post), resorts, post.localId, post.createdAt);
    ids.add(checked.localId);
    return checked;
  });
}
