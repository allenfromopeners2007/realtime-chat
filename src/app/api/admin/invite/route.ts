import type { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { jsonError, jsonOk, readJsonBody } from "@/lib/api-response";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/invite  → 给某个邮箱发邀请（仅管理员）
 *
 * body: { email: string }
 *
 * 为什么这里要用 service_role（全库钥匙）：
 *   Supabase 的"邀请用户"属于**管理员接口**，只有 service_role / sb_secret_ 能调 ✗
 *   没有别的路径能发邀请 ✓
 *
 * 安全措施（四层）：
 *   1. requireAdmin()：登录态 + profiles.role='admin'，**以数据库为准** ✗ 不信前端 ✓
 *   2. 密钥只在服务端 env，且只在这个文件里用 ✓
 *   3. 邮箱格式校验 + 频率限制（每个管理员每分钟最多 5 次）✓
 *   4. 每次邀请都打审计日志（Netlify 的 Functions 日志里能查到是谁邀请了谁）✓
 *
 * 注意：邀请**不会**把 service_role 泄露给前端 —— 返回值里没有任何密钥 ✓
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_INVITES_PER_MINUTE = 5;

/** 简单的内存频率限制（实例级，够挡住误操作和脚本刷） */
const recentInvites = new Map<string, number[]>();

function isRateLimited(adminId: string): boolean {
  const now = Date.now();
  const hits = (recentInvites.get(adminId) ?? []).filter((at) => now - at < 60_000);
  if (hits.length >= MAX_INVITES_PER_MINUTE) {
    recentInvites.set(adminId, hits);
    return true;
  }
  hits.push(now);
  recentInvites.set(adminId, hits);
  return false;
}

type Body = { email?: unknown };

export async function POST(request: NextRequest) {
  // ① 必须是管理员（以数据库的 profiles.role 为准）
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  // ② 必须配了 service_role
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return jsonError(
      "还没有配置 SUPABASE_SERVICE_ROLE_KEY —— 请到部署平台的环境变量里加上它" +
        "（只放服务端，不要加 NEXT_PUBLIC_ 前缀），然后重新部署",
      503,
    );
  }

  const parsed = await readJsonBody<Body>(request);
  if (!parsed.ok) return parsed.response;

  const email =
    typeof parsed.data.email === "string" ? parsed.data.email.trim().toLowerCase() : "";
  if (email === "") return jsonError("请填写邮箱", 400);
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return jsonError("邮箱格式不对，请检查一下", 400);
  }

  // ③ 频率限制
  if (isRateLimited(guard.ctx.userId)) {
    return jsonError(`发送太频繁了（每分钟最多 ${MAX_INVITES_PER_MINUTE} 个），请等一分钟再试`, 429);
  }

  // ④ 发出邀请：点邮件链接 → 走我们的回调换取登录态 → 到 /welcome 设密码
  const redirectTo = new URL("/auth/callback?next=/welcome", request.nextUrl.origin).toString();

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });

  if (error) {
    const message = error.message ?? "";
    console.error("[api/admin/invite] 邀请失败：", message);

    if (/already been registered|already registered|already exists|email address is already/i.test(message)) {
      return jsonError("这个邮箱已经有账号了 —— 让他直接登录即可（忘了密码就在 Supabase 后台重置）", 409);
    }
    if (/rate limit|too many|over_email_send_rate_limit/i.test(message)) {
      return jsonError(
        "邮件发送频率超限了，请等几分钟；长期需要更多就去 Supabase → Authentication → Rate Limits 调高",
        429,
      );
    }
    return jsonError(`邀请失败：${message}`, 500);
  }

  const invitedId = data?.user?.id ?? null;
  console.log(
    `[api/admin/invite] 管理员 ${guard.ctx.username}(${guard.ctx.userId}) 邀请了 ${email} → ${invitedId ?? "已发出"}`,
  );

  return jsonOk({ email, userId: invitedId });
}
