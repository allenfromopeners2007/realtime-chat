"use client";

import Link from "next/link";

import { Avatar } from "@/components/Avatar";
import {
  ChatIcon,
  ChevronDownIcon,
  CloseIcon,
  DotIcon,
  GearIcon,
  LoginIcon,
  LogoutIcon,
  SearchIcon,
  UsersIcon,
} from "@/components/icons";
import { cn } from "@/lib/format";
import type { SessionUser } from "@/lib/types";

export type ConnectionState = "connecting" | "live" | "offline";

type TopBarProps = {
  roomName: string;
  query: string;
  onQueryChange: (value: string) => void;
  connection: ConnectionState;
  user: SessionUser | null;
  onLogout: () => void;
  onToggleDock: () => void;
  dockOpen: boolean;
  /** 管理员才有的入口：打开当前群组的设置面板 */
  onOpenRoomSettings?: () => void;
};

const CONNECTION_TEXT: Record<ConnectionState, string> = {
  connecting: "连接中…",
  live: "实时已连接",
  offline: "离线（15s 轮询）",
};

const CONNECTION_COLOR: Record<ConnectionState, string> = {
  connecting: "text-amber-300",
  live: "text-emerald-400",
  offline: "text-rose-400",
};

export function TopBar({
  roomName,
  query,
  onQueryChange,
  connection,
  user,
  onLogout,
  onToggleDock,
  dockOpen,
  onOpenRoomSettings,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-ink-800/80 bg-ink-950/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/25">
            <ChatIcon className="h-5 w-5" />
          </span>
          <div className="hidden min-w-0 leading-tight sm:block">
            {/* 点群组名 = 打开群组列表（和右下角悬浮按钮同一个面板） */}
            <button
              type="button"
              onClick={onToggleDock}
              title="切换群组"
              className="group/room flex min-w-0 max-w-[14rem] items-center gap-1 rounded-lg text-left transition hover:bg-ink-900"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-1">
                  <span className="truncate text-sm font-semibold text-ink-100">{roomName}</span>
                  <ChevronDownIcon
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 text-ink-500 transition group-hover/room:text-ink-200",
                      dockOpen && "rotate-180 text-ink-300",
                    )}
                  />
                </span>
                {user === null ? (
                  <span className="text-[11px] text-ink-500">未登录 · 仅可浏览群组</span>
                ) : (
                  <span
                    className={cn(
                      "flex items-center gap-1 text-[11px]",
                      CONNECTION_COLOR[connection],
                    )}
                  >
                    <DotIcon className="h-2.5 w-2.5" />
                    {CONNECTION_TEXT[connection]}
                  </span>
                )}
              </span>
            </button>
          </div>
        </div>

        {user?.isAdmin && onOpenRoomSettings && (
          <button
            type="button"
            onClick={onOpenRoomSettings}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-ink-800 bg-ink-900 text-ink-300 transition hover:border-brand-500/40 hover:text-ink-100"
            aria-label="群组设置"
            title="群组设置（改名 / 公告 / 删除）"
          >
            <GearIcon className="h-5 w-5" />
          </button>
        )}

        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            type="search"
            disabled={user === null}
            placeholder={user === null ? "登录后可搜索聊天记录" : "搜索聊天记录…"}
            aria-label="搜索聊天记录"
            className="h-10 w-full rounded-xl border border-ink-800 bg-ink-900 pl-9 pr-9 text-sm text-ink-100 outline-none transition placeholder:text-ink-500 focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          />
          {query !== "" && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-800 hover:text-ink-100"
              aria-label="清空搜索"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleDock}
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition md:hidden",
            dockOpen
              ? "border-brand-500/60 bg-brand-500/15 text-brand-200"
              : "border-ink-800 bg-ink-900 text-ink-300 hover:border-brand-500/40 hover:text-ink-100",
          )}
          aria-label="群组与联系人"
        >
          <UsersIcon className="h-5 w-5" />
        </button>

        {user ? (
          <div className="flex shrink-0 items-center gap-2">
            {user.isAdmin && (
              <Link
                href="/admin"
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-brand-500/40 bg-brand-500/10 px-3 text-xs font-medium text-brand-200 transition hover:border-brand-400 hover:text-white"
                title="管理后台"
              >
                <UsersIcon className="h-4 w-4" />
                <span className="hidden sm:inline">管理</span>
              </Link>
            )}
            <div className="hidden items-center gap-2 rounded-xl border border-ink-800 bg-ink-900 py-1 pl-1 pr-3 sm:flex">
              <Avatar name={user.name} url={user.avatarUrl} size={26} />
              <span className="max-w-[9rem] truncate text-xs text-ink-200">{user.name}</span>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="grid h-10 w-10 place-items-center rounded-xl border border-ink-800 bg-ink-900 text-ink-300 transition hover:border-rose-500/40 hover:text-rose-200"
              aria-label="退出登录"
              title="退出登录"
            >
              <LogoutIcon className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-brand-500 px-3 text-sm font-medium text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-400"
          >
            <LoginIcon className="h-4 w-4" />
            <span className="hidden sm:inline">登录</span>
          </Link>
        )}
      </div>
    </header>
  );
}
