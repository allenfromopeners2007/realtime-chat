import type { NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/lib/api-response";
import { mapAdminError, requireAdmin } from "@/lib/admin";
import { normalizeMessage, type AdminMessage, type Room } from "@/lib/types";

export const dynamic = "force-dynamic";

/** 转义 PostgREST 的 ilike 通配符 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (matched) => `\\${matched}`);
}

/**
 * GET /api/admin/messages?q=关键字&roomId=xxx&authorId=xxx&limit=100
 * 管理员的消息检索：可以按内容、群组、作者过滤。
 */
export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { supabase } = guard.ctx;
  const params = request.nextUrl.searchParams;
  const keyword = (params.get("q") ?? "").trim();
  const roomId = (params.get("roomId") ?? "").trim();
  const authorId = (params.get("authorId") ?? "").trim();
  const rawLimit = Number(params.get("limit") ?? "100");
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 300) : 100;

  let builder = supabase
    .from("messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (roomId !== "") builder = builder.eq("room_id", roomId);
  if (authorId !== "") builder = builder.eq("user_id", authorId);
  if (keyword !== "") builder = builder.ilike("content", `%${escapeLike(keyword)}%`);

  const { data, error } = await builder;
  if (error) return jsonError(`检索消息失败：${error.message}`, 500, { code: error.code });

  // 补上群组名，管理页直接显示更好读
  const { data: roomRows } = await supabase.from("rooms").select("id, name");
  const roomNames = new Map<string, string>(
    ((roomRows ?? []) as Pick<Room, "id" | "name">[]).map((room) => [room.id, room.name]),
  );

  const messages: AdminMessage[] = (data ?? [])
    .map(normalizeMessage)
    .map((message) => ({ ...message, roomName: roomNames.get(message.roomId) ?? "（已删除的群组）" }));

  return jsonOk({ messages });
}

/** DELETE /api/admin/messages?id=xxx → 删除任意一条消息（需要管理员，RLS 会再校验一次） */
export async function DELETE(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (id === "") return jsonError("缺少消息 id", 400);

  const { error } = await guard.ctx.supabase.from("messages").delete().eq("id", id);
  if (error) return jsonError(mapAdminError(error.message), 400);

  return jsonOk({ ok: true });
}
