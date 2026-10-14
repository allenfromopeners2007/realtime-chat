-- ============================================================================
-- invites-migration.sql —— 站内邀请（不会失效的邀请链接）
--
-- 为什么需要：
--   Supabase 自带的邮件邀请链接是【一次性令牌】✗
--     · 每次"重发邀请"都会让上一条立刻作废
--     · 微信/QQ/邮箱的"链接预览"、反垃圾扫描可能偷偷访问一次 → 消耗掉
--     · 24 小时过期
--     · 链接域名是 *.supabase.co → 国内被墙，同学点不开
--   结果就是：同学还没用，链接就失效了 ✗
--
-- 本方案改成【我们自己的令牌】：
--   app.theopener.top/join?t=<32 位随机令牌>
--     · 7 天有效、可重复打开 ✓
--     · 同学要【点一下按钮】才换取登录态 → 预览/扫描不会误消耗 ✓
--     · 全程走我们自己的域名（国内可达 ✓）
--
-- 执行位置：Supabase → SQL Editor → 整段粘贴 → Run（可重复执行 ✓）
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.invites (
  id          uuid        primary key default gen_random_uuid(),
  -- 我们自己的邀请令牌（32 位十六进制，URL 安全）
  token       text        not null unique,
  -- 被邀请人的邮箱（小写存储）
  email       text        not null,
  -- 管理员写的备注（比如"三班张三"，方便自己认）
  note        text,
  -- 是谁发的邀请
  created_by  uuid        references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  -- 最后一次被使用的时间，以及用了几次（允许重复打开，所以只做记录不做限制）
  used_at     timestamptz,
  used_count  integer     not null default 0
);

create index if not exists invites_token_idx on public.invites (token);
create index if not exists invites_email_idx on public.invites (lower(email));

-- ---------------------------------------------------------------------------
-- 安全：开启 RLS 且**不建任何 policy**
--
--   效果：anon / authenticated 通过 API 完全读不到这张表（默认全拒 ✓）
--         只有服务端的 service_role（绕过 RLS）能读写 ✓
--   邀请令牌只在校验的那一刻由服务端查询，永远不会下发到浏览器 ✓
-- ---------------------------------------------------------------------------
alter table public.invites enable row level security;

-- 顺手清掉可能存在的旧 policy（保证"无 policy"这个状态）
drop policy if exists "invites_admin_read" on public.invites;
drop policy if exists "invites_admin_write" on public.invites;
drop policy if exists "invites_public_read" on public.invites;

comment on table public.invites is
  '站内邀请：token 由服务端生成与校验，RLS 全拒（只有 service_role 能访问）';
