import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";

import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_COOKIE_NAME, SUPABASE_URL_SERVER } from "@/lib/env";

/**
 * 刷新 Supabase 的登录 Cookie。
 *
 * 为什么需要：access token 只有 1 小时有效期，如果不刷新，
 * 用户会在某个时刻突然变成“未登录”，写消息就 401 了。
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured) return response;

  const cookieMethods: CookieMethodsServer = {
    getAll() {
      return request.cookies.getAll();
    },
    setAll(cookiesToSet) {
      for (const { name, value } of cookiesToSet) {
        request.cookies.set(name, value);
      }
      response = NextResponse.next({ request });
      for (const { name, value, options } of cookiesToSet) {
        response.cookies.set(name, value, options);
      }
    },
  };

  const supabase = createServerClient(SUPABASE_URL_SERVER, SUPABASE_ANON_KEY, {
    cookies: cookieMethods,
    // 必须和浏览器端用同一个 cookie 名（详见 env.ts 注释）
    cookieOptions: { name: SUPABASE_COOKIE_NAME },
  });

  // 必须调用 getUser()：它会顺带触发 token 刷新并把新 Cookie 写进 response
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // 已登录还去登录页 → 直接回聊天室
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
