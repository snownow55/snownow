// Display only fixed messages; never render arbitrary API/proxy response text.
export function postErrorMessage(status: number, payload: unknown): string {
  const error = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>).error : undefined;
  if (status === 401) return "ログイン状態を確認できません。もう一度ログインしてください。";
  if (status === 403 && error === "Forbidden") {
    return "このページのURLからは投稿を受け付けられません。正規のサイトから開き直してください。";
  }
  if (status === 403 && error === "Email verification required") {
    return "メール確認済みのアカウントでログインしてください。匿名アカウントでは投稿できません。";
  }
  if (status === 403) return "投稿が許可されませんでした。アクセス条件を確認してください。";
  return "投稿に失敗しました。入力内容や通信状態を確認してください。";
}
