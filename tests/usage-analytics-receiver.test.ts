import test from "node:test";
import assert from "node:assert/strict";
import { receiveUsage } from "../lib/usage-analytics-receiver.ts";
const now=Date.parse("2026-11-24T10:00:00+09:00");
const event={event_id:"00000000-0000-4000-8000-000000000001",visitor_day_id:"00000000-0000-4000-8000-000000000002",session_id:"00000000-0000-4000-8000-000000000003",day_jst:"2026-11-24",event_type:"visit",display_mode:"browser",platform:"android",entry_source:"youtube",page_kind:"home"};
const req=(body=JSON.stringify([event]),headers:Record<string,string>={})=>new Request("https://snowviking.jp/api/usage",{method:"POST",headers:{origin:"https://snowviking.jp","content-type":"application/json","sec-fetch-site":"same-origin",...headers},body});
test("receiver rejects cross-origin, non-JSON, oversized and PII payloads without calling storage",async()=>{
 let calls=0; const store=async()=>{calls++;return true;};
 for(const [r,status] of [[req("[]",{origin:"https://evil.example"}),403],[req("[]",{"sec-fetch-site":"cross-site"}),403],[req("[]",{"content-type":"text/plain"}),415],[req("x".repeat(4097)),413],[req("{}"),400],[req(JSON.stringify([{...event,email:"private@example.com"}])),400],[req(JSON.stringify([{...event,day_jst:"2026-11-23"}])),400]] as const){
  const result=await receiveUsage(r,true,store,now);assert.equal(result.status,status);assert.equal(result.headers.get("cache-control"),"no-store");
 } assert.equal(calls,0);
 assert.equal((await receiveUsage(req(),false,store,now)).status,204);assert.equal(calls,0);
});
test("receiver passes only validated events and isolates missing storage/config failure",async()=>{
 let saved:unknown;assert.equal((await receiveUsage(req(),true,async events=>{saved=events;return true;},now)).status,204);
 assert.deepEqual(saved,[event]);assert.equal((await receiveUsage(req(),true,async()=>false,now)).status,503);
});
