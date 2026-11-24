import { receiveUsage } from "@/lib/usage-analytics-receiver";
import { storeUsageEvents } from "@/lib/usage-analytics-server";
export async function POST(request: Request) {
  return receiveUsage(request, process.env.USAGE_ANALYTICS_ENABLED === "true", storeUsageEvents);
}
