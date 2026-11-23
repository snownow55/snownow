import type { ImgHTMLAttributes } from "react";
type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src: string | { src: string }; unoptimized?: boolean; preload?: boolean };
export default function Image({ src, unoptimized: _unoptimized, preload: _preload, alt, ...props }: Props) {
  return <img {...props} src={typeof src === "string" ? src : src.src} alt={alt ?? ""} />;
}
