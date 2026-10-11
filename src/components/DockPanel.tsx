"use client";

import { useState } from "react";

import { Avatar } from "@/components/Avatar";
import { CloseIcon, HashIcon, PhoneIcon, PlusIcon, SpinnerIcon, UsersIcon } from "@/components/icons";
import { cn } from "@/lib/format";
import type { Member, Room, SessionUser } from "@/lib/types";

type Props = {
  open: boolean;
  onToggle: () => void;
  rooms: Room[];
  members: Member[];
  activeRoomId: string;
  onSelectRoom: (roomId: string) => void;
  onCreateRoom: (name: string) => Promise<boolean>;
  canCreateRoom: boolean;
  user: SessionUser | null;
  /** 语音通话：点成员后面的 📞 呼叫 */
  onCall?: (member: Member) => void;
  /** 自己正在通话/呼叫中时，呼叫按钮禁用 */
  callBusy?: boolean;
};

type Tab = "rooms" | "members";

/** 右下角悬浮的「群组 / 联系人」按钮 + 弹出面板 */
export function DockPanel({
  open,
  onToggle,
  rooms,
  members,
  activeRoomId,
  onSelectRoom,
  onCreateRoom,
  canCreateRoom,
  user,
  onCall,
  callBusy = false,
}: Props) {
  const [tab, setTab] = useState<Tab>("rooms");
  const [creating, setCreating] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitNewRoom() {
    const name = newRoomName.trim();
    if (name === "" || submitting) return;
    setSubmitting(true);
    const ok = await onCreateRoom(name);
    setSubmitting(false);
    if (ok) {
      setNewRoomName("");
      setCreating(false);
    }
  }

  return (
    <div className="fixed bottom-28 right-4 z-40 flex flex-col items-end sm:right-6">
      {open && (
        <div className="animate-pop-in mb-3 w-[19rem] overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/98 shadow-2xl shadow-black/50 backdrop-blur">
          <div className="flex items-center justify-between gap-2 border-b border-ink-800 px-3 py-2.5">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setTab("rooms")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs transition",
                  tab === "rooms"
                    ? "bg-brand-500/20 text-brand-200"
                    : "text-ink-400 hover:bg-ink-800 hover:text-ink-100",
                )}
              >
                群组{rooms.length > 0 ? ` (${rooms.length})` : ""}
              </button>
              <button
                type="button"
                onClick={() => setTab("members")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs transition",
                  tab === "members"
                    ? "bg-brand-500/20 text-brand-200"
                    : "text-ink-400 hover:bg-ink-800 hover:text-ink-100",
                )}
              >
                联系人{members.length > 0 ? ` (${members.length})` : ""}
              </button>
            </div>
            <button
              type="button"
              onClick={onToggle}
              className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-800 hover:text-ink-100"
              aria-label="关闭面板"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="scrollbar-thin max-h-[55vh] overflow-y-auto p-2">
            {tab === "rooms" ? (
              rooms.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-ink-500">
                  还没有群组，先创建一个吧。
                </p>
              ) : (
                <ul className="space-y-1">
                  {rooms.map((room) => (
                    <li key={room.id}>
                      <button
                        type="button"
                        onClick={() => onSelectRoom(room.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition",
                          room.id === activeRoomId
                            ? "bg-brand-500/15 text-brand-100 ring-1 ring-brand-500/30"
                            : "text-ink-200 hover:bg-ink-800",
                        )}
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink-800 text-ink-300">
                          <HashIcon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{room.name}</span>
                          {room.description && (
                            <span className="block truncate text-[11px] text-ink-500">
                              {room.description}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : members.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-ink-500">还没有其他成员。</p>
            ) : (
              <ul className="space-y-1">
                {members.map((member) => {
                  const isMe = user?.id === member.id;
                  return (
                    <li
                      key={member.id}
                      className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-ink-200"
                    >
                      <Avatar name={member.username} url={member.avatarUrl} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{member.username}</span>
                        <span className="block text-[11px] text-ink-500">
                          {isMe ? "这是你" : "聊天室成员"}
                        </span>
                      </span>

                      {!isMe && onCall && (
                        <button
                          type="button"
                          onClick={() => onCall(member)}
                          disabled={callBusy}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-emerald-300 transition hover:bg-emerald-500/25 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-emerald-500/15"
                          aria-label={`呼叫 ${member.username}`}
                          title={callBusy ? "你正在通话中" : `呼叫 ${member.username}`}
                        >
                          <PhoneIcon className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-ink-800 p-2">
            {canCreateRoom ? (
              creating ? (
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={newRoomName}
                    onChange={(event) => setNewRoomName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void submitNewRoom();
                      if (event.key === "Escape") setCreating(false);
                    }}
                    maxLength={40}
                    placeholder="群组名称，回车创建"
                    className="h-9 min-w-0 flex-1 rounded-xl border border-ink-800 bg-ink-950 px-2.5 text-xs text-ink-100 outline-none placeholder:text-ink-500 focus:border-brand-500/60"
                  />
                  <button
                    type="button"
                    onClick={() => void submitNewRoom()}
                    disabled={submitting || newRoomName.trim() === ""}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-500 text-white transition hover:bg-brand-400 disabled:bg-ink-800 disabled:text-ink-500"
                    aria-label="创建群组"
                  >
                    {submitting ? (
                      <SpinnerIcon className="h-4 w-4 animate-spin" />
                    ) : (
                      <PlusIcon className="h-4 w-4" />
                    )}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-ink-700 px-3 py-2 text-xs text-ink-300 transition hover:border-brand-500/50 hover:text-brand-200"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  新建群组
                </button>
              )
            ) : (
              <p className="px-2 py-1.5 text-center text-[11px] text-ink-500">
                只有管理员可以新建群组
              </p>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "grid h-14 w-14 place-items-center rounded-2xl shadow-2xl shadow-black/40 transition",
          open
            ? "bg-ink-800 text-ink-100 ring-1 ring-ink-700"
            : "bg-brand-500 text-white hover:bg-brand-400",
        )}
        aria-label="群组与联系人"
        aria-expanded={open}
        title="群组与联系人"
      >
        <UsersIcon className="h-6 w-6" />
      </button>
    </div>
  );
}
