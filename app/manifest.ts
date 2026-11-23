import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "SNOW VIKING",
    short_name: "SNOW VIKING",
    description: "ゲレンデ選びに今の情報を",
    lang: "ja",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7fbfc",
    theme_color: "#087d89",
    icons: [
      { src: "/icons/snow-viking-192-v2.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/snow-viking-512-v2.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/snow-viking-maskable-512-v2.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
