"use client";

import { useEffect, useRef, useState } from "react";

import { Button, DangerAction } from "@/components/admin/ui";
import { CloseIcon } from "@/components/icons";
import { apiFetch, describeApiError } from "@/lib/http";
import { formatTime } from "@/lib/format";
import { normalizeRoom, type Room } from "@/lib/types";

type Props = {
  room: Room;
  onClose: () => void;
  onSaved: (room: Room) => void;
  onDeleted: (roomId: string) => void;
  notify: (kind: "success" | "error" | "info", text: string) => void;
};

const MAX_ANNOUNCEMENT = 500;

/** 管理员在聊天界面里管理当前群组：改名 / 简介 / 置顶公告 / 删除 */
export function RoomSettingsPanel({ room, onClose, onSaved, onDeleted, notify }: Props) {
  const [name, setName] = useState(room.name);
  const [description, setDescription] = useState(room.description ?? "");
  const [announcement, setAnnouncement] = useState(room.announcement ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const dirty =
    name.trim() !== room.name ||
    description.trim() !== (room.description ?? "") ||
    announcement.trim() !== (room.announcement ?? "");

  async function save() {
    const nextName = name.trim();
    if (nextName === "") {
      notify("error", "群组名称不能为空");
      return;
    }

    // 只提交"真正改动过"的字段。
    // 为什么重要：如果整份表单全发出去，而本地这份 room 数据已经过期
    // （比如公告是别人/另一个标签页刚写的），就会把没动过的字段覆盖成旧值。
    const patch: Record<string, unknown> = { id: room.id };
    if (nextName !== room.name) patch.name = nextName;
    if (description.trim() !== (room.description ?? "")) patch.description = description.trim();
    if (announcement.trim() !== (room.announcement ?? "")) patch.announcement = announcement.trim();

    if (Object.keys(patch).length === 1) {
      notify("info", "没有改动");
      onClose();
      return;
    }

    setSaving(true);
    try {
      const data = await apiFetch<{ room: Room }>("/api/admin/rooms", {
        method: "PATCH",
        body: JSON.stringify(patch),
        context: "保存群组设置",
      });
      onSaved(normalizeRoom(data.room));
      notify("success", "群组设置已保存");
      onClose();
    } catch (error) {
      notify("error", describeApiError(error));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      const result = await apiFetch<{ deletedMessages: number }>(
        `/api/admin/rooms?id=${encodeURIComponent(room.id)}`,
        { method: "DELETE", context: "删除群组" },
      );
      notify("success", `已删除群组「${room.name}」，连带删除 ${result.deletedMessages} 条消息`);
      onDeleted(room.id);
      onClose();
    } catch (error) {
      notify("error", describeApiError(error));
    } finally {
      setDeleting(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-ink-800 bg-ink-950 px-3 text-sm text-ink-100 outline-none transition placeholder:text-ink-500 focus:border-brand-500/60";

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:items-center"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="animate-pop-in w-full max-w-lg rounded-2xl border border-ink-800 bg-ink-900 shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-ink-800 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-ink-100">群组设置</h2>
            <p className="mt-0.5 text-[11px] text-ink-500">
              只有管理员能修改 · 创建于 {formatTime(room.createdAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-800 hover:text-ink-100"
            aria-label="关闭"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 p-4">
          <label className="block">
            <span className="mb-1.5 block text-xs text-ink-300">群组名称</span>
            <input
              ref={firstFieldRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={40}
              className={`${inputClass} h-10`}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs text-ink-300">简介（可留空）</span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={200}
              placeholder="一句话说明这个群是干什么的"
              className={`${inputClass} h-10`}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 flex items-center justify-between text-xs text-ink-300">
              <span>📌 置顶公告（显示在消息列表上方，留空表示取消公告）</span>
              <span className={announcement.length > MAX_ANNOUNCEMENT ? "text-rose-300" : "text-ink-500"}>
                {announcement.length}/{MAX_ANNOUNCEMENT}
              </span>
            </span>
            <textarea
              value={announcement}
              onChange={(event) => setAnnouncement(event.target.value.slice(0, MAX_ANNOUNCEMENT))}
              rows={4}
              placeholder={"例如：本群用于讨论 TTL Week 4 的用户调研结果。\n请大家把问题集中在这里，不要私聊。"}
              className={`${inputClass} scrollbar-thin resize-y py-2.5`}
            />
            {room.announcementAt && (
              <span className="mt-1 block text-[11px] text-ink-500">
                上次更新：{formatTime(room.announcementAt)}
                {room.announcementByName ? ` · ${room.announcementByName}` : ""}
              </span>
            )}
          </label>

          <div className="flex items-center justify-end gap-2 border-t border-ink-800 pt-4">
            <Button size="md" onClick={onClose} disabled={saving}>
              取消
            </Button>
            <Button
              size="md"
              variant="primary"
              busy={saving}
              disabled={!dirty || announcement.length > MAX_ANNOUNCEMENT}
              onClick={() => void save()}
            >
              保存
            </Button>
          </div>

          <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-3">
            <p className="text-xs font-medium text-rose-200">危险操作</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-400">
              删除群组会<span className="text-rose-200">连带删除该群组里的所有消息</span>
              （附件不会自动清理，可在管理后台「附件」页处理）。删掉之后无法恢复。
            </p>
            <div className="mt-2.5">
              <DangerAction
                label="删除这个群组"
                confirmLabel="真的删除？"
                busy={deleting}
                onConfirm={() => void remove()}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AnnouncementBanner({
  room,
  isAdmin,
  onEdit,
}: {
  room: Room;
  isAdmin: boolean;
  onEdit: () => void;
}) {
  if (!room.announcement) return null;

  return (
    <div className="border-b border-amber-500/20 bg-amber-500/[0.07] px-3 py-2 sm:px-5">
      <div className="mx-auto flex w-full max-w-3xl items-start gap-2.5">
        <span className="mt-0.5 shrink-0 text-sm">📌</span>
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-amber-100">
            {room.announcement}
          </p>
          {room.announcementAt && (
            <p className="mt-1 text-[10px] text-amber-200/50">
              {room.announcementByName ? `${room.announcementByName} · ` : ""}
              {formatTime(room.announcementAt)} 更新
            </p>
          )}
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 rounded-lg border border-amber-500/30 px-2 py-1 text-[11px] text-amber-100 transition hover:bg-amber-500/15"
          >
            编辑
          </button>
        )}
      </div>
    </div>
  );
}
