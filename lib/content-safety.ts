export const reportReasons = { abuse: "嫌がらせ・暴言", spam: "迷惑投稿・広告", personal_information: "個人情報", dangerous: "危険・違法な内容", other: "その他" } as const;
export function validSafetyInput(value: unknown): value is { post_id: number; action: "report" | "block"; reason?: keyof typeof reportReasons } {
 if (!value || typeof value!=="object" || Array.isArray(value)) return false;
 const v=value as Record<string,unknown>;
 return Number.isSafeInteger(v.post_id) && (v.post_id as number)>0 &&
 ((v.action==="block" && Object.keys(v).length===2) || (v.action==="report" && Object.keys(v).length===3 && typeof v.reason==="string" && Object.hasOwn(reportReasons,v.reason)));
}
