"use client";
import { useEffect, useState } from "react";
export function useContentSafetyRevision() {
 const [revision,setRevision]=useState(0);
 useEffect(()=>{const update=()=>setRevision(v=>v+1);window.addEventListener("snow-content-safety-changed",update);return()=>window.removeEventListener("snow-content-safety-changed",update);},[]);
 return revision;
}
export function contentSafetyChanged(){window.dispatchEvent(new Event("snow-content-safety-changed"));}
