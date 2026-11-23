const expected = "rtgqyctqjfoercdymssd";
if (process.env.VITE_SUPABASE_PROJECT_REF !== expected || process.env.VITE_SUPABASE_URL !== `https://${expected}.supabase.co` || process.env.VITE_API_BASE_URL !== "https://snowviking.jp") throw new Error("Production origin configuration mismatch");
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!key || key.startsWith("sb_secret_")) throw new Error("Public key required");
if (key.startsWith("eyJ")) { const claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url")); if (claims.role !== "anon" || claims.ref !== expected) throw new Error("Public key project mismatch"); }
for (const [name, value] of Object.entries(process.env)) if (name.startsWith("VITE_") && value && value.startsWith("sb_secret_")) throw new Error("Server key refused in client environment");
console.log("IOS_PUBLIC_ENV_CHECK_PASSED");
