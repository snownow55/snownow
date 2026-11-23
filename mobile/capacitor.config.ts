import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "jp.snowviking.app",
  appName: "SNOW VIKING",
  webDir: "dist",
  loggingBehavior: "none",
  server: { iosScheme: "capacitor", hostname: "localhost" },
  ios: { contentInset: "automatic" },
};
export default config;
