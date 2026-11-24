import {pathToFileURL} from 'node:url';
export async function checkNativeApi(base,fetcher=fetch){
 if(base!=="https://snowviking.jp")throw new Error("Production API origin mismatch");
 for(const [path,method] of [["/api/posts","POST"],["/api/posts/manage","PATCH"],["/api/account/delete","POST"]]){
  const r=await fetcher(base+path,{method:"OPTIONS",redirect:"error",signal:AbortSignal.timeout(10000),headers:{Origin:"capacitor://localhost","Access-Control-Request-Method":method,"Access-Control-Request-Headers":"authorization,content-type"}});
  const methods=(r.headers.get("Access-Control-Allow-Methods")||"").split(',').map(v=>v.trim());
  if(r.status!==204||r.headers.get("Access-Control-Allow-Origin")!=="capacitor://localhost"||r.headers.has("Access-Control-Allow-Credentials")||!methods.includes(method))throw new Error(`NATIVE_API_NOT_READY: ${path} (${r.status})`);
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{await checkNativeApi(process.env.VITE_API_BASE_URL);console.log("IOS_NATIVE_API_PREFLIGHT_PASSED");}
 catch(e){console.error(e instanceof Error?e.message:"IOS_NATIVE_API_PREFLIGHT_FAILED");process.exitCode=1;}
}
