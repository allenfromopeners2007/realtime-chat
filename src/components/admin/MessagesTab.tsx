"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Badge,
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
import { formatBytes, formatTime } from "@/lib/format";
import { normalizeAdminRoom, normalizeMessage, type AdminMessage, type AdminRoom } from "@/lib/types";

type Props = {
  notify: (kind: "success" | "error" | "info", text: string) => void;
};

export function MessagesTab({ notify }: Props) {
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [keyword, setKeyword] = useState("");
  const [roomId, setRoomId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const search = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (keyword.trim() !== "") params.set("q", keyword.trim());
      if (roomId !== "") params.set("roomId", roomId);

      const data = await apiFetch<{ messages: AdminMessage[] }>(
        `/api/admin/messages?${params.toString()}`,
        { context: "检索消息" },
      );
      setMessages(data.messages.map((row) => ({ ...normalizeMessage(row), roomName: String(row.roomName ?? "") })));
    } catch (cause) {
      setError(describeApiError(cause));
    } finally {
      setLoading(false);
    }
  }, [keyword, roomId]);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<{ rooms: AdminRoom[] }>("/api/admin/rooms", { context: "读取群组" });
        setRooms(data.rooms.map(normalizeAdminRoom));
      } catch (cause) {
        console.error("[admin] 读取群组失败", cause);
      }
    })();
  }, []);

  useEffect(() => {
    void search();
  }, [search]);

  async function remove(message: AdminMessage) {
    setBusyId(message.id);
    try {
      await apiFetch(`/api/admin/messages?id=${encodeURIComponent(message.id)}`, {
        method: "DELETE",
        context: "删除消息",
      });
      notify("success", "消息已删除");
      setMessages((previous) => previous.filter((item) => item.id !== message.id));
    } catch (cause) {
      notify("error", describeApiError(cause));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card
      title={`消息检索（${messages.length} 条）`}
      subtitle="默认显示最近 200 条；删掉的消息无法恢复"
      actions={
        <span className="flex flex-wrap items-center gap-2">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void search();
            }}
            placeholder="按内容搜索…"
            className="h-8 w-44 rounded-lg border border-ink-800 bg-ink-950 px-2.5 text-xs text-ink-100 outline-none focus:border-brand-500/60"
          />
          <select
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
            className="h-8 rounded-lg border border-ink-800 bg-ink-950 px-2 text-xs text-ink-100 outline-none focus:border-brand-500/60"
          >
            <option value="">全部群组</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
          <Button onClick={() => void search()}>搜索</Button>
        </span>
      }
    >
      {loading ? (
        <Loading text="正在检索…" />
      ) : error ? (
        <ErrorBox message={error} onRetry={() => void search()} />
      ) : messages.length === 0 ? (
        <Empty text="没有匹配的消息" />
      ) : (
        <TableWrap>
          <thead>
            <tr className="border-b border-ink-800">
              <Th>时间</Th>
              <Th>作者</Th>
              <Th>群组</Th>
              <Th>内容</Th>
              <Th>附件</Th>
              <Th className="text-right">操作</Th>
            </tr>
          </thead>
          <tbody>
            {messages.map((message) => (
              <tr key={message.id} className="border-b border-ink-800/60 last:border-0">
                <Td className="whitespace-nowrap text-ink-500">{formatTime(message.createdAt)}</Td>
                <Td className="whitespace-nowrap">{message.authorName}</Td>
                <Td className="whitespace-nowrap text-ink-400">{message.roomName}</Td>
                <Td className="max-w-[26rem]">
                  <span className="line-clamp-2 break-words">{message.content || "—"}</span>
                </Td>
                <Td>
                  {message.attachment ? (
                    message.attachment.kind === "image" ? (
                      <a
                        href={message.attachment.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1.5"
                        title={message.attachment.name}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={message.attachment.url}
                          alt={message.attachment.name}
                          className="h-8 w-8 rounded object-cover ring-1 ring-ink-700"
                        />
                        <Badge>图片</Badge>
                      </a>
                    ) : (
                      <a
                        href={message.attachment.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-brand-300 hover:underline"
                        title={message.attachment.name}
                      >
                        <Badge>{formatBytes(message.attachment.size)}</Badge>
                      </a>
                    )
                  ) : (
                    <span className="text-ink-600">—</span>
                  )}
                </Td>
                <Td className="text-right">
                  <DangerAction
                    label="删除"
                    confirmLabel="确认删除？"
                    busy={busyId === message.id}
                    onConfirm={() => void remove(message)}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </Card>
  );
}
