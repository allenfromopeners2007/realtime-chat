import Link from "next/link";

import { ChatIcon } from "@/components/icons";
import { JoinButton } from "@/components/JoinButton";
import { findValidInvite } from "@/lib/invite-server";

export const dynamic = "force-dynamic";

/**
 * /join?t=<令牌>  → 同学点开邀请链接看到的页面
 *
 * 服务端先校验令牌（用 service_role，浏览器拿不到这张表 ✓），
 * 有效才显示「继续设置密码」按钮 ✓ 无效则给出明确的补救提示 ✓
 *
 * ⚠️ 这个页面本身是**可重复打开**的（刷新、预览、扫描都不会消耗令牌 ✓）
 *    真正的一次性链接在点按钮后才生成 ✓
 */
export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const params = await searchParams;
  const token = (params.t ?? "").trim();
  const invite = token === "" ? null : await findValidInvite(token);

  return (
    <div className="grid min-h-dvh place-items-center bg-ink-950 px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-ink-800 bg-ink-900/70 p-6 shadow-2xl shadow-black/40">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/25">
            <ChatIcon className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold text-ink-100">
              {invite ? "你被邀请加入聊天室" : "邀请链接无效"}
            </h1>
            <p className="text-[11px] text-ink-500">
              {invite ? "下一步：设置一个属于你自己的密码" : "请让管理员重新发一条"}
            </p>
          </div>
        </div>

        {invite ? <JoinButton token={token} email={invite.email} /> : <InvalidState hasToken={token !== ""} />}
      </div>
    </div>
  );
}

function InvalidState({ hasToken }: { hasToken: boolean }) {
  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-200">
        ⚠️{" "}
        {hasToken
          ? "这条邀请链接已经失效了（有效期 7 天，或者被管理员删除了）。"
          : "这个地址缺少邀请参数，可能是链接被截断或复制不完整。"}
        <br />
        请让管理员在网站后台重新发一条给你 ✓
      </p>
      <Link
        href="/login"
        className="flex w-full items-center justify-center rounded-xl border border-ink-800 bg-ink-900 py-2.5 text-sm text-ink-200 transition hover:border-brand-500/50"
      >
        去登录页
      </Link>
    </div>
  );
}
