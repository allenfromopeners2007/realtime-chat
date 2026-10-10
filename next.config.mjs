/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 上传的图片来自 Supabase Storage 的公开 URL，这里放开远程图片域名，
  // 方便以后把 <img> 换成 next/image 时不用再改配置。
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.supabase.in" },
    ],
  },
};

export default nextConfig;
