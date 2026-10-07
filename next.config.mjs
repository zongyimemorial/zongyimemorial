/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.cos.ap-**.myqcloud.com" },
      { protocol: "https", hostname: "**.aliyuncs.com" }
    ]
  }
};

export default nextConfig;
