import { jsonOk } from "@/lib/api-response";
import { isSupabaseConfigured } from "@/lib/env";
import { isAdminRole, isOwnerRole } from "@/lib/roles";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { displayNameOf, type SessionUser } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/me → 当前登录用户（未登录时 user 为 null）
 *
 * 除了基本信息，还会带上 isAdmin（读 profiles.role）。
 * 前端在登录状态变化后调这个接口刷新，才能保证「管理」入口的显示是准的。
 */
export async function GET() {
  if (!isSupabaseConfigured) return jsonOk({ user: null, configured: false });

  try {
    const supabase = await getSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return jsonOk({ user: null, configured: true });

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role, username")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      // 还没执行 admin-migration.sql 时会走到这里（role 字段不存在），不影响其它功能
      console.warn("[api/me] 读取角色失败：", error.message);
    }

    const avatar = user.user_metadata?.avatar_url;

    const sessionUser: SessionUser = {
      id: user.id,
      email: user.email ?? null,
      name: (profile?.username as string | undefined) ?? displayNameOf(user),
      avatarUrl: typeof avatar === "string" ? avatar : null,
      isAdmin: isAdminRole(profile?.role),
      isOwner: isOwnerRole(profile?.role),
    };

    return jsonOk({ user: sessionUser, configured: true });
  } catch (error) {
    console.error("[api/me] 未预期的异常", error);
    return jsonOk({ user: null, configured: true });
  }
}
