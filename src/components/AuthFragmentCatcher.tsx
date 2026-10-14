"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * "邮件链接落点兜底"
 *
 * 背景：Supabase 的邀请/改密码邮件链接，验证后会带一串凭证跳回来。
 * 但这个跳转的落点取决于链接里的 `redirect_to` 参数 ——
 * 我们虽然生成了 /auth/callback，但有以下情况会落到**首页**：
 *   · 链接来自 Supabase 后台（它的 redirect_to 是站点的 Site URL = 首页）
 *   · 某些情况下 Supabase 会忽略 redirect_to，回退到 Site URL
 *   · 手动粘贴 / 转发链接时参数被截断
 * 落到首页的结果就是：页面看起来"没登录"，新同学永远见不到设置密码页 ✗
 *
 * 所以这里做一个兜底：只要发现 URL 里带着登录凭证（或认证错误），
 * 就自动转发给 /auth/callback 去处理 ✓
 *
 * 注意：浏览器里的 supabase-js 也会自动解析 #片段（detectSessionInUrl ✓），
 * 两边谁先处理都没关系 —— 我们的回调页会等到会话就绪再决定去哪 ✓
 */
export function AuthFragmentCatcher() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hash = window.location.hash;
    if (hash === "" || hash === "#") return;

    // 只关心认证相关的片段，别碰普通锚点（比如 #reply-123）
    const looksLikeAuth =
      hash.includes("access_token") ||
      hash.includes("refresh_token") ||
      hash.includes("error=") ||
      hash.includes("error_code=");
    if (!looksLikeAuth) return;

    // 已经在回调页上就别再跳了（否则会自己转自己 ✗）
    if (pathname.startsWith("/auth/callback")) return;

    console.log("[auth-catcher] 首页收到了认证片段，转发到 /auth/callback 处理");
    router.replace(`/auth/callback${window.location.search}${hash}`);
  }, [pathname, router]);

  return null;
}
