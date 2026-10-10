"use client";

import { useEffect } from "react";

import { CloseIcon, DownloadIcon } from "@/components/icons";
import type { Attachment } from "@/lib/types";

type Props = {
  attachment: Attachment;
  onClose: () => void;
};

/** 点击图片消息后的大图预览 */
export function ImageLightbox({ attachment, onClose }: Props) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-black/85 p-6 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-4xl items-center justify-between gap-4 text-ink-200">
        <p className="truncate text-sm">{attachment.name}</p>
        <div className="flex items-center gap-2">
          <a
            href={attachment.url}
            download={attachment.name}
            onClick={(event) => event.stopPropagation()}
            className="rounded-xl border border-ink-700 bg-ink-900/70 p-2 transition hover:border-brand-500/60 hover:text-white"
            aria-label="下载原图"
          >
            <DownloadIcon className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-ink-700 bg-ink-900/70 p-2 transition hover:border-brand-500/60 hover:text-white"
            aria-label="关闭预览"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={attachment.url}
        alt={attachment.name}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[76vh] max-w-full rounded-2xl object-contain shadow-2xl"
      />
    </div>
  );
}
