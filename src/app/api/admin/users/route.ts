import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody } from "@/lib/api-response";
import { mapAdminError, requireAdmin, requireOwner } from "@/lib/admin";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeAdminUser } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/admin/users → 用户列表（含邮箱、最后登录时间、发言数），仅管理员 */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { data, error } = await guard.ctx.supabase.rpc("admin_list_users");

  if (error) {
    console.error("[api/admin/users] 读取失败：", error.message);
    return jsonError(
      `读取用户列表失败：${error.message}。请确认已执行 supabase/admin-migration.sql`,
      500,
    );
  }

  const rows = Array.isArray(data) ? data : [];
  return jsonOk({ users: rows.map(normalizeAdminUser) });
}

type PatchBody = {
  userId?: unknown;
  action?: unknown;
  role?: unknown;
  banned?: unknown;
  reason?: unknown;
  username?: unknown;
  /** 管理员给账号直接设的密码（action=setPassword） */
  password?: unknown;
};

/**
 * PATCH /api/admin/users
 * body: { userId, action: "setRole" | "setBan" | "rename", role?, banned?, reason?, username? }
 */
export async function PATCH(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = await readJsonBody<PatchBody>(request);
  if (!parsed.ok) return parsed.response;

  const userId = typeof parsed.data.userId === "string" ? parsed.data.userId.trim() : "";
  const action = typeof parsed.data.action === "string" ? parsed.data.action : "";

  if (userId === "") return jsonError("缺少 userId", 400);

  const { supabase, userId: selfId } = guard.ctx;

  // 防止管理员误操作把自己锁在门外（改名除外）
  if (userId === selfId && action !== "rename") {
    return jsonError("不能对自己执行这个操作", 400);
  }

  if (action === "setRole") {
    // 任免管理员属于高危操作：只有所有者能做（数据库触发器也会再校验一次 ✓）
    const ownerGuard = await requireOwner();
    if (!ownerGuard.ok) return ownerGuard.response;

    const role = parsed.data.role === "admin" ? "admin" : parsed.data.role === "member" ? "member" : null;
    if (!role) return jsonError("role 只能是 admin 或 member", 400);

    const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
    if (error) return jsonError(mapAdminError(error.message), 400);
    return jsonOk({ ok: true, role });
  }

  if (action === "setBan") {
    const banned = parsed.data.banned === true;
    const reason =
      typeof parsed.data.reason === "string" ? parsed.data.reason.trim().slice(0, 200) : "";

    const { error } = await supabase
      .from("profiles")
      .update({ is_banned: banned, banned_reason: banned && reason !== "" ? reason : null })
      .eq("id", userId);

    if (error) return jsonError(mapAdminError(error.message), 400);
    return jsonOk({ ok: true, isBanned: banned });
  }

  if (action === "rename") {
    const username = typeof parsed.data.username === "string" ? parsed.data.username.trim() : "";
    if (username.length < 1 || username.length > 24) {
      return jsonError("昵称长度需要在 1 ~ 24 个字符之间", 400);
    }

    const { error } = await supabase.from("profiles").update({ username }).eq("id", userId);
    if (error) return jsonError(mapAdminError(error.message), 400);
    return jsonOk({ ok: true, username });
  }

  if (action === "setPassword") {
    // 给某个账号【直接设一个密码】—— 这是最可靠的加人方式 ✓
    //   不依赖邮件投递（163 投递不稳 ✗）
    //   不依赖一次性链接（会被"重发"或链接预览消耗掉 ✗）
    //   不依赖被墙的 supabase.co 域名 ✗
    // 属于高危操作（能接管任何账号）→ 只有所有者能做 ✓
    const ownerGuard = await requireOwner();
    if (!ownerGuard.ok) return ownerGuard.response;

    const password = typeof parsed.data.password === "string" ? parsed.data.password : "";
    if (password.length < 6) return jsonError("密码至少要 6 位", 400);
    if (password.length > 72) return jsonError("密码最多 72 位", 400);

    const admin = getSupabaseAdminClient();
    if (!admin) {
      return jsonError(
        "还没有配置 SUPABASE_SERVICE_ROLE_KEY —— 请到部署平台的环境变量里加上它（只放服务端，不要加 NEXT_PUBLIC_ 前缀），然后重新部署一次",
        503,
      );
    }

    // email_confirm: true —— 顺手把"邮箱未确认"也解掉，
    // 否则被邀请过但没走完流程的账号设了密码也登不进去 ✗
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (error) {
      console.error("[api/admin/users] 设置密码失败：", error.message);
      const message = error.message ?? "";
      if (/invalid api key|jwt|unauthorized|not allowed|forbidden/i.test(message)) {
        return jsonError(
          "密钥不对：SUPABASE_SERVICE_ROLE_KEY 可能填成了 anon key 或被截断了，请更新后重新部署",
          500,
        );
      }
      return jsonError(`设置密码失败：${message}`, 500);
    }

    console.log(`[api/admin/users] 管理员 ${guard.ctx.username} 给 ${userId} 设置了一个新密码`);
    // 把密码回传给管理员，方便他复制后发给同学 ✓（只显示在他自己的页面上 ✓）
    return jsonOk({ ok: true, userId, password });
  }

  return jsonError(`未知操作：${action || "(空)"}`, 400);
}
