import type { NextRequest } from "next/server";

import { isAdminRole } from "@/lib/roles";
import { jsonError, jsonOk, jsonUnauthorized, readJsonBody } from "@/lib/api-response";
import { isSupabaseConfigured } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeRoom } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/rooms → 群组列表（公开可读，悬浮按钮里的「群组」页签用它） */
export async function GET() {
  if (!isSupabaseConfigured) {
    return jsonError("Supabase 还没有配置，请先填写 .env.local", 503);
  }

  try {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      // 次级排序用 name：created_at 可能相同（同一条 INSERT 插入的种子数据），
      // 只按 created_at 排会得到不稳定的顺序 —— 改一行数据就可能导致群组顺序翻转
      .order("created_at", { ascending: true })
      .order("name", { ascending: true })
      .limit(100);

    if (error) return jsonError(`读取群组失败：${error.message}`, 500, { code: error.code });

    return jsonOk({ rooms: (data ?? []).map(normalizeRoom) });
  } catch (error) {
    console.error("[api/rooms] GET 未预期的异常", error);
    return jsonError("服务端异常，请查看终端日志", 500);
  }
}

type PostBody = { name?: unknown; description?: unknown };

/** POST /api/rooms → 新建群组（需要登录） */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured) {
    return jsonError("Supabase 还没有配置，请先填写 .env.local", 503);
  }

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return jsonUnauthorized("请先登录再创建群组");

    const parsed = await readJsonBody<PostBody>(request);
    if (!parsed.ok) return parsed.response;

    // 建群权限收紧了：只有管理员能建（数据库 RLS 也会再拦一次）
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.warn("[api/rooms] 读取角色失败：", profileError.message);
    }
    if (!isAdminRole(profile?.role)) {
      return jsonError("只有管理员可以创建群组", 403);
    }

    const name = typeof parsed.data.name === "string" ? parsed.data.name.trim() : "";
    const description =
      typeof parsed.data.description === "string" ? parsed.data.description.trim() : "";

    if (name.length < 1 || name.length > 40) {
      return jsonError("群组名称长度需要在 1 ~ 40 个字符之间", 400);
    }
    if (description.length > 200) {
      return jsonError("群组简介最多 200 个字符", 400);
    }

    const { data, error } = await supabase
      .from("rooms")
      .insert({ name, description: description === "" ? null : description, created_by: user.id })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") return jsonError("同名群组已经存在了", 409);
      return jsonError(`创建群组失败：${error.message}`, 500, { code: error.code });
    }

    return jsonOk({ room: normalizeRoom(data) }, 201);
  } catch (error) {
    console.error("[api/rooms] POST 未预期的异常", error);
    return jsonError("服务端异常，请查看终端日志", 500);
  }
}
