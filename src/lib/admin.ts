import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";

import { jsonError } from "@/lib/api-response";
import { isSupabaseConfigured } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type AdminContext = {
  supabase: SupabaseClient;
  userId: string;
  username: string;
};

type AdminGuard = { ok: true; ctx: AdminContext } | { ok: false; response: NextResponse };

/**
 * 管理接口统一入口：确认「已登录」且「profiles.role = 'admin'」。
 *
 * 注意：这里用的是**用户自己的 session**（anon key + Cookie），不是 service_role。
 * 也就是说权限是由数据库的 RLS / 函数里的 is_admin() 检查保证的，
 * 就算有人绕过前端直接调这些接口，也拿不到管理员能力。
 */
export async function requireAdmin(): Promise<AdminGuard> {
  if (!isSupabaseConfigured) {
    return { ok: false, response: jsonError("Supabase 还没有配置，请先填写 .env.local", 503) };
  }

  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, response: jsonError("请先登录", 401) };

  const { data, error } = await supabase
    .from("profiles")
    .select("role, username")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[admin] 读取权限失败：", error.message);
    return {
      ok: false,
      response: jsonError(
        `读取权限失败：${error.message}。如果提示字段不存在，请先在 SQL Editor 执行 supabase/admin-migration.sql`,
        500,
      ),
    };
  }

  if (!data || data.role !== "admin") {
    return { ok: false, response: jsonError("需要管理员权限", 403) };
  }

  return {
    ok: true,
    ctx: { supabase, userId: user.id, username: String(data.username ?? "") },
  };
}

/** 把数据库抛出的约束错误翻译成人话 */
export function mapAdminError(message: string): string {
  if (/至少要保留一个管理员/.test(message)) {
    return "至少要保留一个管理员 —— 不能取消最后一个管理员的身份";
  }
  if (/不能封禁管理员/.test(message)) {
    return "不能封禁管理员，请先把它改成普通成员";
  }
  if (/row-level security|permission denied/i.test(message)) {
    return "没有权限：请确认你的 profiles.role 是 admin，并且已执行 admin-migration.sql";
  }
  return `操作失败：${message}`;
}
