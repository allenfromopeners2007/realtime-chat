"use client";

import { useRef, useState, type FormEvent } from "react";

import { Card, ErrorBox } from "@/components/admin/ui";
import { CheckIcon, SpinnerIcon } from "@/components/icons";
import { apiFetch, describeApiError } from "@/lib/http";

type Props = {
  notify: (kind: "success" | "error" | "info", text: string) => void;
};

type Result = {
  email: string;
  inviteLink: string | null;
  linkKind: string | null;
  emailSent: boolean;
  warnings: string[];
};

/**
 * 「邀请」页签：输入邮箱 → 发邀请邮件 + 生成一条可直接复制的邀请链接。
 *
 * 为什么要两条路：
 *   邮件可能被过滤、延迟、进垃圾箱 ✗ 而同学本来就在微信/QQ 群里 ✓
 *   所以邮件照发（能收到最省事）＋ 同时给一条链接，管理员复制后直接发给他 ✓
 *   两条路都通向同一个页面：/welcome（设置密码）✓
 *
 * 背后是 POST /api/admin/invite —— 那个接口用 service_role 调 Supabase 的管理员接口
 *（密钥只在服务端，前端拿不到 ✓）。
 */
export function InviteTab({ notify }: Props) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLTextAreaElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = email.trim();
    if (target === "" || pending) return;

    setPending(true);
    setError(null);
    setCopied(false);

    try {
      const data = await apiFetch<Result>("/api/admin/invite", {
        method: "POST",
        body: JSON.stringify({ email: target }),
        context: "发送邀请",
      });
      setResult(data);
      setEmail("");

      if (data.inviteLink) {
        notify(
          data.emailSent ? "success" : "info",
          data.emailSent
            ? `邀请邮件已发给 ${target} ✓ 下面还有一条链接可以直接发给他`
            : `邮件没发出去，但下面这条链接可以直接发给 ${target} ✓`,
        );
      } else {
        notify("error", "邮件和链接都没成功，请看页面提示");
      }
    } catch (caught) {
      const message = describeApiError(caught);
      setError(message);
      notify("error", message);
    } finally {
      setPending(false);
    }
  }

  /** 复制链接；浏览器禁止写剪贴板时（比如内置浏览器）退化为"自动全选"让用户 Ctrl+C */
  async function copyLink() {
    const link = result?.inviteLink;
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

  const inputClass =
    "flex-1 rounded-xl border border-ink-800 bg-ink-950 px-3 py-2 text-sm text-ink-100 outline-none transition placeholder:text-ink-600 focus:border-brand-500/60";

  return (
    <div className="space-y-4">
      <Card
        title="邀请同学加入"
        subtitle="输入他的邮箱 → 会发邀请邮件，同时给你一条可直接复制的链接（微信发给他更稳）"
      >
        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="同学的邮箱，例如 classmate@qq.com"
              className={inputClass}
              disabled={pending}
            />
            <button
              type="submit"
              disabled={pending || email.trim() === ""}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending && <SpinnerIcon className="h-4 w-4 animate-spin" />}
              {pending ? "处理中…" : "发送邀请"}
            </button>
          </div>

          <p className="text-[11px] leading-relaxed text-ink-500">
            本聊天室是<strong className="text-ink-400">邀请制</strong>：自助注册已关闭，这里是加人的唯一入口 ✓
            <br />
            同学收到后：点链接 → 设置密码 → 就能登录 ✓
            建议提醒他翻一下「垃圾邮件 / 其他文件夹」；一次别发太多（每分钟最多 5 个）。
          </p>
        </form>
      </Card>

      {error && <ErrorBox message={error} />}

      {result && (
        <Card
          title={`邀请结果：${result.email}`}
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
                链接也没生成成功 ✗ —— 请看服务端日志（Netlify → Functions / Supabase → Logs）
              </p>
            )}

            <p className="text-[11px] leading-relaxed text-ink-500">
              🔒 这条链接是<strong className="text-ink-400">一次性的</strong>，别发到公开群里；
              同学设置完密码后，以后用「邮箱 + 密码」登录即可 ✓
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
