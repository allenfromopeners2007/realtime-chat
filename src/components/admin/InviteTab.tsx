"use client";

import { useState, type FormEvent } from "react";

import { InviteResultCard, type InviteResult } from "@/components/admin/InviteResultCard";
import { Card, ErrorBox } from "@/components/admin/ui";
import { SpinnerIcon } from "@/components/icons";
import { apiFetch, describeApiError } from "@/lib/http";

type Props = {
  notify: (kind: "success" | "error" | "info", text: string) => void;
};

/**
 * 「邀请」页签：输入邮箱 → 发邀请邮件 + 生成一条可直接复制的邀请链接。
 *
 * 详见 /api/admin/invite：那个接口用 service_role（只在服务端）调 Supabase 的管理员接口，
 * 既发邮件，也返回一条链接 —— 邮件不通时用微信发链接一样能加人 ✓
 */
export function InviteTab({ notify }: Props) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResult | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = email.trim();
    if (target === "" || pending) return;

    setPending(true);
    setError(null);

    try {
      const data = await apiFetch<InviteResult>("/api/admin/invite", {
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
            <br />
            之前邀请过但<strong className="text-ink-400">没能登录的人</strong>：把他的邮箱再输一次即可重新生成链接 ✓
            （会自动改用"改密码"类型的链接 ✓ 也可以在「用户」页签点那一行的「重发邀请」✓）
          </p>
        </form>
      </Card>

      {error && <ErrorBox message={error} />}

      {result && <InviteResultCard result={result} notify={notify} />}
    </div>
  );
}
