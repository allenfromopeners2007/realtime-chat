"use client";

import { useState, type ReactNode } from "react";

import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/admin/ui";
import { CheckIcon, DownloadIcon, FileIcon, MicIcon, TrashIcon } from "@/components/icons";
import { cn, formatBytes, formatTime, linkifyParts } from "@/lib/format";
import type { Attachment, Message } from "@/lib/types";
import { formatDuration } from "@/lib/voice";

type Props = {
  message: Message;
  isOwn: boolean;
  showHeader: boolean;
  query: string;
  onOpenImage: (attachment: Attachment) => void;
  /** 是否可以删除这条消息：作者本人 或 管理员 */
  canDelete: boolean;
  onDelete: (message: Message) => Promise<void> | void;
};

/** 命中搜索关键字的部分高亮 */
function highlight(text: string, query: string) {
  const keyword = query.trim();
  if (keyword === "") return text;

  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  const nodes: Array<string | ReactNode> = [];
  let cursor = 0;
  let index = lowerText.indexOf(lowerKeyword);

  while (index !== -1) {
    if (index > cursor) nodes.push(text.slice(cursor, index));
    nodes.push(
      <mark key={`${index}-${cursor}`} className="rounded bg-amber-400/25 px-0.5 text-amber-100">
        {text.slice(index, index + keyword.length)}
      </mark>,
    );
    cursor = index + keyword.length;
    index = lowerText.indexOf(lowerKeyword, cursor);
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes.length > 0 ? nodes : text;
}

function MessageText({ text, query }: { text: string; query: string }) {
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-100">
      {linkifyParts(text).map((part, index) =>
        part.type === "link" ? (
          <a
            key={index}
            href={part.href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-brand-300 underline decoration-brand-500/40 underline-offset-2 transition hover:decoration-brand-300"
          >
            {part.value}
          </a>
        ) : (
          <span key={index}>{highlight(part.value, query)}</span>
        ),
      )}
    </p>
  );
}

function AttachmentView({
  attachment,
  onOpenImage,
}: {
  attachment: Attachment;
  onOpenImage: (attachment: Attachment) => void;
}) {
  if (attachment.kind === "image") {
    return (
      <button
        type="button"
        onClick={() => onOpenImage(attachment)}
        className="group/img mt-1.5 block overflow-hidden rounded-2xl border border-ink-800 bg-ink-900 transition hover:border-brand-500/50"
        title="点击查看大图"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.url}
          alt={attachment.name}
          loading="lazy"
          className="max-h-72 w-auto max-w-[min(20rem,70vw)] object-cover transition group-hover/img:opacity-95"
        />
      </button>
    );
  }

  if (attachment.kind === "audio") {
    return (
      <div className="mt-1.5 flex max-w-sm items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900 px-3 py-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rose-500/15 text-rose-300">
          <MicIcon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <audio
            controls
            preload="metadata"
            src={attachment.url}
            className="h-9 w-full max-w-[16rem]"
          >
            {/* 极老浏览器不支持 audio 时的兜底：给个下载链接 */}
            <a href={attachment.url} target="_blank" rel="noreferrer noopener">
              下载语音
            </a>
          </audio>
          <span className="mt-0.5 block text-[11px] text-ink-400">
            {attachment.durationMs ? `语音 · ${formatDuration(attachment.durationMs)}` : "语音消息"}
          </span>
        </span>
      </div>
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer noopener"
      download={attachment.name}
      className="mt-1.5 flex max-w-sm items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900 px-3 py-2.5 transition hover:border-brand-500/50"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-300">
        <FileIcon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-ink-100">{attachment.name}</span>
        <span className="block text-xs text-ink-400">{formatBytes(attachment.size)}</span>
      </span>
      <DownloadIcon className="h-4 w-4 shrink-0 text-ink-400" />
    </a>
  );
}

/** 悬停出现的操作条：两步确认删除，不弹浏览器对话框 */
function MessageActions({ onConfirm }: { onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  if (armed) {
    return (
      <span className="flex items-center gap-1">
        <Button
          variant="danger"
          busy={busy}
          onClick={() => {
            setBusy(true);
            Promise.resolve(onConfirm()).finally(() => {
              setBusy(false);
              setArmed(false);
            });
          }}
          title="确认删除这条消息（附件也会一起删掉）"
        >
          删除
        </Button>
        <Button onClick={() => setArmed(false)} disabled={busy}>
          取消
        </Button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setArmed(true)}
      className="grid h-7 w-7 place-items-center rounded-lg border border-ink-700 bg-ink-900/90 text-ink-400 transition hover:border-rose-500/50 hover:text-rose-200"
      aria-label="删除这条消息"
      title="删除这条消息"
    >
      <TrashIcon className="h-3.5 w-3.5" />
    </button>
  );
}

export function MessageBubble({
  message,
  isOwn,
  showHeader,
  query,
  onOpenImage,
  canDelete,
  onDelete,
}: Props) {
  const [deleted, setDeleted] = useState(false);

  async function handleDelete() {
    await onDelete(message);
    setDeleted(true);
  }

  // 删除成功后先本地淡出，等 Realtime / 状态更新把它移除
  if (deleted) {
    return (
      <div className={cn("flex gap-3 px-1 opacity-40", showHeader ? "mt-4" : "mt-1")}>
        <div className="w-9 shrink-0" />
        <p className="flex items-center gap-1.5 py-2 text-xs text-ink-500">
          <CheckIcon className="h-3.5 w-3.5" />
          消息已删除
        </p>
      </div>
    );
  }

  return (
    <div className={cn("group flex gap-3 px-1", showHeader ? "mt-4" : "mt-1")}>
      <div className="w-9 shrink-0">
        {showHeader ? (
          <Avatar name={message.authorName} url={message.authorAvatarUrl} size={36} />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        {showHeader && (
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-sm font-semibold text-ink-100">{message.authorName}</span>
            {isOwn && (
              <span className="rounded-md bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-medium text-brand-200">
                我
              </span>
            )}
            <time className="text-[11px] text-ink-500">{formatTime(message.createdAt)}</time>
          </div>
        )}

        <div className="flex items-start gap-2">
          <div
            className={cn(
              "inline-block max-w-full rounded-2xl px-3.5 py-2",
              isOwn
                ? "bg-brand-500/15 ring-1 ring-brand-500/25"
                : "bg-ink-900/70 ring-1 ring-ink-800/80",
            )}
          >
            {message.content !== "" && <MessageText text={message.content} query={query} />}
            {message.attachment && (
              <AttachmentView attachment={message.attachment} onOpenImage={onOpenImage} />
            )}
          </div>

          {canDelete && (
            <span className="mt-0.5 shrink-0 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100">
              <MessageActions onConfirm={handleDelete} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
