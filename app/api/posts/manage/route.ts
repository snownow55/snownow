import { serverSupabase } from "@/lib/supabase-server";
import { isAllowedPostOrigin } from "@/lib/site-origin";
import { validEdit } from "@/lib/post-edit";
async function readPostBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return body + decoder.decode();
      size += value.byteLength;
      if (size > 16000) {
        void reader.cancel().catch(() => {});
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}


export async function GET() {
 const client=await serverSupabase();
 if (!client || !(await client.auth.getUser()).data.user) return Response.json({error:"Authentication required"},{status:401});
 const {data,error}=await client.rpc("my_post_ids");
 return error ? Response.json({error:"Ownership unavailable"},{status:503}) : Response.json({ids:data},{headers:{"Cache-Control":"no-store"}});
}
async function manage(request:Request, editing:boolean) {
 if (!isAllowedPostOrigin(request.url,request.headers.get("origin"))) return Response.json({error:"Forbidden"},{status:403});
 const client=await serverSupabase();
 if (!client || !(await client.auth.getUser()).data.user) return Response.json({error:"Authentication required"},{status:401});
 if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json") return Response.json({error:"JSON required"},{status:415});
 let body;
 try { const raw=await readPostBody(request); if(raw===null) return Response.json({error:"Too large"},{status:413}); body=JSON.parse(raw); }
 catch {return Response.json({error:"Invalid JSON"},{status:400});}
 if (!body || !Number.isSafeInteger(body.id) || body.id<=0 || Object.keys(body).some(k=>!['id',...(editing?['fields']:[])].includes(k)) || (editing && !validEdit(body.fields))) return Response.json({error:"Invalid edit"},{status:400});
 const {data,error}=await client.rpc(editing?"edit_snow_post":"delete_snow_post",{post_id:body.id,...(editing?{payload:body.fields}:{})});
 if(error) return Response.json({error:"Operation failed"},{status:error.code==='22023'?400:error.code==='42501'?403:503});
 return data===true ? Response.json({ok:true},{headers:{"Cache-Control":"no-store"}}) : Response.json({error:"Post not found"},{status:404});
}
export function PATCH(request:Request){return manage(request,true);}
export function DELETE(request:Request){return manage(request,false);}
