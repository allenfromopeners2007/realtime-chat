import { cookies } from "next/headers";
import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL_SERVER } from "@/lib/env";

/**
 * 服务端 Supabase 客户端：从 Cookie 里恢复当前登录用户。
 * 在 Server Component / Route Handler 里都可以用。
 *
 * Next 15 的 cookies() 是异步的，所以这里也要 await。
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient> {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase 环境变量未配置：请先复制 .env.local.example 为 .env.local");
  }

  const cookieStore = await cookies();

  // 显式标注成 CookieMethodsServer，参数类型由 @supabase/ssr 提供（否则 strict 模式下是隐式 any）
  const cookieMethods: CookieMethodsServer = {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet) {
      try {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      } catch {
        // 在 Server Component 里调用 set 会抛错，这里直接忽略：
        // 刷新 Cookie 的工作交给 middleware 完成。
      }
    },
  };

  // 服务端直连 Supabase（海外机器上不需要代理，也不该走浏览器那层反代）
  return createServerClient(SUPABASE_URL_SERVER, SUPABASE_ANON_KEY, { cookies: cookieMethods });
}

/** 拿当前登录用户；未登录或未配置环境变量时返回 null */
export async function getCurrentUser() {
  if (!isSupabaseConfigured) return null;
  try {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user ?? null;
  } catch (error) {
    console.error("[server] 读取当前用户失败", error);
    return null;
  }
}
