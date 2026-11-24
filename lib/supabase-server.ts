import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { nativeBearer, nativeApiOrigin } from "@/lib/native-api";
import { cookies } from "next/headers";
export async function serverSupabase(request?: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const token = request ? nativeBearer(request) : null;
  // Recognized native requests must never fall back to a browser Cookie session.
  if (request && (request.headers.get("origin")==="capacitor://localhost" || nativeApiOrigin(request)) && !token) return null;
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
