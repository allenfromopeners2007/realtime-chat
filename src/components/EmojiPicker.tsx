"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/format";

const GROUPS: Array<{ id: string; label: string; emojis: string[] }> = [
  {
    id: "smileys",
    label: "表情",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣",
      "😊", "😇", "🙂", "🙃", "😉", "😍", "🥰", "😘",
      "😜", "🤪", "🤗", "🤔", "🤨", "😐", "😴", "😪",
      "😢", "😭", "😤", "😡", "🥺", "😱", "🤯", "😳",
    ],
  },
  {
    id: "gestures",
    label: "手势",
    emojis: [
      "👍", "👎", "👌", "✌️", "🤞", "🤝", "👏", "🙌",
      "🙏", "💪", "👋", "🫶", "☝️", "✋", "🤙", "🫡",
    ],
  },
  {
    id: "objects",
    label: "物品",
    emojis: [
      "💻", "📱", "⌨️", "🖱️", "🎧", "📷", "🎮", "🕹️",
      "📎", "📁", "📌", "📝", "📚", "☕", "🍜", "🍕",
      "🎉", "🎁", "🔥", "✨", "⭐", "💡", "🚀", "🛠️",
    ],
  },
  {
    id: "symbols",
    label: "符号",
    emojis: [
      "✅", "❌", "⚠️", "❓", "❗", "💯", "🔔", "🔒",
      "➡️", "⬅️", "⬆️", "⬇️", "🔄", "⏰", "📅", "📍",
      "❤️", "🧡", "💚", "💙", "💜", "🖤", "🤍", "💔",
    ],
  },
];

type Props = {
  onPick: (emoji: string) => void;
  onClose: () => void;
};

/** 纯前端内置表情面板，不依赖任何第三方库或网络请求 */
export function EmojiPicker({ onPick, onClose }: Props) {
  const [groupId, setGroupId] = useState<string>(GROUPS[0].id);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const activeGroup = GROUPS.find((group) => group.id === groupId) ?? GROUPS[0];

  return (
    <div
      ref={containerRef}
      className="animate-pop-in absolute bottom-full left-0 z-40 mb-3 w-[19.5rem] rounded-2xl border border-ink-800 bg-ink-900/98 p-3 shadow-2xl shadow-black/50"
    >
      <div className="mb-2 flex gap-1">
        {GROUPS.map((group) => (
          <button
            key={group.id}
            type="button"
            onClick={() => setGroupId(group.id)}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs transition",
              group.id === groupId
                ? "bg-brand-500/20 text-brand-200"
                : "text-ink-400 hover:bg-ink-800 hover:text-ink-100",
            )}
          >
            {group.label}
          </button>
        ))}
      </div>

      <div className="scrollbar-thin grid max-h-52 grid-cols-8 gap-1 overflow-y-auto">
        {activeGroup.emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onPick(emoji)}
            className="grid h-8 w-8 place-items-center rounded-lg text-lg transition hover:bg-ink-800"
            aria-label={`插入表情 ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
