import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody } from "@/lib/api-response";
import { mapAdminError, requireAdmin } from "@/lib/admin";
import { normalizeAdminRoom, normalizeRoom } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/admin/rooms → 群组列表（含消息数、最后活跃时间） */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { data, error } = await guard.ctx.supabase.rpc("admin_list_rooms");

  if (error) {
    console.error("[api/admin/rooms] 读取失败：", error.message);
    return jsonError(
      `读取群组失败：${error.message}。请确认已执行 supabase/admin-migration.sql`,
      500,
    );
  }

  const rows = Array.isArray(data) ? data : [];
  return jsonOk({ rooms: rows.map(normalizeAdminRoom) });
}

type PostBody = { name?: unknown; description?: unknown };

/** POST /api/admin/rooms → 新建群组 */
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = await readJsonBody<PostBody>(request);
  if (!parsed.ok) return parsed.response;

  const name = typeof parsed.data.name === "string" ? parsed.data.name.trim() : "";
  const description =
    typeof parsed.data.description === "string" ? parsed.data.description.trim() : "";

  if (name.length < 1 || name.length > 40) return jsonError("群组名称长度需要在 1 ~ 40 个字符之间", 400);

  const { data, error } = await guard.ctx.supabase
    .from("rooms")
    .insert({ name, description: description === "" ? null : description })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") return jsonError("同名群组已经存在", 409);
    return jsonError(mapAdminError(error.message), 400);
  }

  return jsonOk({ room: normalizeRoom(data) }, 201);
}

type PatchBody = { id?: unknown; name?: unknown; description?: unknown; announcement?: unknown };

/** PATCH /api/admin/rooms → 改名 / 改简介 / 写公告（传空字符串表示清除公告） */
export async function PATCH(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = await readJsonBody<PatchBody>(request);
  if (!parsed.ok) return parsed.response;

  const id = typeof parsed.data.id === "string" ? parsed.data.id.trim() : "";
  if (id === "") return jsonError("缺少群组 id", 400);

  const patch: Record<string, unknown> = {};
  if (typeof parsed.data.name === "string") {
    const name = parsed.data.name.trim();
    if (name.length < 1 || name.length > 40) return jsonError("群组名称长度需要在 1 ~ 40 个字符之间", 400);
    patch.name = name;
  }
  if (typeof parsed.data.description === "string") {
    const description = parsed.data.description.trim();
    patch.description = description === "" ? null : description;
  }
  if (typeof parsed.data.announcement === "string") {
    const announcement = parsed.data.announcement.trim();
    if (announcement.length > 500) return jsonError("公告最多 500 个字符", 400);
    // 空字符串 = 清除公告
    patch.announcement = announcement === "" ? null : announcement;
    patch.announcement_at = announcement === "" ? null : new Date().toISOString();
    patch.announcement_by_name = announcement === "" ? null : guard.ctx.username || "管理员";
  }
  if (Object.keys(patch).length === 0) return jsonError("没有要修改的内容", 400);

  const { data, error } = await guard.ctx.supabase
    .from("rooms")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") return jsonError("同名群组已经存在", 409);
    return jsonError(mapAdminError(error.message), 400);
  }

  return jsonOk({ ok: true, room: normalizeRoom(data) });
}

/** DELETE /api/admin/rooms?id=xxx → 删除群组（连带删除该群所有消息） */
export async function DELETE(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (id === "") return jsonError("缺少群组 id", 400);

  const { supabase } = guard.ctx;

  // 先看看这个群有多少消息，方便返回给前端提示
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("room_id", id);

  const { error } = await supabase.from("rooms").delete().eq("id", id);
  if (error) return jsonError(mapAdminError(error.message), 400);

  return jsonOk({ ok: true, deletedMessages: count ?? 0 });
}
