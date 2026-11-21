import { validPost, type PostInput } from "./post-validation.ts";
export type PostEdit = Omit<PostInput, "resort">;
export function validEdit(value: unknown): value is PostEdit {
 if (!value || typeof value!=="object" || Array.isArray(value) || Object.keys(value).length!==6 || Object.hasOwn(value,"resort")) return false;
 return validPost({ ...value, resort: "edit" }, true);
}
