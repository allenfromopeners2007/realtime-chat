"use client";

import { useState } from "react";

import { SpinnerIcon } from "@/components/icons";
import { apiFetch, describeApiError } from "@/lib/http";

/**
 * 「继续设置密码」按钮 —— 只有**人真的点了**才会去换取一次性登录链接 ✓
 *
 * 这样做的好处：微信/QQ/邮箱的链接预览、反垃圾扫描都不会误触发 ✗
 * （它们不会点按钮 ✓）所以邀请链接可以放心地重复打开 ✓
 */
export function JoinButton({ token, email }: { token: string; email: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setPending(true);
    setError(null);

    try {
      const data = await apiFetch<{ link: string }>("/api/join", {
        method: "POST",
        body: JSON.stringify({ token }),
        context: "换取登录链接",
      });
      // 整页跳转到 Supabase 的一次性链接 → 验证后回到 /auth/callback → 设置密码 ✓
      window.location.href = data.link;
    } catch (caught) {
      setError(describeApiError(caught));
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void go()}
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-sm font-medium text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending && <SpinnerIcon className="h-4 w-4 animate-spin" />}
        {pending ? "正在准备…" : "继续设置密码"}
      </button>

      <p className="text-center text-[11px] leading-relaxed text-ink-500">
        将用 <span className="text-ink-300">{email}</span> 这个账号进入下一步
        <br />
        （点按钮后浏览器会跳转两次，属于正常现象 ✓）
      </p>

      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] leading-relaxed text-rose-200">
          {error}
        </p>
      )}
    </div>
  );
}
