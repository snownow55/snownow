import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

if (!Array.isArray(base.webServer)) throw new Error("Expected isolated local test servers");

// Synthetic Vercel metadata only. Supabase and the app stay on the base
// configuration's loopback mock servers; no Vercel/real DB requests are made.
export default defineConfig({
  ...base,
  testDir: "./tests/preview",
  webServer: base.webServer.map((server) => ({
    ...server,
    env: { ...server.env, VERCEL: "1", VERCEL_ENV: "preview",
      VERCEL_URL: "snow-viking-deployment-fixture.vercel.app",
      VERCEL_BRANCH_URL: "snow-viking-git-auth-fixture.vercel.app" },
  })),
});
