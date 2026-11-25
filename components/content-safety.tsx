"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";
import { reportReasons,validSafetyInput } from "@/lib/content-safety";
import { contentSafetyChanged } from "@/lib/use-content-safety";
export function PostSafetyActions({postId,isOwn=false}:{postId:number;isOwn?:boolean}){
 const {user}=useAuth();const [reason,setReason]=useState<keyof typeof reportReasons>("abuse");const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
 if(isOwn)return null;
 if(!user)return <Link className="mt-3 inline-block text-xs underline text-brand" href={`/login?next=${encodeURIComponent(typeof location==='undefined'?'/':location.pathname)}`}>通報・ブロックにはログインが必要です</Link>;
 async function act(block:boolean){
  if(!supabase||busy)return;if(block&&!window.confirm("この投稿者のすべての投稿を非表示にしますか？設定画面から解除できます。"))return;
  if(!validSafetyInput({post_id:postId,action:block?"block":"report",...(block?{}:{reason})})){setMessage("投稿を確認できませんでした。");return;}
  setBusy(true);setMessage("");try{
   const {data,error}=await supabase.rpc(block?"block_snow_post_author":"report_snow_post",{p_post:postId,...(block?{}:{p_reason:reason})});
   if(error||data!==true)throw new Error();setMessage(block?"投稿者をブロックしました。":"通報を受け付けました。運営が確認します。");if(block)contentSafetyChanged();
  }catch{setMessage("操作できませんでした。メール認証・接続状態を確認してください。");}finally{setBusy(false);}
 }
 return <div className="mt-3 border-t pt-3 text-xs"><label>通報理由<select className="ui-input mt-1" value={reason} onChange={e=>setReason(e.target.value as keyof typeof reportReasons)}>{Object.entries(reportReasons).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><div className="mt-2 flex flex-wrap gap-3"><button type="button" className="ui-secondary text-xs" disabled={busy} onClick={()=>void act(false)}>この投稿を通報</button><button type="button" className="ui-secondary text-xs" disabled={busy} onClick={()=>void act(true)}>この投稿者をブロック</button></div><p role="status" className="mt-2">{message}</p></div>;
}
export function BlockedAuthors(){
 const {user}=useAuth();const [state,setState]=useState<{userId:string;rows:{block_id:string;created_at:string}[]}|null>(null);const [error,setError]=useState("");const [revision,setRevision]=useState(0);const [busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;if(user&&supabase)void Promise.resolve(supabase.rpc("my_blocked_authors")).then(({data,error})=>{if(!active)return;if(error||!Array.isArray(data)){setError("ブロック一覧を読み込めませんでした。");return;}setError("");setState({userId:user.id,rows:data});}).catch(()=>{if(active)setError("ブロック一覧を読み込めませんでした。");});return()=>{active=false;};},[user,revision]);
 if(!user)return null;const rows=state?.userId===user.id?state.rows:[];
 async function unblock(id:string){if(!supabase||busy||!window.confirm("この投稿者のブロックを解除しますか？"))return;setBusy(true);try{const {data,error}=await supabase.rpc("unblock_snow_author",{p_block:id});if(error||data!==true)throw new Error();setError("");setRevision(v=>v+1);contentSafetyChanged();}catch{setError("解除できませんでした。");}finally{setBusy(false);}}
 return <section className="ui-card mt-4 p-4"><h2 className="font-bold">ブロックした投稿者</h2><p className="mt-2 text-xs">ブロックはログイン中の一覧・詳細に反映されます。</p>{error&&<p role="alert">{error}</p>}{!error&&rows.length===0&&<p className="mt-2 text-sm">ブロックした投稿者はいません。</p>}{rows.map((r,i)=><div className="mt-2 flex items-center justify-between" key={r.block_id}><span className="text-sm">投稿者 {i+1}（{new Date(r.created_at).toLocaleDateString('ja-JP')}）</span><button className="ui-secondary text-xs" disabled={busy} onClick={()=>void unblock(r.block_id)}>解除</button></div>)}</section>;
}
