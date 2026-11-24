// Build-only check. Never prints key values, and never connects to Supabase.
const dev="https://viidjrhaoxcvunbfdbni.supabase.co";
if(process.env.SNOW_DEPLOYMENT_ENV!=="development" || process.env.NEXT_PUBLIC_SUPABASE_URL!==dev) throw new Error("CLOUDFLARE_DEVELOPMENT_PROJECT_REQUIRED");
if(!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) throw new Error("DEVELOPMENT_PUBLIC_KEY_REQUIRED");
const publicKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if(publicKey.startsWith("sb_secret_")) throw new Error("SERVER_KEY_IN_PUBLIC_CONFIGURATION");
if(publicKey.startsWith("eyJ")){
 let payload;try{payload=JSON.parse(Buffer.from(publicKey.split(".")[1],"base64url").toString("utf8"));}catch{throw new Error("INVALID_DEVELOPMENT_PUBLIC_KEY");}
 if(payload.role!=="anon"||payload.ref!=="viidjrhaoxcvunbfdbni") throw new Error("DEVELOPMENT_ANON_KEY_REQUIRED");
}else if(!publicKey.startsWith("sb_publishable_")) throw new Error("DEVELOPMENT_PUBLIC_KEY_REQUIRED");
const site=new URL(process.env.NEXT_PUBLIC_SITE_URL||"");
if(site.origin==="https://snowviking.jp" || (site.protocol!=="https:" && !(site.protocol==="http:" && ["localhost","127.0.0.1"].includes(site.hostname)))) throw new Error("NON_PRODUCTION_TEST_ORIGIN_REQUIRED");
console.log("CLOUDFLARE_DEVELOPMENT_CONFIGURATION_VERIFIED");
