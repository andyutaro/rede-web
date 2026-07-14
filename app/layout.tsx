import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// OGP画像のalt(SNSカード用)
const OG_ALT = "Andy — Podcaster。闇に発光するツノホコリと音の波形";

export const metadata: Metadata = {
  metadataBase: new URL("https://andyutaro.com"),
  title: "Andy 〔 Podcaster 〕",
  description: "Andy — Podcaster",
  // OGP画像は絶対URLで明示する(2026-07-14)。この改変版Nextはファイル規約
  // (opengraph-image.jpg)のURL解決がmetadataBaseを拾わず、実行環境の
  // フォールバック(worker=localhost, Vercel=配備URL)になるため、
  // 「絶対URLはmetadataBaseを無視してそのまま使う」仕様で確実に固定する
  openGraph: {
    images: [{ url: "https://andyutaro.com/og.jpg", width: 1200, height: 630, alt: OG_ALT }],
  },
  twitter: {
    card: "summary_large_image",
    images: [{ url: "https://andyutaro.com/og.jpg", alt: OG_ALT }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: data-themeはペイント前のインラインスクリプトが
    // 付与する(公開サイトのダークモード)ため、サーバーHTMLとの属性差分は意図的
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
