"use client";

import { useEffect, useId, useRef, useState } from "react";

export function ResortMemo({ area, comment }: { area: string; comment: string }) {
  const paragraph = useRef<HTMLParagraphElement>(null);
  const commentId = useId();
  const [overflow, setOverflow] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const hasComment = !!comment.trim();

  useEffect(() => {
    const element = paragraph.current;
    if (!element) return;
    let active = true;
    const measure = () => {
      if (!active) return;
      // scrollHeight includes the complete text even while line-clamp is applied.
      const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
      const exceedsTwoLines = element.scrollHeight > lineHeight * 2 + 1;
      setOverflow(exceedsTwoLines);
      if (!exceedsTwoLines) setExpanded(false);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const frame = requestAnimationFrame(measure);
    void document.fonts.ready.then(measure);
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [comment]);

  if (!hasComment && !area.trim()) return null;
  return (
    <div role="group" aria-label="現地メモ" className="mt-3 border-t border-brand/10 pt-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-600">
        {hasComment && <span className="font-semibold text-brand">現地メモ</span>}
        {area.trim() && <span><span>ゲレンデ内の位置</span>：{area}</span>}
      </p>
      {hasComment && <>
        <p id={commentId} ref={paragraph} aria-label="現地コメント"
          className={`mt-1 whitespace-pre-wrap text-sm leading-6 text-ink [overflow-wrap:anywhere] ${expanded && overflow ? "" : "line-clamp-2"}`}>
          {comment}
        </p>
        {overflow && <button type="button" aria-expanded={expanded} aria-controls={commentId}
          onClick={() => setExpanded((value) => !value)} className="min-h-11 py-2 text-xs font-semibold text-brand hover:underline">
          {expanded ? "閉じる" : "続きを読む"}
        </button>}
      </>}
    </div>
  );
}
