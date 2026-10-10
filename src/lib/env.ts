/**
 * 环境变量集中出口。
 *
 * 注意：NEXT_PUBLIC_* 必须写成完整的静态成员表达式，Next.js 才能在打包时把它内联到浏览器代码里。
 */

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/**
 * 【浏览器端】使用的 Supabase 地址。
 *
 * 国内部署时会指向你自己的反向代理域名（例如 https://sb.example.com），
 * 因为 `*.supabase.co` 在国内很多网络会被直接重置连接（ECONNRESET），
 * 让浏览器只连你自己的域名才能让同学/同事不用开代理也能用。
 */
export const SUPABASE_URL = rawUrl.replace(/\/+$/, "");

/**
 * 【服务端】使用的 Supabase 地址（Server Component / Route Handler / middleware）。
 *
 * 默认和浏览器端一致；如果部署在海外机器上（Vercel / 香港 VPS），
 * 就把它设成官方地址直连 —— 海外机器访问 supabase.co 没有任何问题，
 * 而且少绕一层代理更快。
 */
export const SUPABASE_URL_SERVER = (process.env.SUPABASE_URL_SERVER || rawUrl).replace(/\/+$/, "");

/** Supabase anon key（公开密钥，真正的权限由 RLS 控制） */
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** 附件所在的 Storage bucket */
export const STORAGE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "chat-attachments";

/** 时间显示用的时区：服务端和浏览器都用它渲染，避免 hydration 前后不一致 */
export const TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE || "Asia/Shanghai";

/**
 * 单文件上传上限（字节），需与 Supabase bucket 的限制保持一致。
 *
 * 默认 10MB。部署到 **Vercel** 时建议设成 `NEXT_PUBLIC_MAX_UPLOAD_BYTES=4194304`（4MB），
 * 因为 Vercel 的 Serverless 函数请求体上限是 4.5MB，超了会被平台直接拒掉、
 * 前端只能看到一个含糊的失败。
 */
export const MAX_UPLOAD_BYTES = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_BYTES ?? "");
  return Number.isFinite(raw) && raw >= 100 * 1024 ? Math.floor(raw) : 10 * 1024 * 1024;
})();

/** 单条消息文本上限 */
export const MAX_MESSAGE_LENGTH = 4000;

/** 图片类附件的 mime 前缀白名单 */
export const IMAGE_MIME_PREFIX = "image/";

/** 是否已经配置好 Supabase：没配置时页面会显示引导页而不是直接崩掉 */
export const isSupabaseConfigured =
  SUPABASE_URL.startsWith("http") && SUPABASE_ANON_KEY.length > 20;

/** 未配置时展示给用户的提示 */
export const SUPABASE_SETUP_HINT = [
  "还没有配置 Supabase 环境变量。",
  "",
  "1) 在 supabase.com 新建一个项目",
  "2) 打开 SQL Editor，把仓库里的 supabase/schema.sql 全部粘贴执行",
  "3) 把 .env.local.example 复制成 .env.local，填入 Project URL 与 Publishable key（旧版界面叫 anon key）",
  "4) 重启开发服务器（npm run dev / pnpm dev）",
].join("\n");
