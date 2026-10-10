import { TIMEZONE } from "@/lib/env";

/** 时区字符串非法时退回 UTC，避免 Intl 直接抛错把页面搞崩 */
function safeTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

const TZ = safeTimeZone(TIMEZONE);

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TZ,
});

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: TZ,
});

// en-CA 会输出 2026-10-08 这种可比较的格式，用来判断是不是同一天
const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: TZ,
});

function toDate(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTime(value: string | Date): string {
  const date = toDate(value);
  return date ? timeFormatter.format(date) : "";
}

export function dayKey(value: string | Date): string {
  const date = toDate(value);
  return date ? dayKeyFormatter.format(date) : "";
}

export function formatDayLabel(value: string | Date): string {
  const date = toDate(value);
  if (!date) return "";
  const today = dayKeyFormatter.format(new Date());
  const yesterday = dayKeyFormatter.format(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const key = dayKeyFormatter.format(date);
  if (key === today) return "今天";
  if (key === yesterday) return "昨天";
  return dateFormatter.format(date);
}

export function isSameDay(a: string | Date, b: string | Date): boolean {
  const keyA = dayKey(a);
  return keyA !== "" && keyA === dayKey(b);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

export function initials(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") return "?";
  // 中文名取最后一个字，英文名取首字母
  if (/[\u4e00-\u9fa5]/.test(trimmed)) return trimmed.slice(-1);
  const parts = trimmed.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** 极简 className 合并，避免为了一个 clsx 再装依赖 */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export type TextPart = { type: "text" | "link"; value: string; href?: string };

const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/g;

/** 把消息文本里的链接拆出来，方便渲染成可点击的 <a> */
export function linkifyParts(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, index) });
    }
    parts.push({ type: "link", value: match[0], href: match[0] });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }
  return parts.length > 0 ? parts : [{ type: "text", value: text }];
}
