import test from "node:test";
import assert from "node:assert/strict";
import { UsageTracker, usageDay, usageMode, usagePlatform, usageSource, safeUsageUrl, validUsageBatch, type UsageContext } from "../lib/usage-analytics.ts";
class Memory { data = new Map<string,string>(); getItem(k:string){return this.data.get(k)??null;} setItem(k:string,v:string){this.data.set(k,v);} }
let counter=0;const uuid=()=>`00000000-0000-4000-8000-${(++counter).toString().padStart(12,"0")}`;
const context = (changes:Partial<UsageContext>={}):UsageContext => ({now:Date.parse("2026-11-24T10:00:00+09:00"),path:"/",mode:"standalone",platform:"android",source:"youtube",...changes});
test("JST date, PWA mode and phone/tablet classification",()=>{
 assert.equal(usageDay(Date.parse("2026-11-23T15:00:00Z")),"2026-11-24");
 assert.equal(usageMode(false,true),"standalone");assert.equal(usageMode(false,false),"browser");
 assert.equal(usagePlatform("iPhone"),"iphone");assert.equal(usagePlatform("Android"),"android");assert.equal(usagePlatform("Macintosh","MacIntel",5),"ipad");
});
test("SNS uses a bounded UTM/referrer classification, including YouTube and TikTok",()=>{
 for(const [url,source] of [["https://youtu.be/example","youtube"],["https://m.youtube.com/shorts/x","youtube"],["https://vt.tiktok.com/x","tiktok"],["https://l.instagram.com/x","instagram"],["https://t.co/x","x"]])assert.equal(usageSource("",url),source);
 assert.equal(usageSource("?utm_source=TikTok","https://youtube.com"),"tiktok");
 assert.equal(usageSource("?utm_source=user@example.com",""),"other");assert.equal(usageSource("","https://evilyoutube.com"),"other");assert.equal(usageSource("",""),"direct_unknown");
});
test("rerenders and route filters do not repeat launch/PV; navigation counts one PV",()=>{
 const local=new Memory(),tab=new Memory();const t=new UsageTracker(local,tab,uuid),c=context();
 const first=t.activate(c,true);assert.deepEqual(first.map(e=>e.event_type),["visit","session_start","page_view"]);
 assert.deepEqual(t.activate({...c,now:c.now+100},true),[]);
 const nav=t.activate({...c,path:"/resort/example",now:c.now+1000},true);assert.deepEqual(nav.map(e=>e.event_type),["page_view"]);
 const remount=new UsageTracker(local,tab,uuid);const reload=remount.activate({...c,now:c.now+2000},true);assert.deepEqual(reload.map(e=>e.event_type),["page_view"]);
 assert.equal(reload[0].session_id,first[0].session_id);
 assert.equal(t.activate({...c,now:c.now+31*60000}).filter(e=>e.event_type==="session_start").length,1);
});
test("shared browser/PWA daily identity and midnight rotation without a fake new launch",()=>{
 const local=new Memory();const a=new UsageTracker(local,new Memory(),uuid),b=new UsageTracker(local,new Memory(),uuid);
 const browser=a.activate(context({mode:"browser"}),true),pwa=b.activate(context(),true);assert.equal(browser[0].visitor_day_id,pwa[0].visitor_day_id);
 const t=new UsageTracker(new Memory(),new Memory(),uuid),before=context({now:Date.parse("2026-11-24T23:59:00+09:00")});const initial=t.activate(before,true);
 const next=t.activate({...before,now:before.now+120000},true);assert.deepEqual(next.map(e=>e.event_type),["visit"]);
 assert.notEqual(next[0].visitor_day_id,initial[0].visitor_day_id);assert.notEqual(next[0].session_id,initial[0].session_id);
});
test("PII/unknown fields, tokens in URLs and non-production/demos are excluded",()=>{
 const t=new UsageTracker(new Memory(),new Memory(),uuid),events=t.activate(context(),true);
 assert.equal(validUsageBatch(events,"2026-11-24"),true);
 assert.equal(validUsageBatch([{...events[0],email:"synthetic@example.test"}],"2026-11-24"),false);
 assert.equal(validUsageBatch(events,"2026-11-25"),false);
 assert.equal(safeUsageUrl("https://snowviking.jp/?code=secret#access_token=secret"),"https://snowviking.jp/");
 assert.equal(safeUsageUrl("https://snowviking.jp/resort/private-value?token=x"),"https://snowviking.jp/resort/[name]");
 for(const u of ["https://snowviking.jp/auth/callback?code=x","https://snowviking.jp/reset-password","https://snowviking.jp/demo","https://preview.vercel.app/"])assert.equal(safeUsageUrl(u),null);
});
test("storage failure disables independent tracking without a fallback fingerprint",()=>{
 const bad={getItem(){throw new Error("denied")},setItem(){throw new Error("denied")}};
 assert.throws(()=>new UsageTracker(bad,new Memory(),uuid).activate(context(),true),/denied/);
});
