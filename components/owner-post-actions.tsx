"use client";
import { useState } from "react";
import { choices } from "@/lib/app-post-validation";
import type { PostEdit } from "@/lib/post-edit";
export function OwnerPostActions({id,initial,onChanged}:{id:number;initial:PostEdit;onChanged:()=>void}) {
 const [editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [fields,setFields]=useState(initial);
 async function submit(remove:boolean) {
  if(busy || (remove && !window.confirm("この投稿を削除しますか？削除は取り消せません。"))) return;
  setBusy(true);setError("");
  try {
   const response=await fetch('/api/posts/manage',{method:remove?'DELETE':'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,...(remove?{}:{fields})})});
   if(!response.ok) throw new Error();
   setEditing(false);onChanged();
  } catch {setError("操作に失敗しました。投稿の状態を確認してから再度お試しください。");}
  finally {setBusy(false);}
 }
 return <div className="mt-4 border-t pt-3">
  {editing ? <form onSubmit={e=>{e.preventDefault();void submit(false);}}>
   <fieldset disabled={busy}>
    {Object.entries(choices).map(([key,options])=><label key={key} className="mb-3 block text-sm">
     {({area:'場所',snow_type:'雪質',snowfall:'営業開始後の降雪',roughness:'荒れ具合',crowd:'混雑'} as Record<string,string>)[key]}
     <select className="ui-input" value={fields[key as keyof PostEdit]} onChange={e=>setFields({...fields,[key]:e.target.value})}>
      {options.map(v=><option key={v}>{v}</option>)}
     </select>
    </label>)}
    <label className="block text-sm">コメント<textarea className="ui-input" maxLength={1000} value={fields.comment} onChange={e=>setFields({...fields,comment:e.target.value})}/></label>
    <button className="ui-primary mt-3" type="submit">保存</button>
    <button className="ui-secondary ml-2" type="button" onClick={()=>setEditing(false)}>キャンセル</button>
   </fieldset>
  </form>:<div className="flex gap-3">
   <button className="ui-secondary" disabled={busy} onClick={()=>{setFields(initial);setEditing(true);}}>編集</button>
   <button className="ui-secondary" disabled={busy} onClick={()=>void submit(true)}>削除</button>
  </div>}
  {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
 </div>;
}
