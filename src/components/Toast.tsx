"use client";

import { useEffect } from "react";

import { AlertIcon, CheckIcon, CloseIcon } from "@/components/icons";
import { cn } from "@/lib/format";

export type ToastState = {
  id: number;
  kind: "error" | "info" | "success";
  text: string;
};

type ToastProps = {
  state: ToastState | null;
  onDismiss: () => void;
};

export function Toast({ state, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!state) return;
    const timer = window.setTimeout(onDismiss, state.kind === "error" ? 7000 : 3000);
    return () => window.clearTimeout(timer);
  }, [state, onDismiss]);

  if (!state) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center px-4">
      <div
        role="status"
        className={cn(
          "pointer-events-auto flex max-w-xl items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-2xl backdrop-blur",
          state.kind === "error"
            ? "border-rose-500/40 bg-rose-950/80 text-rose-100"
            : state.kind === "success"
              ? "border-emerald-500/40 bg-emerald-950/80 text-emerald-100"
              : "border-ink-700 bg-ink-900/90 text-ink-100",
        )}
      >
        <span className="mt-0.5 shrink-0">
          {state.kind === "error" ? (
            <AlertIcon className="h-4 w-4" />
          ) : (
            <CheckIcon className="h-4 w-4" />
          )}
        </span>
        <p className="flex-1 leading-relaxed">{state.text}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-lg p-1 text-white/70 transition hover:bg-white/10 hover:text-white"
          aria-label="关闭提示"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
