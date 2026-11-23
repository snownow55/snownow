import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, here, "VITE_");
  for (const [name, value] of Object.entries(env)) {
    if (/SERVICE|SECRET|PASSWORD|TOKEN/.test(name) || value.startsWith("sb_secret_")) throw new Error("Server credentials refused in mobile build");
    if (value.startsWith("eyJ")) {
      let claims; try { claims = JSON.parse(Buffer.from(value.split(".")[1], "base64url").toString()); } catch { throw new Error("Invalid public JWT configuration"); }
      if (claims.role !== "anon" || claims.ref !== env.VITE_SUPABASE_PROJECT_REF) throw new Error("Only the matching public anon key is allowed");
    }
  }
  return {
  plugins: [{ name: "native-supabase", enforce: "pre", resolveId(source, importer) {
    if (source === "@/lib/supabase" || (source === "./supabase" && importer?.startsWith(resolve(root, "lib")))) return resolve(here, "src/supabase.ts");
  } }, react()],
  publicDir: false,
  resolve: { dedupe: ["react", "react-dom", "@supabase/supabase-js"], alias: [
    { find: "@/lib/supabase", replacement: resolve(here, "src/supabase.ts") },
    { find: "next/link", replacement: resolve(here, "src/next/link.tsx") },
    { find: "next/navigation", replacement: resolve(here, "src/next/navigation.ts") },
    { find: "next/image", replacement: resolve(here, "src/next/image.tsx") },
    { find: "@", replacement: root },
  ] },
  css: { postcss: { plugins: [tailwindcss()] } },
  server: { port: 5173, strictPort: true, fs: { allow: [root] } },
  build: { outDir: "dist", emptyOutDir: true },
};
});
