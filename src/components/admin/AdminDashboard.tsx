"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { FilesTab } from "@/components/admin/FilesTab";
import { InviteTab } from "@/components/admin/InviteTab";
import { MessagesTab } from "@/components/admin/MessagesTab";
import { RoomsTab } from "@/components/admin/RoomsTab";
import { UsersTab } from "@/components/admin/UsersTab";
import { Toast, type ToastState } from "@/components/Toast";
import { ChatIcon, FileIcon, HashIcon, PlusIcon, SearchIcon, UsersIcon } from "@/components/icons";
import { cn } from "@/lib/format";

type Tab = "users" | "invite" | "rooms" | "messages" | "files";

const TABS: Array<{ id: Tab; label: string; hint: string; Icon: typeof UsersIcon }> = [
  { id: "users", label: "用户", hint: "角色 / 禁言 / 改名", Icon: UsersIcon },
  { id: "invite", label: "邀请", hint: "一键发邀请邮件", Icon: PlusIcon },
  { id: "rooms", label: "群组", hint: "新建 / 改名 / 删除", Icon: HashIcon },
  { id: "messages", label: "消息", hint: "检索 / 删除", Icon: SearchIcon },
  { id: "files", label: "附件", hint: "浏览 Storage / 清理", Icon: FileIcon },
];

export function AdminDashboard({ admin }: { admin: { id: string; name: string } }) {
  const [tab, setTab] = useState<Tab>("users");
  const [toast, setToast] = useState<ToastState | null>(null);

  const notify = useCallback((kind: ToastState["kind"], text: string) => {
    setToast({ id: Date.now(), kind, text });
  }, []);

  const dismiss = useCallback(() => setToast(null), []);

  return (
    <div className="min-h-dvh bg-ink-950 pb-16">
      <header className="sticky top-0 z-30 border-b border-ink-800/80 bg-ink-950/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/25">
            <UsersIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="text-sm font-semibold text-ink-100">管理后台</h1>
            <p className="truncate text-[11px] text-ink-500">
              当前管理员：{admin.name || "未命名"} · 所有操作都会被 RLS 再校验一次
            </p>
          </div>
          <Link
            href="/"
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-ink-800 bg-ink-900 px-3 text-xs text-ink-200 transition hover:border-brand-500/50 hover:text-white"
          >
            <ChatIcon className="h-4 w-4" />
            回到聊天室
          </Link>
        </div>

        <nav className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-3 pb-2">
          {TABS.map(({ id, label, hint, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left transition",
                tab === id
                  ? "bg-brand-500/15 text-brand-100 ring-1 ring-brand-500/30"
                  : "text-ink-300 hover:bg-ink-900",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="leading-tight">
                <span className="block text-xs font-medium">{label}</span>
                <span className="block text-[10px] text-ink-500">{hint}</span>
              </span>
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-5">
        {tab === "users" && <UsersTab adminId={admin.id} notify={notify} />}
        {tab === "invite" && <InviteTab notify={notify} />}
        {tab === "rooms" && <RoomsTab notify={notify} />}
        {tab === "messages" && <MessagesTab notify={notify} />}
        {tab === "files" && <FilesTab notify={notify} />}
      </main>

      <Toast state={toast} onDismiss={dismiss} />
    </div>
  );
}
