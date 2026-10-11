"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { ChatIcon, SpinnerIcon } from "@/components/icons";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * 新同学的"设置密码"页。
 *
 * 流程：管理员在 /admin 发邀请 → 同学点邮件里的链接 →
 *       /auth/callback 把 code 换成登录态 → 跳到这里 → 设密码 → 回聊天室 ✓
 */
export default function WelcomePage() {
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // 等 supabase-js 从 URL 里把登录态取出来（隐含流程用 #access_token，需要一小会儿）
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setChecking(false);
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();

    async function readSession(attempt: number) {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (data.user) {
        setEmail(data.user.email ?? "");
        setChecking(false);
        return;
      }
      if (attempt >= 6) {
        setChecking(false);
        return;
      }
      window.setTimeout(() => void readSession(attempt + 1), 500);
    }

    void readSession(0);
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("密码至少要 6 位");
      return;
    }
    if (password !== confirm) {
      setError("两次输入的密码不一样");
      return;
    }

    setPending(true);
    const supabase = getSupabaseBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setPending(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
  }

  const inputClass =
    "w-full rounded-xl border border-ink-800 bg-ink-950 px-3 py-2.5 text-sm text-ink-100 outline-none transition placeholder:text-ink-600 focus:border-brand-500/60";

  return (
    <div className="grid min-h-dvh place-items-center bg-ink-950 px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-ink-800 bg-ink-900/70 p-6 shadow-2xl shadow-black/40">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/25">
            <ChatIcon className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold text-ink-100">设置你的密码</h1>
            <p className="text-[11px] text-ink-500">设好之后就能进聊天室了</p>
          </div>
        </div>

        {checking ? (
          <p className="flex items-center gap-2 py-6 text-xs text-ink-400">
            <SpinnerIcon className="h-4 w-4 animate-spin" />
            正在确认邀请链接…
          </p>
        ) : done ? (
          <div className="space-y-4">
            <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-xs leading-relaxed text-emerald-200">
              ✅ 密码设置成功！
              {email ? `（账号：${email}）` : ""}
              下次用「邮箱 + 这个密码」登录就行。
            </p>
            <Link
              href="/"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-2.5 text-sm font-medium text-white transition hover:bg-brand-400"
            >
              进入聊天室
            </Link>
          </div>
        ) : email === null ? (
          <div className="space-y-4">
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-200">
              ⚠️ 这个邀请链接已经失效或过期了。
              请找管理员重新发一次邀请，或者在登录页用「忘记密码」走一遍（如果管理员给你开过）。
            </p>
            <Link
              href="/login"
              className="flex w-full items-center justify-center rounded-xl border border-ink-800 bg-ink-900 py-2.5 text-sm text-ink-200 transition hover:border-brand-500/50"
            >
              去登录页
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="rounded-xl border border-ink-800 bg-ink-950 px-3 py-2 text-[11px] text-ink-400">
              账号：<span className="text-ink-200">{email}</span>
            </p>

            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="新密码（至少 6 位）"
              autoComplete="new-password"
              className={inputClass}
            />
            <input
              type="password"
              required
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="再输一次"
              autoComplete="new-password"
              className={inputClass}
            />

            {error && (
              <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-2.5 text-sm font-medium text-white transition hover:bg-brand-400 disabled:opacity-60"
            >
              {pending && <SpinnerIcon className="h-4 w-4 animate-spin" />}
              保存密码
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
