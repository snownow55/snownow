import type { AnchorHTMLAttributes } from "react";
import { navigate } from "./navigation";
export default function Link({ href, children, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a {...props} href={href} onClick={event => {
    onClick?.(event);
    if (!event.defaultPrevented && href.startsWith("/") && !href.startsWith("//") && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) {
      event.preventDefault(); navigate(href);
    }
  }}>{children}</a>;
}
