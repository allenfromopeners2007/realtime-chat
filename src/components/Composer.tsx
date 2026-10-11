"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import Link from "next/link";

import { EmojiPicker } from "@/components/EmojiPicker";
import {
  CloseIcon,
  FileIcon,
  ImageIcon,
  LockIcon,
  PaperclipIcon,
  SendIcon,
  SmileIcon,
  SpinnerIcon,
} from "@/components/icons";
import { MAX_UPLOAD_BYTES } from "@/lib/env";
import { cn, formatBytes } from "@/lib/format";
import { describeApiError } from "@/lib/http";
import type { Attachment, SessionUser } from "@/lib/types";

type Props = {
  user: SessionUser | null;
  sending: boolean;
  onSend: (content: string, attachment: Attachment | null) => Promise<boolean>;
  onUpload: (file: File) => Promise<Attachment>;
  onError: (message: string) => void;
};

export function Composer({ user, sending, onSend, onUpload, onError }: Props) {
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loggedIn = user !== null;
  const canSend = loggedIn && !sending && !uploading && (text.trim() !== "" || attachment !== null);

  // 输入框高度跟着内容长，最多 160px
  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [text]);

  async function handleFiles(files: FileList | File[] | null) {
    const file = files ? Array.from(files)[0] : undefined;
    if (!file) return;
    if (!loggedIn) {
      onError("请先登录再上传文件");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      onError(`文件过大，最多 ${formatBytes(MAX_UPLOAD_BYTES)}`);
      return;
    }

    setUploading(true);
    try {
      // 走到 /api/upload：服务端校验登录态后写入 Supabase Storage
      const uploaded = await onUpload(file);
      setAttachment(uploaded);
    } catch (error) {
      // describeApiError 里已经包含了「不是 JSON」等场景的可读说明
      onError(describeApiError(error));
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!canSend) return;
    const ok = await onSend(text.trim(), attachment);
    if (ok) {
      setText("");
      setAttachment(null);
      setEmojiOpen(false);
      textareaRef.current?.focus();
    }
  }

  function insertEmoji(emoji: string) {
    const element = textareaRef.current;
    if (!element) {
      setText((previous) => previous + emoji);
      return;
    }
    const start = element.selectionStart ?? text.length;
    const end = element.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      element.focus();
      const caret = start + emoji.length;
      element.setSelectionRange(caret, caret);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // isComposing：中文输入法选词时按 Enter 不该直接发送
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const file = Array.from(event.clipboardData.files)[0];
    if (file) {
      event.preventDefault();
      void handleFiles([file]);
    }
  }

  const iconButtonClass =
    "grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-300 transition hover:bg-ink-800 hover:text-ink-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <footer className="border-t border-ink-800/80 bg-ink-950/90 px-3 pb-3 pt-2.5 backdrop-blur-md sm:px-5">
      <div className="mx-auto w-full max-w-3xl">
        {!loggedIn && (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            <span className="flex items-center gap-2">
              <LockIcon className="h-3.5 w-3.5 shrink-0" />
              登录后才能查看和发送消息。
            </span>
            <Link
              href="/login"
              className="shrink-0 rounded-lg bg-amber-400/90 px-2.5 py-1 font-medium text-amber-950 transition hover:bg-amber-300"
            >
              去登录
            </Link>
          </div>
        )}

        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (loggedIn) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void handleFiles(event.dataTransfer.files);
          }}
          className={cn(
            "relative rounded-2xl border bg-ink-900/70 p-1.5 transition",
            dragging ? "border-brand-400 bg-brand-500/10" : "border-ink-800",
          )}
        >
          {emojiOpen && <EmojiPicker onPick={insertEmoji} onClose={() => setEmojiOpen(false)} />}

          {attachment && (
            <div className="mb-1.5 flex items-center gap-3 rounded-xl border border-ink-800 bg-ink-950/70 px-3 py-2">
              {attachment.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={attachment.url}
                  alt={attachment.name}
                  className="h-10 w-10 rounded-lg object-cover ring-1 ring-ink-700"
                />
              ) : (
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-500/15 text-brand-300">
                  <FileIcon className="h-5 w-5" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-ink-100">{attachment.name}</span>
                <span className="block text-[11px] text-ink-500">{formatBytes(attachment.size)}</span>
              </span>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-800 hover:text-ink-100"
                aria-label="移除附件"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {uploading && (
            <div className="mb-1.5 flex items-center gap-2 rounded-xl border border-ink-800 bg-ink-950/70 px-3 py-2 text-[11px] text-ink-300">
              <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
              正在上传到 Supabase Storage…
            </div>
          )}

          <div className="flex items-end gap-1">
            <button
              type="button"
              onClick={() => setEmojiOpen((open) => !open)}
              disabled={!loggedIn}
              className={cn(iconButtonClass, emojiOpen && "bg-ink-800 text-brand-200")}
              aria-label="表情"
              title="表情"
            >
              <SmileIcon className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={!loggedIn || uploading}
              className={iconButtonClass}
              aria-label="发送图片"
              title="发送图片"
            >
              <ImageIcon className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!loggedIn || uploading}
              className={iconButtonClass}
              aria-label="发送文件"
              title="发送文件"
            >
              <PaperclipIcon className="h-5 w-5" />
            </button>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                void handleFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(event) => {
                void handleFiles(event.target.files);
                event.target.value = "";
              }}
            />

            <textarea
              ref={textareaRef}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              rows={1}
              disabled={!loggedIn}
              placeholder={loggedIn ? "说点什么…（Enter 发送，Shift + Enter 换行）" : "登录后即可发言"}
              className="scrollbar-thin max-h-40 min-h-9 flex-1 resize-none bg-transparent px-1.5 py-2 text-sm text-ink-100 outline-none placeholder:text-ink-500 disabled:cursor-not-allowed"
            />

            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSend}
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-xl transition",
                canSend
                  ? "bg-brand-500 text-white shadow-lg shadow-brand-500/25 hover:bg-brand-400"
                  : "bg-ink-800 text-ink-500",
              )}
              aria-label="发送"
              title="发送"
            >
              {sending ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <SendIcon className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <p className="mt-1.5 hidden text-[11px] text-ink-500 sm:block">
          支持粘贴 / 拖拽图片，单个附件最大 {formatBytes(MAX_UPLOAD_BYTES)}
        </p>
      </div>
    </footer>
  );
}
