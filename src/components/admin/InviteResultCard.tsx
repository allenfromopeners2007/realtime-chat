"use client";

import { useRef, useState } from "react";

import { Card } from "@/components/admin/ui";
import { CheckIcon } from "@/components/icons";

export type InviteResult = {
  email: string;
  inviteLink: string | null;
  linkKind: string | null;
  emailSent: boolean;
  warnings: string[];
};

/**
 * 邀请结果卡片：邮件状态 + 可复制的邀请链接。
 *
 * 「邀请」页签和「用户」页签的"重发邀请"都用它 ✓
 * 复制失败时（浏览器禁止写剪贴板，比如内置浏览器）自动全选，让用户按 Ctrl+C ✓
 */
export function InviteResultCard({
  result,
  notify,
  title,
}: {
  result: InviteResult;
  notify: (kind: "success" | "error" | "info", text: string) => void;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLTextAreaElement>(null);

  async function copyLink() {
    const link = result.inviteLink;
    if (!link) return;

    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      notify("success", "链接已复制 ✓ 粘到微信里发给同学就行");
      window.setTimeout(() => setCopied(false), 4000);
    } catch {
      linkRef.current?.focus();
      linkRef.current?.select();
      notify("info", "浏览器不允许自动复制 —— 已帮你全选，按 Ctrl+C 即可");
    }
  }

  return (
    <Card
      title={title ?? `邀请结果：${result.email}`}
      subtitle={
        result.emailSent
          ? "邮件已发出 ✓ 同时也可以用下面的链接"
          : "邮件没能发出 ✗ 请用下面的链接（效果一样）"
      }
    >
      <div className="space-y-3">
        {result.warnings.length > 0 && (
          <ul className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
            {result.warnings.map((text) => (
              <li key={text}>⚠️ {text}</li>
            ))}
          </ul>
        )}

        {result.inviteLink ? (
          <>
            <textarea
              ref={linkRef}
              readOnly
              value={result.inviteLink}
              rows={3}
              onFocus={(event) => event.currentTarget.select()}
              className="w-full resize-none rounded-xl border border-ink-800 bg-ink-950 px-3 py-2 text-[11px] leading-relaxed text-ink-300 outline-none focus:border-brand-500/60"
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void copyLink()}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-500 px-3 text-xs font-medium text-white transition hover:bg-brand-400"
              >
                {copied ? <CheckIcon className="h-4 w-4" /> : null}
                {copied ? "已复制 ✓" : "复制邀请链接"}
              </button>
              <span className="text-[11px] text-ink-500">
                复制后发到微信/QQ 里给同学 —— 他点开就能设置密码 ✓
              </span>
            </div>
          </>
        ) : (
          <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
            链接没生成成功 ✗ —— 请看服务端日志（Netlify → Functions / Supabase → Logs）
          </p>
        )}

        <p className="text-[11px] leading-relaxed text-ink-500">
          🔒 这条链接是<strong className="text-ink-400">一次性的</strong>，别发到公开群里；
          同学设置完密码后，以后用「邮箱 + 密码」登录即可 ✓
        </p>
      </div>
    </Card>
  );
}
