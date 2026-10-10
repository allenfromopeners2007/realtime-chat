"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Button,
  Card,
  DangerAction,
  Empty,
  ErrorBox,
  Loading,
  TableWrap,
  Td,
  Th,
} from "@/components/admin/ui";
import { apiFetch, describeApiError } from "@/lib/http";
import { formatTime } from "@/lib/format";
import { normalizeAdminRoom, type AdminRoom } from "@/lib/types";

type Props = {
  notify: (kind: "success" | "error" | "info", text: string) => void;
};

export function RoomsTab({ notify }: Props) {
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ rooms: AdminRoom[] }>("/api/admin/rooms", {
        context: "读取群组",
      });
      setRooms(data.rooms.map(normalizeAdminRoom));
    } catch (cause) {
      setError(describeApiError(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createRoom() {
    const name = newName.trim();
    if (name === "") return;
    setCreating(true);
    try {
      await apiFetch("/api/admin/rooms", {
        method: "POST",
        body: JSON.stringify({ name, description: newDesc.trim() }),
        context: "新建群组",
      });
      notify("success", `群组「${name}」已创建`);
      setNewName("");
      setNewDesc("");
      await load();
    } catch (cause) {
      notify("error", describeApiError(cause));
    } finally {
      setCreating(false);
    }
  }

  async function saveRoom(id: string) {
    setBusyId(id);
    try {
      await apiFetch("/api/admin/rooms", {
        method: "PATCH",
        body: JSON.stringify({ id, name: editName.trim(), description: editDesc.trim() }),
        context: "修改群组",
      });
      notify("success", "群组已更新");
      setEditingId(null);
      await load();
    } catch (cause) {
      notify("error", describeApiError(cause));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteRoom(room: AdminRoom) {
    setBusyId(room.id);
    try {
      const result = await apiFetch<{ deletedMessages: number }>(
        `/api/admin/rooms?id=${encodeURIComponent(room.id)}`,
        { method: "DELETE", context: "删除群组" },
      );
      notify("success", `已删除群组「${room.name}」，同时删除 ${result.deletedMessages} 条消息`);
      await load();
    } catch (cause) {
      notify("error", describeApiError(cause));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card title="新建群组" subtitle="群组名唯一；删除群组会连带删除该群全部消息">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            maxLength={40}
            placeholder="群组名称"
            className="h-9 w-40 rounded-xl border border-ink-800 bg-ink-950 px-3 text-xs text-ink-100 outline-none focus:border-brand-500/60"
          />
          <input
            value={newDesc}
            onChange={(event) => setNewDesc(event.target.value)}
            maxLength={200}
            placeholder="简介（可留空）"
            className="h-9 min-w-[12rem] flex-1 rounded-xl border border-ink-800 bg-ink-950 px-3 text-xs text-ink-100 outline-none focus:border-brand-500/60"
          />
          <Button
            variant="primary"
            size="md"
            busy={creating}
            disabled={newName.trim() === ""}
            onClick={() => void createRoom()}
          >
            创建
          </Button>
        </div>
      </Card>

      <Card
        title={`群组（${rooms.length}）`}
        actions={<Button onClick={() => void load()}>刷新</Button>}
      >
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} onRetry={() => void load()} />
        ) : rooms.length === 0 ? (
          <Empty text="还没有群组" />
        ) : (
          <TableWrap>
            <thead>
              <tr className="border-b border-ink-800">
                <Th>名称</Th>
                <Th>简介</Th>
                <Th className="text-right">消息数</Th>
                <Th>最后活跃</Th>
                <Th>创建时间</Th>
                <Th className="text-right">操作</Th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room.id} className="border-b border-ink-800/60 last:border-0">
                  <Td>
                    {editingId === room.id ? (
                      <input
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        maxLength={40}
                        className="h-7 w-36 rounded-lg border border-ink-700 bg-ink-950 px-2 text-xs text-ink-100 outline-none focus:border-brand-500/60"
                      />
                    ) : (
                      <span className="font-medium text-ink-100">{room.name}</span>
                    )}
                  </Td>
                  <Td className="max-w-[16rem] truncate text-ink-400">
                    {editingId === room.id ? (
                      <input
                        value={editDesc}
                        onChange={(event) => setEditDesc(event.target.value)}
                        maxLength={200}
                        className="h-7 w-56 rounded-lg border border-ink-700 bg-ink-950 px-2 text-xs text-ink-100 outline-none focus:border-brand-500/60"
                      />
                    ) : (
                      (room.description ?? "—")
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{room.messageCount}</Td>
                  <Td className="text-ink-500">
                    {room.lastMessageAt ? formatTime(room.lastMessageAt) : "—"}
                  </Td>
                  <Td className="text-ink-500">{formatTime(room.createdAt)}</Td>
                  <Td>
                    <span className="flex items-center justify-end gap-1.5">
                      {editingId === room.id ? (
                        <>
                          <Button
                            variant="primary"
                            busy={busyId === room.id}
                            onClick={() => void saveRoom(room.id)}
                          >
                            保存
                          </Button>
                          <Button onClick={() => setEditingId(null)}>取消</Button>
                        </>
                      ) : (
                        <>
                          <Button
                            onClick={() => {
                              setEditingId(room.id);
                              setEditName(room.name);
                              setEditDesc(room.description ?? "");
                            }}
                          >
                            编辑
                          </Button>
                          <DangerAction
                            label="删除"
                            confirmLabel={`删除并清空 ${room.messageCount} 条消息？`}
                            busy={busyId === room.id}
                            onConfirm={() => void deleteRoom(room)}
                          />
                        </>
                      )}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
