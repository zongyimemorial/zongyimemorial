/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // geoip-lite 自带 .dat 数据文件，被 webpack 打包后 __dirname 错位导致 ENOENT。
  // 标记为服务端外部包，运行时直接从 node_modules 加载（数据文件随之可寻）。
  serverExternalPackages: ["geoip-lite"],
  // 多 dev 实例（3000/3100）共目录会互相踩踏 .next 产物，导致 ENOENT page.js。
  // 通过 NEXT_DIST_DIR 让每个实例用独立构建目录；生产 build 未设该变量，回落 .next。
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.cos.ap-**.myqcloud.com" },
      { protocol: "https", hostname: "**.aliyuncs.com" }
    ],
    /*
      ⚠️ 必须开 dangerouslyAllowSVG —— 否则 SVG 封面全部渲染成空白。

      Next.js 默认**拒绝对 SVG 走图片优化器**（安全考虑）：`next/image` 会把
      src 包成 /_next/image?url=... ，优化器对 SVG 直接回 **400**，
      于是 <Image> 拿不到图，只剩一个占位的空盒子。
      实测现场：/mall/decor-tpl-plain 顶部一大片空白，正是封面容器
      （aspect-[16/9]）里的 SVG 加载失败 —— 不是布局或间距问题。
      受影响面很广：库里 68 个商品用 .svg 作封面（装修 58 / 服务 6 / 存储 4）。

      安全性评估（为什么这里开是安全的）：
        · 上传接口的 MIME 白名单只有 image/jpeg|png|webp（见 lib/upload.ts
          的 ALLOWED_IMAGE_TYPES），**用户无法上传 SVG** —— 这才是 SVG 走
          优化器的主要 XSS 风险来源，此处不成立。
        · 其余 SVG 全是我们自己的仓库静态资源（/assets/*.svg）与自有对象存储。
      另外两项是 Next 官方推荐的配套加固，不是可选项：
        · contentDispositionType: "attachment" —— 避免 SVG 被当顶层文档打开执行。
        · contentSecurityPolicy —— 沙箱化，禁脚本。
    */
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;"
  }
};

export default nextConfig;
