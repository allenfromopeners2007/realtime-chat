"use client";

import { useState, type ReactNode } from "react";

import { AlertIcon, SpinnerIcon } from "@/components/icons";
import { cn } from "@/lib/format";

export function Card({
  title,
  subtitle,
  actions,
  children,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/40">
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-800 px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-ink-100">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[11px] text-ink-500">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: "primary" | "ghost" | "danger";
  size?: "sm" | "md";
  className?: string;
  title?: string;
};

export function Button({
  children,
  onClick,
  disabled,
  busy,
  variant = "ghost",
  size = "sm",
  className,
  title,
}: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" ? "h-8 px-2.5 text-xs" : "h-10 px-4 text-sm",
        variant === "primary" && "bg-brand-500 text-white hover:bg-brand-400",
        variant === "ghost" && "border border-ink-700 text-ink-200 hover:border-ink-600 hover:text-white",
        variant === "danger" && "border border-rose-500/40 text-rose-200 hover:bg-rose-500/15",
        className,
      )}
    >
      {busy && <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

/** 二次确认按钮：第一次点击变成「确认?」，第二次才真正执行 —— 不依赖浏览器弹窗 */
export function DangerAction({
  label,
  confirmLabel = "确认？",
  onConfirm,
  busy,
  title,
}: {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  busy?: boolean;
  title?: string;
}) {
  const [armed, setArmed] = useState(false);

  if (armed) {
    return (
      <span className="inline-flex items-center gap-1">
        <Button
          variant="danger"
          busy={busy}
          onClick={() => {
            setArmed(false);
            onConfirm();
          }}
        >
          {confirmLabel}
        </Button>
        <Button onClick={() => setArmed(false)} disabled={busy}>
          取消
        </Button>
      </span>
    );
  }

  return (
    <Button variant="danger" onClick={() => setArmed(true)} busy={busy} title={title}>
      {label}
    </Button>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "danger" | "success";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium",
        tone === "neutral" && "bg-ink-800 text-ink-300",
        tone === "brand" && "bg-brand-500/20 text-brand-200",
        tone === "danger" && "bg-rose-500/20 text-rose-200",
        tone === "success" && "bg-emerald-500/20 text-emerald-200",
      )}
    >
      {children}
    </span>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-100">
      <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 leading-relaxed">{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 underline hover:no-underline">
          重试
        </button>
      )}
    </div>
  );
}

export function Loading({ text = "加载中…" }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-xs text-ink-400">
      <SpinnerIcon className="h-4 w-4 animate-spin" />
      {text}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="py-10 text-center text-xs text-ink-500">{text}</p>;
}

export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "whitespace-nowrap px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-ink-500",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2.5 align-middle text-xs text-ink-200", className)}>{children}</td>;
}

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="scrollbar-thin -mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[46rem] border-collapse">{children}</table>
    </div>
  );
}
