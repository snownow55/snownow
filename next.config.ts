import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep isolated browser tests separate from an existing development server.
  distDir: process.env.SNOW_E2E === "1" ? ".next-e2e" : ".next",
};

export default nextConfig;
