import type { NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonBody } from "@/lib/api-response";
import { findValidInvite, generateOneTimeLoginLink, markInviteUsed } from "@/lib/invite-server";

export const dynamic = "force-dynamic";

/**
 * POST /api/join  → 用邀请令牌换取一条**一次性**登录链接
 *
 * body: { token: string }
 *
 * 为什么分两步（页面 → 点按钮 → 才换链接）：
 *   如果直接把一次性链接放在邀请链接里，微信/QQ/邮箱的"链接预览"、
 *   反垃圾扫描只要碰一下就会把它消耗掉 ✗ 同学还没点就失效了 ✓
 *   所以我们的 /join 链接是**可重复打开的**，只有"人真的点了按钮"才换一次性链接 ✓
 *
 * 安全：
 *   · 令牌 32 位随机、7 天有效、存在 public.invites（RLS 全拒，浏览器读不到 ✓）
 *   · 这里不需要登录（令牌本身就是凭证 ✓），但做了轻量频率限制 ✓
 *   · 返回的链接本身也是一次性的、立刻会被浏览器用掉 ✓
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** 轻量频率限制：每个令牌每分钟最多换 10 次（防脚本刷） */
const recent = new Map<string, number[]>();
function isRateLimited(token: string): boolean {
  const now = Date.now();
  const hits = (recent.get(token) ?? []).filter((at) => now - at < 60_000);
  if (hits.length >= 10) {
    recent.set(token, hits);
    return true;
  }
  hits.push(now);
  recent.set(token, hits);
  return false;
}

export async function POST(request: NextRequest) {
  const parsed = await readJsonBody<{ token?: unknown }>(request);
  if (!parsed.ok) return parsed.response;

  const token = typeof parsed.data.token === "string" ? parsed.data.token.trim() : "";
  if (token === "" || !/^[a-f0-9]{16,64}$/i.test(token)) {
    return jsonError("邀请链接不完整，请让管理员重新发一条", 400);
  }

  if (isRateLimited(token)) {
    return jsonError("操作太频繁了，请等一分钟再试", 429);
  }

  const invite = await findValidInvite(token);
  if (!invite) {
    return jsonError("这条邀请链接已失效或过期（有效期 7 天），请让管理员重新发一条", 410);
  }

  if (!EMAIL_RE.test(invite.email)) {
    console.error("[api/join] 邀请里的邮箱不合法：", invite.email);
    return jsonError("邀请信息有误，请让管理员重新发一条", 500);
  }

  // 验证通过后走到我们的回调页（它会确保新同学去设置密码 ✓）
  const redirectTo = new URL("/auth/callback", request.nextUrl.origin).toString();
  const generated = await generateOneTimeLoginLink(invite.email, redirectTo);

  if (!generated) {
    return jsonError(
      "生成登录链接失败：请确认部署平台配了 SUPABASE_SERVICE_ROLE_KEY（只放服务端），并看服务端日志",
      500,
    );
  }

  await markInviteUsed(invite);
  console.log(
    `[api/join] 令牌 ${token.slice(0, 8)}… 换取成功：${invite.email}（${generated.kind}，第 ${(invite.used_count ?? 0) + 1} 次）`,
  );

  return jsonOk({ link: generated.link, kind: generated.kind, email: invite.email });
}
