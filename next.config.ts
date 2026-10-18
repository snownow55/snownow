import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bundle the reviewed master sources with the independent demo routes.
  outputFileTracingIncludes: {
    "/demo": ["./docs/resort-master-review/59-resorts-review.csv", "./docs/resort-master-review/02-dev-master-change-draft.sql"],
    "/demo/**": ["./docs/resort-master-review/59-resorts-review.csv", "./docs/resort-master-review/02-dev-master-change-draft.sql"],
  },
  // Keep isolated browser tests separate from an existing development server.
  distDir: process.env.SNOW_E2E === "1" ? ".next-e2e" : ".next",
};

export default nextConfig;
