// Cloudflare sets SNOW_DEPLOYMENT_ENV explicitly. Vercel behavior stays compatible.
export function deploymentEnvironment(env: Readonly<Record<string, string | undefined>>): "production" | "development" | null {
  if (env.SNOW_DEPLOYMENT_ENV !== undefined) {
    return env.SNOW_DEPLOYMENT_ENV === "production" || env.SNOW_DEPLOYMENT_ENV === "development" ? env.SNOW_DEPLOYMENT_ENV : null;
  }
  return env.VERCEL_ENV === "production" ? "production" : "development";
}
