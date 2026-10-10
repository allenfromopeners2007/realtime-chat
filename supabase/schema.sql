-- ============================================================================
--  实时聊天室 · Supabase 初始化脚本
--  用法：Supabase 控制台 → SQL Editor → 新建查询 → 整段粘贴 → Run
--  可以重复执行（幂等）。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. 扩展
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. 用户资料（和 auth.users 一对一）
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. 群组
-- ---------------------------------------------------------------------------
create table if not exists public.rooms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. 消息
--    author_name / author_avatar 冗余存一份：
--    Realtime 推送的 payload 只带本表字段，不带 join 结果，
--    冗余之后前端收到推送就能直接渲染，不用再查一次。
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms (id) on delete cascade,
  user_id       uuid references auth.users (id) on delete set null,
  author_name   text not null default '匿名用户',
  author_avatar text,
  content       text not null default '',
  attachment    jsonb,
  created_at    timestamptz not null default now(),
  constraint messages_content_or_attachment
    check (content <> '' or attachment is not null),
  constraint messages_content_length
    check (char_length(content) <= 4000)
);

create index if not exists messages_room_created_idx
  on public.messages (room_id, created_at desc);
create index if not exists messages_created_idx
  on public.messages (created_at desc);

-- 消息内容模糊搜索（ilike '%关键字%'）的加速索引。
-- pg_trgm 不可用时自动跳过，搜索依然能用，只是慢一点。
do $$
begin
  create extension if not exists pg_trgm;
  create index if not exists messages_content_trgm_idx
    on public.messages using gin (content gin_trgm_ops);
exception
  when others then
    raise notice '跳过 pg_trgm 索引：%', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- 4. 行级安全（RLS）
--    规则：所有人都能读；只有登录用户能以自己的身份发言。
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.rooms    enable row level security;
alter table public.messages enable row level security;

-- profiles
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select using (true);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- rooms
drop policy if exists "rooms_select_all" on public.rooms;
create policy "rooms_select_all" on public.rooms
  for select using (true);

drop policy if exists "rooms_insert_authenticated" on public.rooms;
create policy "rooms_insert_authenticated" on public.rooms
  for insert to authenticated with check (auth.uid() = created_by);

-- messages
drop policy if exists "messages_select_all" on public.messages;
create policy "messages_select_all" on public.messages
  for select using (true);

drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own" on public.messages
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "messages_delete_own" on public.messages;
create policy "messages_delete_own" on public.messages
  for delete to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5. 注册时自动建档案
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(coalesce(new.email, 'user'), '@', 1)
    ),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 6. Storage：图片 / 文件附件
--    bucket 公开可读，但只有登录用户能写，且只能写进自己的 <uid>/ 目录。
--    路径由 /api/upload 生成为：<uid>/<年>/<月>/<时间戳>-<随机>-<文件名>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-attachments', 'chat-attachments', true, 10485760)
on conflict (id) do update
  set public = true,
      file_size_limit = 10485760;

drop policy if exists "chat_attachments_read" on storage.objects;
create policy "chat_attachments_read" on storage.objects
  for select using (bucket_id = 'chat-attachments');

drop policy if exists "chat_attachments_insert_own_folder" on storage.objects;
create policy "chat_attachments_insert_own_folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "chat_attachments_delete_own_folder" on storage.objects;
create policy "chat_attachments_delete_own_folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 7. Realtime：把 messages 加入实时发布
-- ---------------------------------------------------------------------------
alter table public.messages replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;   -- 已经添加过，忽略
  when undefined_object then
    raise notice '没有找到 supabase_realtime 发布，请在控制台 Database → Replication 里手动打开 messages 表';
end $$;

-- ---------------------------------------------------------------------------
-- 8. 初始群组
-- ---------------------------------------------------------------------------
insert into public.rooms (name, description)
values
  ('大厅', '所有人都在这里'),
  ('产品讨论', '需求、原型、评审')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- 9. 自检（可选）：执行完可以跑一下这两句确认
-- ---------------------------------------------------------------------------
-- select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- select id, name, public from storage.buckets where id = 'chat-attachments';
