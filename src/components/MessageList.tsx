"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { MessageBubble } from "@/components/MessageBubble";
import { ArrowDownIcon, ChatIcon, SpinnerIcon } from "@/components/icons";
import { cn, dayKey, formatDayLabel, isSameDay } from "@/lib/format";
import type { Attachment, Message } from "@/lib/types";

type Props = {
  messages: Message[];
  currentUserId: string | null;
  /** 当前用户是不是管理员：管理员可以删任何人的消息 */
  isAdmin: boolean;
  query: string;
  loading: boolean;
  searching: boolean;
  onOpenImage: (attachment: Attachment) => void;
  onDeleteMessage: (message: Message) => Promise<void> | void;
  emptyTitle: string;
  emptyHint: string;
};

type Row =
  | { type: "day"; key: string; label: string }
  | { type: "message"; key: string; message: Message; showHeader: boolean };

/** 同一作者在 5 分钟内的连续消息只在第一条显示头像和昵称 */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

export function MessageList({
  messages,
  currentUserId,
  isAdmin,
  query,
  loading,
  searching,
  onOpenImage,
  onDeleteMessage,
  emptyTitle,
  emptyHint,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  const rows = useMemo<Row[]>(() => {
    const output: Row[] = [];
    messages.forEach((message, index) => {
      const previous = index > 0 ? messages[index - 1] : undefined;

      if (!previous || !isSameDay(previous.createdAt, message.createdAt)) {
        output.push({
          type: "day",
          key: `day-${dayKey(message.createdAt)}-${message.id}`,
          label: formatDayLabel(message.createdAt),
        });
      }

      const sameAuthor = previous?.authorName === message.authorName;
      const withinWindow =
        previous !== undefined &&
        new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() <
          GROUP_WINDOW_MS;
      const sameDay = previous !== undefined && isSameDay(previous.createdAt, message.createdAt);

      output.push({
        type: "message",
        key: message.id,
        message,
        showHeader: !(sameAuthor && withinWindow && sameDay),
      });
    });
    return output;
  }, [messages]);

  // 新消息到达时，只有本来就在底部才自动滚动，避免打断向上翻阅的人
  useEffect(() => {
    const element = containerRef.current;
    if (!element || !pinned) return;
    element.scrollTop = element.scrollHeight;
  }, [rows, pinned]);

  function handleScroll() {
    const element = containerRef.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    setPinned(distance < 140);
  }

  function scrollToBottom() {
    const element = containerRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    setPinned(true);
  }

  return (
    <div className="relative min-h-0 flex-1">
      {query.trim() !== "" && (
        <div className="border-b border-ink-800/70 bg-ink-900/40 px-4 py-2 text-xs text-ink-300">
          {searching ? (
            <span className="flex items-center gap-2">
              <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
              正在搜索「{query.trim()}」…
            </span>
          ) : (
            <span>
              搜索「<span className="text-ink-100">{query.trim()}</span>」共 {messages.length} 条结果
            </span>
          )}
        </div>
      )}

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="scrollbar-thin h-full overflow-y-auto overscroll-contain px-2 py-4 sm:px-4"
      >
        <div className="mx-auto w-full max-w-3xl">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-ink-400">
              <SpinnerIcon className="h-6 w-6 animate-spin" />
              <p className="text-sm">正在加载消息…</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-ink-900 text-ink-500 ring-1 ring-ink-800">
                <ChatIcon className="h-6 w-6" />
              </span>
              <p className="text-sm font-medium text-ink-200">{emptyTitle}</p>
              <p className="max-w-sm text-xs leading-relaxed text-ink-500">{emptyHint}</p>
            </div>
          ) : (
            rows.map((row) =>
              row.type === "day" ? (
                <div
                  key={row.key}
                  suppressHydrationWarning
                  className="my-5 flex items-center gap-3 text-[11px] text-ink-500"
                >
                  <span className="h-px flex-1 bg-ink-800/80" />
                  <span className="rounded-full border border-ink-800 bg-ink-900 px-2.5 py-0.5">
                    {row.label}
                  </span>
                  <span className="h-px flex-1 bg-ink-800/80" />
                </div>
              ) : (
                <MessageBubble
                  key={row.key}
                  message={row.message}
                  isOwn={currentUserId !== null && row.message.userId === currentUserId}
                  showHeader={row.showHeader}
                  query={query}
                  onOpenImage={onOpenImage}
                  canDelete={isAdmin || (currentUserId !== null && row.message.userId === currentUserId)}
                  onDelete={onDeleteMessage}
                />
              ),
            )
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={scrollToBottom}
        className={cn(
          "absolute bottom-4 left-1/2 grid h-10 w-10 -translate-x-1/2 place-items-center rounded-full border border-ink-700 bg-ink-900/95 text-ink-200 shadow-xl backdrop-blur transition",
          pinned ? "pointer-events-none opacity-0" : "opacity-100 hover:border-brand-500/60",
        )}
        aria-label="回到最新消息"
      >
        <ArrowDownIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
