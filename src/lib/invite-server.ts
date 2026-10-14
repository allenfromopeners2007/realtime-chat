import { SUPABASE_URL } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * 站内邀请的**服务端**逻辑 —— 只允许服务端代码 import 本文件 ⚠️
 *
 * （没有用 `server-only` 包，因为项目依赖里没有它；靠这条约定 + 下面的注释守规矩 ✓）
 *
 * 令牌存在 public.invites 里（RLS 全拒 ✓ 浏览器读不到 ✓），
 * 所以这里的每一步都必须用 service_role 客户端 ✓
 */

export type InviteRow = {
  id: string;
  token: string;
  email: string;
  note: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_count: number;
};

/** 邀请有效期（天） */
export const INVITE_TTL_DAYS = 7;

/** 生成 32 位随机令牌（URL 安全 ✓ 猜不出来 ✓） */
export function createInviteToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

/** 把令牌拼成给同学打开的链接（用我们自己的域名 ✓ 国内可达 ✓） */
export function buildJoinUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/join?t=${token}`;
}

/**
 * 把 Supabase 生成的 action_link 换成本浏览器可达的域名
 * （它默认指向 *.supabase.co ✗ 国内打不开 ✓）
 */
export function toBrowserReachable(url: string): string {
  const server = process.env.SUPABASE_URL_SERVER ?? "";
  if (server !== "" && SUPABASE_URL !== "" && SUPABASE_URL !== server) {
    return url.split(server).join(SUPABASE_URL);
  }
  return url;
}

/**
 * 为某个邮箱换取一条【一次性】的 Supabase 登录链接（点开即建立会话）。
 *
 * 依次尝试三种类型，覆盖"新同学 / 已有账号 / 兜底"三种情况：
 *   invite    —— 账号不存在时创建并生成接受邀请的链接
 *   recovery  —— 已有账号：改密码
 *   magiclink —— 兜底：一次性登录
 *
 * ⚠️ 因为它是一次性的，只能在同学**点击按钮的那一刻**生成并立刻跳转 ✓
 *   （这样链接预览、反垃圾扫描都碰不到它 ✓）
 */
export async function generateOneTimeLoginLink(
  email: string,
  redirectTo: string,
): Promise<{ link: string; kind: string } | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;

  for (const kind of ["invite", "recovery", "magiclink"] as const) {
    try {
      const { data, error } = await admin.auth.admin.generateLink({
        type: kind,
        email,
        options: { redirectTo },
      });
      const raw = data?.properties?.action_link ?? null;
      if (!error && raw) return { link: toBrowserReachable(raw), kind };
      if (error) console.warn(`[invite] generateLink(${kind}) 失败：`, error.message);
    } catch (caught) {
      console.warn(`[invite] generateLink(${kind}) 异常：`, caught);
    }
  }
  return null;
}

/** 新建一条邀请，返回令牌 */
export async function createInvite(options: {
  email: string;
  note?: string | null;
  createdBy: string | null;
}): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, error: "missing-service-key" };

  const token = createInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await admin.from("invites").insert({
    token,
    email: options.email.trim().toLowerCase(),
    note: options.note?.trim() || null,
    created_by: options.createdBy,
    expires_at: expiresAt,
  });

  if (error) {
    console.error("[invite] 建邀请失败：", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, token };
}

/** 按令牌查一条**仍然有效**的邀请（过期/不存在的都返回 null） */
export async function findValidInvite(token: string): Promise<InviteRow | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;

  const clean = token.trim();
  if (clean === "" || clean.length > 64) return null;

  const { data, error } = await admin
    .from("invites")
    .select("id, token, email, note, created_at, expires_at, used_at, used_count")
    .eq("token", clean)
    .maybeSingle();

  if (error) {
    console.error("[invite] 查询邀请失败：", error.message);
    return null;
  }
  if (!data) return null;

  const row = data as InviteRow;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

/** 记录一次使用（允许重复使用，只做统计与时间记录 ✓） */
export async function markInviteUsed(invite: InviteRow): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) return;

  await admin
    .from("invites")
    .update({ used_at: new Date().toISOString(), used_count: (invite.used_count ?? 0) + 1 })
    .eq("id", invite.id);
}
