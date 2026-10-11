"use client";

import { useState, type FormEvent } from "react";

import { Card, ErrorBox } from "@/components/admin/ui";
import { SpinnerIcon } from "@/components/icons";
import { apiFetch, describeApiError } from "@/lib/http";

type Props = {
  notify: (kind: "success" | "error" | "info", text: string) => void;
};

type Invited = { email: string; at: number };

/**
 * 「邀请」页签：管理员输入邮箱 → 一键发邀请。
 *
 * 背后是 POST /api/admin/invite —— 那个接口用 service_role 调 Supabase 的管理员接口
 * 发出邀请邮件（密钥只在服务端，前端拿不到 ✓）。
 * 同学点邮件里的链接 → 设置密码 → 就能登录了 ✓
 */
export function InviteTab({ notify }: Props) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invited, setInvited] = useState<Invited[]>([]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = email.trim();
    if (target === "" || pending) return;

    setPending(true);
    setError(null);
    try {
      await apiFetch<{ email: string }>("/api/admin/invite", {
        method: "POST",
        body: JSON.stringify({ email: target }),
        context: "发送邀请",
      });
      setInvited((prev) => [{ email: target, at: Date.now() }, ...prev].slice(0, 20));
      setEmail("");
      notify("success", `邀请邮件已发给 ${target} ✓ 提醒他翻一下垃圾邮件箱`);
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
        subtitle="输入他的邮箱 → 他会收到一封邀请邮件 → 点链接设置密码 → 就能登录了"
      >
        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="同学的邮箱，例如 classmate@example.com"
              className={inputClass}
              disabled={pending}
            />
            <button
              type="submit"
              disabled={pending || email.trim() === ""}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending && <SpinnerIcon className="h-4 w-4 animate-spin" />}
              {pending ? "发送中…" : "发送邀请"}
            </button>
          </div>

          <p className="text-[11px] leading-relaxed text-ink-500">
            本聊天室是<strong className="text-ink-400">邀请制</strong>：自助注册已关闭，
            所以这里是加人的唯一入口 ✓
            <br />
            ⚠️ 邀请邮件从 163 邮箱发出，让同学翻一下「垃圾邮件 / 其他文件夹」；
            建议一次别发太多（每分钟最多 5 个，否则会触发邮件频率限制）。
          </p>
        </form>
      </Card>

      {error && <ErrorBox message={error} />}

      {invited.length > 0 && (
        <Card title="本次已邀请" subtitle="刷新页面后这个列表会清空（只是给你个确认）">
          <ul className="divide-y divide-ink-800/70 text-xs">
            {invited.map((item) => (
              <li key={`${item.email}-${item.at}`} className="flex items-center justify-between py-2">
                <span className="text-ink-200">{item.email}</span>
                <span className="text-emerald-300">已发送 ✓</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
