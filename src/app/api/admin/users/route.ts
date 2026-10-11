import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody } from "@/lib/api-response";
import { mapAdminError, requireAdmin, requireOwner } from "@/lib/admin";
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

  return jsonError(`未知操作：${action || "(空)"}`, 400);
}
