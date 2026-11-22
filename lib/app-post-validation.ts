import { choices as demoChoices, validPost as validatePost, type PostInput } from "./post-validation.ts";

// The real app enables wet snow; the sales demo keeps its existing contract.
export const choices = {
  ...demoChoices,
  snow_type: [...demoChoices.snow_type.slice(0, 4), "湿雪", ...demoChoices.snow_type.slice(4)],
};
export function validPost(value: unknown, restoringLegacy = false): value is PostInput {
  return validatePost(value, restoringLegacy, choices);
}
export { transitionalPost } from "./post-validation.ts";
export type { PostInput } from "./post-validation.ts";
