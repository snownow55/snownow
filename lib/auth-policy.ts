export function safeNext(value: string | null): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(value)
  )
    return "/";
  try {
    const url = new URL(value, "https://snow.invalid");
    if (/%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(url.pathname)) return "/";
    if (
      url.origin !== "https://snow.invalid" ||
      url.pathname.startsWith("/auth/") ||
      url.pathname === "/reset-password"
    )
      return "/";
    return url.pathname + url.search;
  } catch {
    return "/";
  }
}
export function canPost(
  user: { email_confirmed_at?: string; is_anonymous?: boolean } | null,
): boolean {
  return !!user?.email_confirmed_at && !user.is_anonymous;
}
