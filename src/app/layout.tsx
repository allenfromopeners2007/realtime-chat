import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "实时聊天室 · Next.js + Supabase",
  description:
    "深色主题实时聊天室：Supabase Realtime 推送、Storage 图片与文件上传、登录后才能发言。",
};

export const viewport: Viewport = {
  themeColor: "#0a0b11",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="bg-ink-950 text-ink-100 antialiased">{children}</body>
    </html>
  );
}
