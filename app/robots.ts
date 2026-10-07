import type { MetadataRoute } from "next";

/**
 * robots.txt · P0 SEO 基建
 *
 * 策略：公开内容页全部允许索引；私有区（控制台/管理台/支付/认证）一律禁止。
 * 内测门口令页也禁止——它既没有索引价值，收录了还会分流品牌词。
 * 注意 middleware 对爬虫 UA 放行的是「公开页」；robots 是第二道边界，
 * 两道边界口径必须一致（允许 = 公开页，禁止 = 私有页）。
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/console",
          "/admin",
          "/pay",
          "/login",
          "/register",
          "/preview-gate",
          "/api",
          "/uploads/private",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
