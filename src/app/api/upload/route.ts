import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { jsonError, jsonOk, jsonUnauthorized } from "@/lib/api-response";
import {
  isSupabaseConfigured,
  MAX_UPLOAD_BYTES,
  STORAGE_BUCKET,
} from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Attachment } from "@/lib/types";
import { formatBytes } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 非图片类附件的白名单（图片统一放行 image/*） */
const ALLOWED_FILE_MIME = new Set([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "text/markdown",
]);

/**
 * 生成 Storage 接受的文件名。
 *
 * ⚠️ 关键：Supabase Storage 的 object key **只接受 ASCII 安全字符**，
 * 中文、emoji、空格、括号等都会让 Storage 返回 `Invalid key`（踩过这个坑）。
 * 所以这里把所有非 ASCII 字符替换成 `-`，扩展名也只保留字母数字。
 *
 * 注意：展示给用户看的文件名仍然用原始名（attachment.name），中文照常显示，
 * 只是存储路径用这份 ASCII 版本。
 */
function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";

  const dotIndex = base.lastIndexOf(".");
  const rawExt = dotIndex > 0 ? base.slice(dotIndex + 1) : "";
  const ext = rawExt.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toLowerCase();
  const stem = dotIndex > 0 ? base.slice(0, dotIndex) : base;

  const cleaned = stem
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  const safeStem = cleaned === "" ? "file" : cleaned;
  return ext === "" ? safeStem : `${safeStem}.${ext}`;
}

/**
 * POST /api/upload   （multipart/form-data，字段名 file）
 *
 * 必须登录；文件存到 Supabase Storage 的 STORAGE_BUCKET 里，
 * 路径形如 `<userId>/2026/10/<时间戳>-<随机串>-<文件名>`，
 * 这样 Storage 的 RLS 策略可以限制“只能写自己目录”。
 */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured) {
    return jsonError("Supabase 还没有配置，请先填写 .env.local", 503);
  }

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return jsonUnauthorized("请先登录再上传文件");

    let form: FormData;
    try {
      form = await request.formData();
    } catch (error) {
      console.error("[api/upload] formData 解析失败", error);
      return jsonError("请求体必须是 multipart/form-data", 400);
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return jsonError("缺少 form 字段 file", 400);
    }
    if (file.size === 0) {
      return jsonError("文件内容为空", 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return jsonError(`文件过大，最多 ${formatBytes(MAX_UPLOAD_BYTES)}`, 413);
    }

    const mime = file.type || "application/octet-stream";
    const isImage = mime.startsWith("image/");
    if (!isImage && !ALLOWED_FILE_MIME.has(mime)) {
      return jsonError(`不支持的文件类型：${mime}`, 415);
    }

    const now = new Date();
    const folder = `${user.id}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
    const objectPath = `${folder}/${Date.now()}-${randomUUID().slice(0, 8)}-${sanitizeFileName(file.name)}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(objectPath, file, {
        contentType: mime,
        upsert: false,
        cacheControl: "3600",
      });

    if (uploadError) {
      const message = uploadError.message || "上传失败";
      console.error("[api/upload] Storage 上传失败", uploadError);

      if (/bucket not found/i.test(message)) {
        return jsonError(
          `Storage bucket「${STORAGE_BUCKET}」不存在：请先在 Supabase SQL Editor 执行 supabase/schema.sql`,
          500,
        );
      }
      if (/row-level security|violates row-level security|Unauthorized|permission/i.test(message)) {
        return jsonError(
          "没有上传权限：请确认已执行 schema.sql 中的 Storage 策略（仅登录用户可写自己的目录）",
          403,
        );
      }
      if (/invalid key/i.test(message)) {
        return jsonError(
          "文件名里有 Storage 不接受的字符。存储路径已改成纯 ASCII，请刷新页面后重试；若仍失败请把这条提示反馈给开发者。",
          400,
        );
      }
      return jsonError(`上传失败：${message}`, 500);
    }

    const { data: publicUrlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(objectPath);

    const attachment: Attachment = {
      kind: isImage ? "image" : "file",
      name: file.name || "未命名文件",
      size: file.size,
      mime,
      path: objectPath,
      url: publicUrlData.publicUrl,
    };

    return jsonOk({ attachment }, 201);
  } catch (error) {
    console.error("[api/upload] 未预期的异常", error);
    return jsonError("服务端异常，请查看终端日志", 500);
  }
}
