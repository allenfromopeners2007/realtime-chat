import { jsonError, jsonOk } from "@/lib/api-response";
import { isSupabaseConfigured } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeMember } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/members → 成员列表（公开可读，悬浮按钮里的「联系人」页签用它） */
export async function GET() {
  if (!isSupabaseConfigured) {
    return jsonError("Supabase 还没有配置，请先填写 .env.local", 503);
  }

  try {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return jsonError(`读取成员失败：${error.message}`, 500, { code: error.code });

    return jsonOk({ members: (data ?? []).map(normalizeMember) });
  } catch (error) {
    console.error("[api/members] GET 未预期的异常", error);
    return jsonError("服务端异常，请查看终端日志", 500);
  }
}
