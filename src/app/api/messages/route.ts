import type { NextRequest } from "next/server";

import { isAdminRole } from "@/lib/roles";
import { jsonError, jsonOk, jsonUnauthorized, readJsonBody } from "@/lib/api-response";
import { isSupabaseConfigured, MAX_MESSAGE_LENGTH, STORAGE_BUCKET } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  displayNameOf,
  normalizeAttachment,
  normalizeMessage,
} from "@/lib/types";

export const dynamic = "force-dynamic";

/** 转义 PostgREST 的 ilike 通配符，避免用户输入 % 把整表查出来 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (matched) => `\\${matched}`);
}

/**
 * GET /api/messages?roomId=xxx&q=关键字&limit=100
 * 公开可读：未登录也能看历史消息；q 非空时按内容模糊搜索。
 */
export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured) {
    return jsonError("Supabase 还没有配置，请先填写 .env.local", 503);
  }

  try {
    const supabase = await getSupabaseServerClient();
    const params = request.nextUrl.searchParams;
    const roomId = (params.get("roomId") ?? "").trim();
    const keyword = (params.get("q") ?? "").trim();
    const rawLimit = Number(params.get("limit") ?? "100");
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200)
      : 100;

    let builder = supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (roomId !== "") builder = builder.eq("room_id", roomId);
    if (keyword !== "") builder = builder.ilike("content", `%${escapeLike(keyword)}%`);

    const { data, error } = await builder;

    if (error) {
      return jsonError(`读取消息失败：${error.message}`, 500, { code: error.code });
    }

    // 查询时按时间倒序取最近 N 条，返回前翻回升序，前端直接 append 即可
    const messages = (data ?? []).map(normalizeMessage).reverse();
    return jsonOk({ messages });
  } catch (error) {
    console.error("[api/messages] GET 未预期的异常", error);
    return jsonError("服务端异常，请查看终端日志", 500);
  }
}

type PostBody = {
  roomId?: unknown;
  content?: unknown;
  attachment?: unknown;
};

/**
 * POST /api/messages
 * 必须登录才能发言；attachment 由 /api/upload 先上传后回填。
 */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured) {
    return jsonError("Supabase 还没有配置，请先填写 .env.local", 503);
  }

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return jsonUnauthorized("请先登录再发言");

    const parsed = await readJsonBody<PostBody>(request);
    if (!parsed.ok) return parsed.response;

    const roomId = typeof parsed.data.roomId === "string" ? parsed.data.roomId.trim() : "";
    const content = typeof parsed.data.content === "string" ? parsed.data.content.trim() : "";
    const attachment = normalizeAttachment(parsed.data.attachment);

    if (roomId === "") return jsonError("缺少 roomId", 400);
    if (content === "" && attachment === null) return jsonError("消息内容不能为空", 400);
    if (content.length > MAX_MESSAGE_LENGTH) {
      return jsonError(`消息太长了，最多 ${MAX_MESSAGE_LENGTH} 个字符`, 413);
    }

    // 用户名优先取 profiles 表；如果注册触发器没装上，就用用户元数据兜底并补一条档案
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, avatar_url, is_banned")
      .eq("id", user.id)
      .maybeSingle();

    // 被管理员禁言的用户不能发言（数据库 RLS 也会拦一次，这里是为了给出人话提示）
    if (profile?.is_banned === true) {
      return jsonError("你已被管理员禁言，暂时无法发言", 403);
    }

    const authorName = (profile?.username as string | undefined) ?? displayNameOf(user);
    const authorAvatar = (profile?.avatar_url as string | undefined) ?? null;

    if (!profile) {
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({ id: user.id, username: authorName }, { onConflict: "id" });
      if (profileError) {
        console.warn("[api/messages] 自动补建 profile 失败（不阻断发送）", profileError.message);
      }
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({
        room_id: roomId,
        user_id: user.id,
        author_name: authorName,
        author_avatar: authorAvatar,
        content,
        attachment,
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23503") {
        return jsonError("群组不存在，请重新选择群组", 400);
      }
      // 数据库层的限流触发器（security-hardening.sql）抛出的异常
      if (/发言太快/.test(error.message)) {
        return jsonError("发言太快了，请等几秒再发（每 10 秒最多 5 条）", 429);
      }
      return jsonError(`发送失败：${error.message}`, 500, { code: error.code });
    }

    return jsonOk({ message: normalizeMessage(data) }, 201);
  } catch (error) {
    console.error("[api/messages] POST 未预期的异常", error);
    return jsonError("服务端异常，请查看终端日志", 500);
  }
}

/**
 * DELETE /api/messages?id=xxx
 *
 * 权限：消息作者本人 或 管理员（数据库 RLS 会再校验一次，前端绕不过）。
 * 附带效果：如果这条消息带附件，会顺手把 Storage 里的文件也删掉（失败不影响消息删除）。
 */
export async function DELETE(request: NextRequest) {
  if (!isSupabaseConfigured) {
    return jsonError("Supabase 还没有配置，请先填写 .env.local", 503);
  }

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return jsonUnauthorized("请先登录");

    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (id === "") return jsonError("缺少消息 id", 400);

    // 先读出这条消息：用来判权限 + 拿附件路径
    const { data: message, error: readError } = await supabase
      .from("messages")
      .select("id, user_id, attachment")
      .eq("id", id)
      .maybeSingle();

    if (readError) return jsonError(`读取消息失败：${readError.message}`, 500);
    if (!message) return jsonError("消息不存在，可能已经被删除了", 404);

    let allowed = message.user_id === user.id;
    if (!allowed) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) {
        console.warn("[api/messages] 读取角色失败：", profileError.message);
      }
      allowed = isAdminRole(profile?.role);
    }

    if (!allowed) return jsonError("只能删除自己发的消息", 403);

    const { error: deleteError } = await supabase.from("messages").delete().eq("id", id);
    if (deleteError) {
      if (/row-level security|permission/i.test(deleteError.message)) {
        return jsonError("没有删除权限", 403);
      }
      return jsonError(`删除失败：${deleteError.message}`, 400);
    }

    // 顺手清理附件（best-effort：删不掉只记日志，不影响消息已删除的事实）
    const attachment = normalizeAttachment(message.attachment);
    if (attachment && attachment.path !== "") {
      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([attachment.path]);
      if (storageError) {
        console.warn(
          "[api/messages] 消息已删除，但附件清理失败（可到管理后台的「附件」页手动删）：",
          storageError.message,
        );
      }
    }

    return jsonOk({ ok: true });
  } catch (error) {
    console.error("[api/messages] DELETE 未预期的异常", error);
    return jsonError("服务端异常，请查看终端日志", 500);
  }
}
