import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { nativeBearer } from "@/lib/native-api";
import { cookies } from "next/headers";
export async function serverSupabase(request?: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const token = request ? nativeBearer(request) : null;
  if (token) return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const store = await cookies();
  return createServerClient(url, key, {
    cookieOptions: {
      sameSite: 'lax',
      secure: process.env.NEXT_PUBLIC_SITE_URL?.startsWith('https://') ?? false,
    },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items) =>
        items.forEach(({ name, value, options }) =>
          store.set(name, value, options),
        ),
    },
  });
}
