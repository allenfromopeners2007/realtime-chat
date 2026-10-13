import type { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { jsonError, jsonOk, readJsonBody } from "@/lib/api-response";
import { SUPABASE_URL, SUPABASE_URL_SERVER } from "@/lib/env";
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

  // ④ 发出邀请：点邮件链接 → /auth/callback（客户端页面，能读到 #片段 里的令牌）
  //    → 它会自动把新同学送到 /welcome 设置密码 ✓
  //    这里不带查询参数，避免 Supabase 跳转白名单匹配不上 ✓
  const redirectTo = new URL("/auth/callback", request.nextUrl.origin).toString();

  // ⑤ 生成"可以直接复制的邀请链接"（不依赖邮件送达 ✓）
  //
  // 为什么邮件和链接都做：
  //   邮件可能被过滤/延迟/进垃圾箱 ✗ 而同学本来就在微信/QQ 群里 ✓
  //   所以：邮件照发（能收到最省事）＋ 同时给一条链接，管理员复制后直接发给他 ✓
  //
  // 三种类型依次尝试（对"之前邀请过、卡在设密码"的人特别有用 ✓）：
  //   invite    —— 还没确认的新用户：接受邀请 + 设密码
  //   recovery  —— 已经有账号的人：改密码（也正是卡住的人需要的 ✓）
  //   magiclink —— 兜底：一次性登录链接，同样会落到 /welcome 让他设密码 ✓
  //
  // ⚠️ 关键：Supabase 生成的 action_link 指向它自己的域名
  //     https://lvntlhgpalgbgrsloxyy.supabase.co/auth/v1/verify?...
  //     而这个域名【在国内是被墙的】✗✗ 同学点开根本打不开 ✓
  //     → 所以必须把域名换成我们自己的、国内可达的反向代理（sb.theopener.top）✓
  //     浏览器 ⇒ Worker ⇒ Supabase，验证通过后 Worker 会把跳转原样带回来 ✓
  function toBrowserReachable(url: string): string {
    if (SUPABASE_URL_SERVER !== "" && SUPABASE_URL !== "" && SUPABASE_URL !== SUPABASE_URL_SERVER) {
      return url.split(SUPABASE_URL_SERVER).join(SUPABASE_URL);
    }
    return url;
  }

  async function makeLink(): Promise<{ link: string; kind: string } | null> {
    const client = admin;
    if (!client) return null;

    for (const kind of ["invite", "recovery", "magiclink"] as const) {
      try {
        const { data: generated, error: genError } = await client.auth.admin.generateLink({
          type: kind,
          email,
          options: { redirectTo },
        });
        const raw = generated?.properties?.action_link ?? null;
        if (!genError && raw) return { link: toBrowserReachable(raw), kind };
        if (genError) console.warn(`[api/admin/invite] generateLink(${kind}) 失败：`, genError.message);
      } catch (caught) {
        console.warn(`[api/admin/invite] generateLink(${kind}) 异常：`, caught);
      }
    }
    return null;
  }

  // 先发邀请邮件（会创建账号）；失败时不再直接返回，而是继续尝试生成链接 ——
  // 因为"邮件发不出去"和"账号建不了"是两件事 ✓
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });

  const alreadyExists = Boolean(
    error && /already been registered|already registered|already exists|email address is already/i.test(error.message ?? ""),
  );
  const rateLimited = Boolean(error && /rate limit|too many|over_email_send_rate_limit/i.test(error.message ?? ""));
  const keyBroken = Boolean(
    error && /invalid api key|invalid jwt|jwt|unauthorized|not allowed|missing sub|forbidden|bad_jwt/i.test(error.message ?? ""),
  );

  if (error && !alreadyExists && !rateLimited) {
    console.error("[api/admin/invite] 邀请失败：", error.message);
  }

  // 密钥本身不对时，生成链接也一定会失败 —— 直接给明确提示，别让用户猜
  if (keyBroken) {
    return jsonError(
      "密钥不对：SUPABASE_SERVICE_ROLE_KEY 可能填成了 anon/publishable key，或者复制时被截断了。" +
        "请回到 Supabase → Settings → API Keys，复制 service_role / sb_secret_ 那一串（不是 anon），" +
        "更新变量后重新部署一次",
      500,
    );
  }

  // ⑤ 生成可复制的链接（邮件失败也没关系 ✓）
  const generated = await makeLink();

  const invitedId = data?.user?.id ?? null;
  console.log(
    `[api/admin/invite] 管理员 ${guard.ctx.username}(${guard.ctx.userId}) 处理了 ${email}` +
      ` → 用户 ${invitedId ?? "?"}；邮件 ${error ? `失败(${error.message})` : "已发出"}；` +
      `链接 ${generated ? generated.kind : "未生成"}`,
  );

  // 邮件成功 + 有链接 → 两种方式都给管理员 ✓
  // 邮件失败/被过滤 → 至少还有链接可用，不算彻底失败 ✓
  const warnings: string[] = [];
  if (alreadyExists) warnings.push("这个邮箱已经有账号了（下面这条链接会让他直接登录并设置密码）");
  else if (rateLimited) warnings.push("邮件发送频率超限，暂时没发出邮件 —— 下面这条链接可以直接发给他");
  else if (error) warnings.push(`邮件没发出去（${error.message}）—— 用下面这条链接代替`);
  if (!generated) warnings.push("链接也生成失败了，请看服务端日志");

  return jsonOk({
    email,
    userId: invitedId,
    inviteLink: generated?.link ?? null,
    linkKind: generated?.kind ?? null,
    emailSent: !error,
    warnings,
  });
}
