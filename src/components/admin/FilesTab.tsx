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
import { STORAGE_BUCKET, SUPABASE_URL } from "@/lib/env";
import type { StorageEntry } from "@/lib/types";

type Props = {
  notify: (kind: "success" | "error" | "info", text: string) => void;
};

/** 组装公开访问地址（bucket 是 public，直接拼 URL 即可） */
function publicUrl(path: string): string {
  const encoded = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${encoded}`;
}

function isImage(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(name);
}

export function FilesTab({ notify }: Props) {
  const [prefix, setPrefix] = useState("");
  const [entries, setEntries] = useState<StorageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);

  const load = useCallback(async (target: string) => {
    setLoading(true);
    setError(null);
    try {
      const query = target === "" ? "" : `?prefix=${encodeURIComponent(target)}`;
      const data = await apiFetch<{ entries: StorageEntry[] }>(`/api/admin/files${query}`, {
        context: "读取文件列表",
      });
      setEntries(data.entries);
      setPrefix(target);
    } catch (cause) {
      setError(describeApiError(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  async function remove(entry: StorageEntry) {
    setBusyPath(entry.path);
    try {
      await apiFetch(`/api/admin/files?path=${encodeURIComponent(entry.path)}`, {
        method: "DELETE",
        context: "删除文件",
      });
      notify("success", `已删除 ${entry.name}`);
      setEntries((previous) => previous.filter((item) => item.path !== entry.path));
    } catch (cause) {
      notify("error", describeApiError(cause));
    } finally {
      setBusyPath(null);
    }
  }

  const segments = prefix === "" ? [] : prefix.split("/");
  const totalSize = entries.reduce((sum, entry) => sum + (entry.isFolder ? 0 : entry.size), 0);

  return (
    <Card
      title={`附件（bucket: ${STORAGE_BUCKET}）`}
      subtitle="目录结构是 <用户id>/<年>/<月>/<文件>；删除后聊天记录里对应的附件链接会失效"
      actions={
        <span className="flex items-center gap-2">
          {prefix !== "" && <Button onClick={() => void load("")}>回到根目录</Button>}
          <Button onClick={() => void load(prefix)}>刷新</Button>
        </span>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-1 text-xs text-ink-400">
        <button
          type="button"
          onClick={() => void load("")}
          className="rounded px-1.5 py-0.5 hover:bg-ink-800 hover:text-ink-100"
        >
          根目录
        </button>
        {segments.map((segment, index) => {
          const target = segments.slice(0, index + 1).join("/");
          return (
            <span key={target} className="flex items-center gap-1">
              <span className="text-ink-600">/</span>
              <button
                type="button"
                onClick={() => void load(target)}
                className="max-w-[16rem] truncate rounded px-1.5 py-0.5 hover:bg-ink-800 hover:text-ink-100"
              >
                {segment}
              </button>
            </span>
          );
        })}
        {entries.length > 0 && (
          <span className="ml-auto text-ink-500">
            {entries.length} 项{totalSize > 0 ? ` · 本层文件合计 ${formatBytes(totalSize)}` : ""}
          </span>
        )}
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={() => void load(prefix)} />
      ) : entries.length === 0 ? (
        <Empty text="这个目录是空的" />
      ) : (
        <TableWrap>
          <thead>
            <tr className="border-b border-ink-800">
              <Th>名称</Th>
              <Th>类型</Th>
              <Th className="text-right">大小</Th>
              <Th>更新时间</Th>
              <Th className="text-right">操作</Th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.path} className="border-b border-ink-800/60 last:border-0">
                <Td>
                  <span className="flex items-center gap-2">
                    {!entry.isFolder && isImage(entry.name) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={publicUrl(entry.path)}
                        alt={entry.name}
                        loading="lazy"
                        className="h-8 w-8 rounded object-cover ring-1 ring-ink-700"
                      />
                    )}
                    {entry.isFolder ? (
                      <button
                        type="button"
                        onClick={() => void load(entry.path)}
                        className="font-medium text-brand-200 hover:underline"
                      >
                        📁 {entry.name}
                      </button>
                    ) : (
                      <a
                        href={publicUrl(entry.path)}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="max-w-[22rem] truncate text-ink-100 hover:underline"
                        title={entry.path}
                      >
                        {entry.name}
                      </a>
                    )}
                  </span>
                </Td>
                <Td>
                  {entry.isFolder ? <Badge>文件夹</Badge> : <Badge tone="brand">文件</Badge>}
                </Td>
                <Td className="text-right tabular-nums text-ink-400">
                  {entry.isFolder ? "—" : formatBytes(entry.size)}
                </Td>
                <Td className="text-ink-500">
                  {entry.updatedAt ? formatTime(entry.updatedAt) : "—"}
                </Td>
                <Td className="text-right">
                  {entry.isFolder ? (
                    <Button onClick={() => void load(entry.path)}>打开</Button>
                  ) : (
                    <DangerAction
                      label="删除"
                      confirmLabel="确认删除？"
                      busy={busyPath === entry.path}
                      onConfirm={() => void remove(entry)}
                    />
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </Card>
  );
}
