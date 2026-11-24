import test from 'node:test';import assert from 'node:assert/strict';
import {checkNativeApi} from '../mobile/scripts/check-native-api.mjs';
test('native build preflight refuses missing/disabled or wildcard CORS APIs and never sends credentials',async()=>{
 let calls=0;await checkNativeApi('https://snowviking.jp',async(url,init)=>{calls++;assert.equal(init.method,'OPTIONS');assert.equal(init.headers.Authorization,undefined);return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'capacitor://localhost','Access-Control-Allow-Methods':'GET, POST, PATCH, DELETE'}});});assert.equal(calls,3);
 for(const r of [new Response(null,{status:405}),new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, PATCH'}})])await assert.rejects(checkNativeApi('https://snowviking.jp',async()=>r),/NATIVE_API_NOT_READY/);
 await assert.rejects(checkNativeApi('https://evil.example'),/origin/);
});
