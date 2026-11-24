import { CloudflareAnalytics } from "@/components/cloudflare-analytics";
import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "SNOW VIKING",
  description: "ゲレンデ選びに今の情報を。朝の公式情報とユーザーの現地コンディションを共有するSNOW VIKING。",
  applicationName: "SNOW VIKING",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icons/snow-viking-192-v2.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/snow-viking-180-v2.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "SNOW VIKING", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#087d89" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <CloudflareAnalytics />
      </body>
    </html>
  );
}
