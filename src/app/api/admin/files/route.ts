import type { NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/lib/api-response";
import { mapAdminError, requireAdmin } from "@/lib/admin";
import { STORAGE_BUCKET } from "@/lib/env";
import type { StorageEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/files?prefix=<目录路径>
 * 列出 Storage bucket 里的文件夹 / 文件（prefix 为空时列出根目录，
 * 根目录下就是每个用户的 <uid>/ 文件夹）。
 */
export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const prefix = (request.nextUrl.searchParams.get("prefix") ?? "").replace(/^\/+|\/+$/g, "");

  const { data, error } = await guard.ctx.supabase.storage
    .from(STORAGE_BUCKET)
    .list(prefix, { limit: 200, sortBy: { column: "name", order: "asc" } });

  if (error) {
    console.error("[api/admin/files] 列目录失败：", error.message);
    return jsonError(
      `读取文件列表失败：${error.message}。请确认 bucket「${STORAGE_BUCKET}」存在`,
      500,
    );
  }

  const entries: StorageEntry[] = (data ?? []).map((item) => {
    const path = prefix === "" ? item.name : `${prefix}/${item.name}`;
    const metadata = (item.metadata ?? {}) as { size?: number };
    return {
      name: item.name,
      path,
      // Supabase 用 id === null 表示这是一个"文件夹"（前缀）
      isFolder: item.id === null,
      size: typeof metadata.size === "number" ? metadata.size : 0,
      updatedAt: item.updated_at ?? null,
    };
  });

  return jsonOk({ prefix, bucket: STORAGE_BUCKET, entries });
}

/** DELETE /api/admin/files?path=xxx → 删除任意附件（Storage 策略里校验管理员身份） */
export async function DELETE(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const path = request.nextUrl.searchParams.get("path") ?? "";
  if (path === "") return jsonError("缺少 path", 400);

  const { error } = await guard.ctx.supabase.storage.from(STORAGE_BUCKET).remove([path]);
  if (error) return jsonError(mapAdminError(error.message), 400);

  return jsonOk({ ok: true, path });
}
