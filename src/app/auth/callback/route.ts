import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /auth/callback?code=...&next=/welcome
 *
 * 邮件里的链接（邀请 / 确认注册）会先到 Supabase 的 verify 接口，
 * 然后带着 `?code=` 跳到我们这里。这里把 code 换成登录态（写 Cookie），
 * 再跳到目标页 —— 新同学会被带到 /welcome 设置密码 ✓
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  // 只允许站内跳转，避免变成开放重定向
  const rawNext = url.searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  const errorDescription =
    url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (errorDescription) {
    console.error("[auth/callback] Supabase 返回错误：", errorDescription);
    return NextResponse.redirect(
      new URL(`/login?notice=${encodeURIComponent(errorDescription)}`, url.origin),
    );
  }

  if (code) {
    try {
      const supabase = await getSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("[auth/callback] 换取登录态失败：", error.message);
        return NextResponse.redirect(
          new URL(`/login?notice=${encodeURIComponent(error.message)}`, url.origin),
        );
      }
    } catch (error) {
      console.error("[auth/callback] 异常：", error);
      return NextResponse.redirect(new URL("/login?notice=链接处理失败，请重试", url.origin));
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
