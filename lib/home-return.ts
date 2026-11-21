// List state only: never accept arbitrary paths, hosts, or redirect parameters.
export function safeHomeReturn(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, "https://snow.invalid");
    if (url.origin !== "https://snow.invalid" || url.pathname !== "/" || url.hash) return null;
    const params = new URLSearchParams();
    const region = url.searchParams.get("region");
    if (region && !/^[a-z0-9-]{1,64}$/.test(region)) return null;
    if (region) params.set("region", region);
    if (url.searchParams.has("tab")) params.set("tab", url.searchParams.get("tab") === "live" ? "live" : "morning");
    if (url.searchParams.has("sort")) params.set("sort", url.searchParams.get("sort") === "latest" ? "latest" : "kana");
    const search = url.searchParams.get("search");
    if (search) params.set("search", search.slice(0, 200));
    return params.size ? `/?${params}` : "/";
  } catch { return null; }
}

export function resortDetailUrl(name: string, returnTo?: string): string {
  const path = `/resort/${encodeURIComponent(name)}`;
  const safe = safeHomeReturn(returnTo);
  return safe ? `${path}?${new URLSearchParams({ returnTo: safe })}` : path;
}
