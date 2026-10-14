import type { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { jsonError, jsonOk, readJsonBody } from "@/lib/api-response";
import { INVITE_TTL_DAYS, buildJoinUrl, createInvite } from "@/lib/invite-server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/invite  → 生成一条**站内邀请链接**（仅管理员）
 *
 * body: { email: string, note?: string }
 *
 * 为什么不再用 Supabase 的邮件邀请 ✗：
 *   · 它的链接是【一次性令牌】—— "重发"、链接预览、反垃圾扫描都会把它消耗掉，
 *     同学还没点就失效了 ✓
 *   · 链接域名是 *.supabase.co → 国内被墙，同学根本打不开 ✓
 *
 * 现在改成我们自己的令牌（存在 public.invites，7 天有效，可重复打开 ✓）：
 *   https://<站点>/join?t=<32 位随机令牌>
 *   同学点开 → 看到「继续设置密码」按钮 → **点了才**换取一次性登录链接 ✓
 *   所以预览/扫描都碰不到那一步 ✓✓
 *
 * 安全：requireAdmin（以数据库 profiles.role 为准 ✓）+ 邮箱校验 + 频率限制 + 审计日志
 * 密钥：service_role 只在服务端使用（见 lib/invite-server.ts），绝不下发到浏览器 ✓
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_INVITES_PER_MINUTE = 5;

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

type Body = { email?: unknown; note?: unknown };

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  if (!getSupabaseAdminClient()) {
    return jsonError(
      "还没有配置 SUPABASE_SERVICE_ROLE_KEY —— 请到部署平台的环境变量里加上它" +
        "（只放服务端，不要加 NEXT_PUBLIC_ 前缀），然后重新部署一次",
      503,
    );
  }

  const parsed = await readJsonBody<Body>(request);
  if (!parsed.ok) return parsed.response;

  const email = typeof parsed.data.email === "string" ? parsed.data.email.trim().toLowerCase() : "";
  const note = typeof parsed.data.note === "string" ? parsed.data.note.trim().slice(0, 60) : "";

  if (email === "") return jsonError("请填写邮箱", 400);
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return jsonError("邮箱格式不对，请检查一下", 400);
  }

  if (isRateLimited(guard.ctx.userId)) {
    return jsonError(`生成太频繁了（每分钟最多 ${MAX_INVITES_PER_MINUTE} 条），请等一分钟再试`, 429);
  }

  const created = await createInvite({
    email,
    note: note === "" ? null : note,
    createdBy: guard.ctx.userId,
  });

  if (!created.ok) {
    const message = created.error;
    if (/does not exist|schema cache|relation/i.test(message)) {
      return jsonError(
        `建邀请失败：${message}。看起来还没执行 supabase/invites-migration.sql —— ` +
          "请在 Supabase 的 SQL Editor 里跑一遍那个文件 ✓",
        500,
      );
    }
    if (/invalid api key|jwt|unauthorized|not allowed|forbidden/i.test(message)) {
      return jsonError(
        "密钥不对：SUPABASE_SERVICE_ROLE_KEY 可能填成了 anon key 或被截断了，请更新后重新部署",
        500,
      );
    }
    return jsonError(`建邀请失败：${message}`, 500);
  }

  const inviteLink = buildJoinUrl(request.nextUrl.origin, created.token);
  console.log(
    `[api/admin/invite] 管理员 ${guard.ctx.username} 为 ${email} 生成了邀请链接（${INVITE_TTL_DAYS} 天有效）`,
  );

  return jsonOk({
    email,
    inviteLink,
    linkKind: "join",
    // 不再走 Supabase 的邮件邀请（它的链接国内打不开 ✗）—— 直接发链接更靠谱 ✓
    emailSent: false,
    warnings: [],
  });
}
