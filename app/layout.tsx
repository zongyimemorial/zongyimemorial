import type { Metadata } from "next";
import { Suspense } from "react";
import Script from "next/script";
import NavResilience from "@/components/site/NavResilience";
import AnalyticsTracker from "@/components/site/AnalyticsTracker";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "宗忆堂 · 殡葬祭祀文化平台",
    template: "%s · 宗忆堂"
  },
  description:
    "殡葬祭祀文化平台：新闻资讯、数字纪念馆、云祭扫、虚拟献花。以数字方式留存思念，传承文化。",
  keywords: ["殡葬", "祭祀", "数字纪念馆", "云祭扫", "虚拟献花", "生命文化"],
  // OG / Twitter 卡：微信、微博、Telegram 等分享时展示标题 + 描述 + 品牌图。
  // 中间件已对社交抓取器 UA 放行，否则卡片抓不到、分享出去就是白板。
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "宗忆堂",
    title: "宗忆堂 · 以数字方式，留存思念，传递敬意",
    description:
      "数字纪念馆、云祭扫、宗亲文化与生命文化资讯。为思念安一个随时可达的家。",
    images: [
      {
        url: "/assets/og-default.jpg",
        width: 1200,
        height: 630,
        alt: "宗忆堂 · 数字纪念馆与云祭扫平台",
      },
    ],
    locale: "zh_CN",
  },
  twitter: {
    card: "summary_large_image",
    title: "宗忆堂 · 殡葬祭祀文化平台",
    description: "数字纪念馆、云祭扫、宗亲文化。以数字方式留存思念。",
    images: ["/assets/og-default.jpg"],
  },
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  // umami 埋点（P0 增长基建）：环境变量可配置注入，未配置不渲染任何脚本。
  // 自托管/云托管均可：UMAMI_SRC 指向 script.js 地址，UMAMI_ID 是站点 id。
  // 埋点纪律：只记页面浏览与关键转化（建馆/下单），不采集个人身份信息。
  const umamiSrc = process.env.NEXT_PUBLIC_UMAMI_SRC;
  const umamiId = process.env.NEXT_PUBLIC_UMAMI_ID;

  return (
    <html lang="zh-CN">
      <body>
        <NavResilience />
        <Suspense fallback={null}>
          <AnalyticsTracker />
        </Suspense>
        {children}
        {umamiSrc && umamiId ? (
          <Script
            src={umamiSrc}
            data-website-id={umamiId}
            strategy="afterInteractive"
            data-do-not-track="true"
          />
        ) : null}
      </body>
    </html>
  );
}
