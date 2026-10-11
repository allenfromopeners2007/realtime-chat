import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { SUPABASE_URL_SERVER } from "@/lib/env";

/**
 * ⚠️⚠️ 危险模块：这个客户端**绕过所有 RLS**（相当于全库钥匙）⚠️⚠️
 *
 * 规则（必须严格遵守）：
 *   1. **只能被服务端代码 import**（API Route / Server Component）
 *      绝对不能让任何 "use client" 组件 import 本文件 ✗
 *   2. 密钥只从**服务端环境变量** `SUPABASE_SERVICE_ROLE_KEY` 读，
 *      **不能**加 NEXT_PUBLIC_ 前缀（加了就会被打进浏览器代码 ✗）
 *   3. 调用前**必须先确认调用者是管理员**（用 requireAdmin()，权限以数据库为准）
 *   4. 目前**只有一个地方**用它：/api/admin/invite（发邀请邮件）
 *      因为 Supabase 的"邀请用户"是管理员接口，只有 service_role 能调 ✓
 */

/** 环境变量没配时返回 null（调用方给出友好提示，而不是崩掉） */
export function getSupabaseAdminClient(): SupabaseClient | null {
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (key === "") return null;

  return createClient(SUPABASE_URL_SERVER, key, {
    auth: {
      // 服务端一次性客户端：不保存会话、不自动刷新
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/** 是否已经配置了 service_role（界面上用来决定要不要显示"邀请"入口） */
export function isInviteConfigured(): boolean {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim() !== "";
}
