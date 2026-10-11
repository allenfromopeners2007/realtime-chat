"use client";

import Link from "next/link";

import { LockIcon, LoginIcon } from "@/components/icons";

/**
 * 未登录访客看到的内容区。
 *
 * 背景：消息表的读策略改成了 `to authenticated`（见 supabase/security-hardening.sql），
 * 所以未登录访客拿到的消息列表一律是空的。这时候**不能**再显示「这里还很安静」——
 * 那会让人以为群里没消息，而不是「你没登录」。
 */
export function LoginRequired({ roomName }: { roomName: string }) {
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto px-6 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-ink-800 bg-ink-900/60 p-6 text-center">
        <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-ink-800 text-ink-300">
          <LockIcon className="h-5 w-5" />
        </div>

        <h2 className="mt-3 text-sm font-semibold text-ink-100">登录后才能查看聊天记录</h2>

        <p className="mt-1.5 text-xs leading-relaxed text-ink-400">
          {roomName ? `「${roomName}」的消息` : "这个聊天室的消息"}只对登录成员开放。
          登录后即可阅读历史消息、搜索记录并参与讨论。
        </p>

        <Link
          href="/login"
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-400"
        >
          <LoginIcon className="h-4 w-4" />
          登录 / 注册
        </Link>

        <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
          No account yet? This chat room is{" "}
          <strong className="font-medium text-ink-400">invite-only</strong> — ask the admin to send
          you an invitation email. Click the link in it, set your password, and you can sign in.
        </p>
      </div>
    </div>
  );
}
