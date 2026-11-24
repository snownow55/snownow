import test from "node:test";
import assert from "node:assert/strict";
import { deploymentEnvironment } from "../lib/deployment-environment.ts";
import { deletionConfiguration } from "../lib/account-deletion.ts";
test("Workers environment guards never accept a production Supabase URL in development", () => {
 const config={ACCOUNT_DELETION_ENABLED:"true",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"test-only",ACCOUNT_DELETION_SUPABASE_SERVICE_KEY:"test-only",NODE_ENV:"production",SNOW_DEPLOYMENT_ENV:"development"};
 assert.equal(deploymentEnvironment({...config,SNOW_DEPLOYMENT_ENV:"typo"}),null);
 assert.equal(deletionConfiguration({...config,NEXT_PUBLIC_SUPABASE_URL:"https://rtgqyctqjfoercdymssd.supabase.co"}),null);
 assert.ok(deletionConfiguration({...config,NEXT_PUBLIC_SUPABASE_URL:"https://viidjrhaoxcvunbfdbni.supabase.co"}));
 assert.equal(deletionConfiguration({...config,SNOW_DEPLOYMENT_ENV:"production",NEXT_PUBLIC_SUPABASE_URL:"https://viidjrhaoxcvunbfdbni.supabase.co"}),null);
 assert.ok(deletionConfiguration({...config,SNOW_DEPLOYMENT_ENV:"production",NEXT_PUBLIC_SUPABASE_URL:"https://rtgqyctqjfoercdymssd.supabase.co"}));
 assert.equal(deploymentEnvironment({VERCEL_ENV:"production"}),"production");
});
