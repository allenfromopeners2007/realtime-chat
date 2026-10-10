"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

let cached: SupabaseClient | null = null;

/**
 * 浏览器端 Supabase 客户端（单例）。
 * 登录、登出、Realtime 订阅都走它；写库/上传则统一走后端 route handler，
 * 这样权限校验只有一处，前端也不用持有 service role key。
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase 环境变量未配置：请先复制 .env.local.example 为 .env.local");
  }
  if (!cached) {
    cached = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return cached;
}
