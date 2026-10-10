-- ============================================================================
--  管理员功能 · 增量迁移
--  在已经执行过 schema.sql 的项目上运行；可以重复执行（幂等）
--  Supabase 控制台 → SQL Editor → 粘贴 → Run
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. profiles 增加管理相关字段
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists role          text        not null default 'member';
alter table public.profiles add column if not exists is_banned     boolean     not null default false;
alter table public.profiles add column if not exists banned_at     timestamptz;
alter table public.profiles add column if not exists banned_reason text;

do $$
begin
  alter table public.profiles
    add constraint profiles_role_check check (role in ('admin', 'member'));
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. 辅助函数（security definer：以 postgres 身份运行，绕过 RLS，避免策略递归）
-- ---------------------------------------------------------------------------
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = uid and p.role = 'admin');
$$;

create or replace function public.is_banned(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = uid and p.is_banned);
$$;

revoke all on function public.is_admin(uuid) from public;
revoke all on function public.is_banned(uuid) from public;
grant execute on function public.is_admin(uuid) to anon, authenticated;
grant execute on function public.is_banned(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. 被禁言的用户发不出消息（由数据库强制执行，前端绕不过）
-- ---------------------------------------------------------------------------
drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own" on public.messages
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and not public.is_banned(auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 4. 删消息：作者本人 或 管理员
-- ---------------------------------------------------------------------------
drop policy if exists "messages_delete_own" on public.messages;
drop policy if exists "messages_delete_own_or_admin" on public.messages;
create policy "messages_delete_own_or_admin" on public.messages
  for delete to authenticated
  using (auth.uid() = user_id or public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. profiles：改成「只有管理员能改」
--    原来允许用户改自己的行 —— 那等于任何人执行
--    `update profiles set role='admin' where id=auth.uid()` 就能自我提权。
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_update_self" on public.profiles;
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 6. rooms：管理员可以改 / 删（删群组会连带删掉该群所有消息，外键 on delete cascade）
-- ---------------------------------------------------------------------------
drop policy if exists "rooms_admin_write" on public.rooms;
create policy "rooms_admin_write" on public.rooms
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 7. Storage：管理员可以删任何附件（普通用户仍然只能删自己目录里的）
-- ---------------------------------------------------------------------------
drop policy if exists "chat_attachments_delete_admin" on storage.objects;
create policy "chat_attachments_delete_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat-attachments' and public.is_admin());

-- ---------------------------------------------------------------------------
-- 8. 管理员专用查询：用户列表（含邮箱、最后登录、消息数）
--    只能管理员调用，非管理员调用返回空集
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_users()
returns table (
  id               uuid,
  username         text,
  email            text,
  role             text,
  is_banned        boolean,
  banned_reason    text,
  created_at       timestamptz,
  last_sign_in_at  timestamptz,
  message_count    bigint
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.id,
         p.username,
         u.email,
         p.role,
         p.is_banned,
         p.banned_reason,
         p.created_at,
         u.last_sign_in_at,
         (select count(*) from public.messages m where m.user_id = p.id)
  from public.profiles p
  left join auth.users u on u.id = p.id
  where public.is_admin(auth.uid())
  order by p.created_at asc;
$$;

-- ---------------------------------------------------------------------------
-- 9. 管理员专用查询：群组列表（含消息数、最后活跃时间）
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_rooms()
returns table (
  id              uuid,
  name            text,
  description     text,
  created_at      timestamptz,
  message_count   bigint,
  last_message_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id,
         r.name,
         r.description,
         r.created_at,
         (select count(*) from public.messages m where m.room_id = r.id),
         (select max(m.created_at) from public.messages m where m.room_id = r.id)
  from public.rooms r
  where public.is_admin(auth.uid())
  order by r.created_at asc;
$$;

revoke all on function public.admin_list_users() from public;
revoke all on function public.admin_list_rooms() from public;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_list_rooms() to authenticated;

-- ---------------------------------------------------------------------------
-- 10. 保护措施：不能把最后一个管理员降级，也不能封禁管理员
-- ---------------------------------------------------------------------------
create or replace function public.admin_guard_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'admin' and new.role is distinct from 'admin' then
    if (select count(*) from public.profiles where role = 'admin') <= 1 then
      raise exception '至少要保留一个管理员';
    end if;
  end if;

  if new.is_banned and new.role = 'admin' then
    raise exception '不能封禁管理员，请先取消其管理员身份';
  end if;

  if new.is_banned and not old.is_banned then
    new.banned_at := now();
  elsif not new.is_banned then
    new.banned_at := null;
    new.banned_reason := null;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_admin_guard on public.profiles;
create trigger profiles_admin_guard
  before update on public.profiles
  for each row execute function public.admin_guard_profile();

-- ---------------------------------------------------------------------------
-- 11. 管理员是怎么产生的
--     a) 现在就把最早注册的用户提升为管理员（如果还没有管理员）
--     b) 改造注册触发器：**第一个注册的人自动成为管理员**
--        这样全新项目跑完迁移后，注册的第一个账号就是站长，不需要手动改 SQL
-- ---------------------------------------------------------------------------
do $$
declare
  promoted uuid;
begin
  if not exists (select 1 from public.profiles where role = 'admin') then
    select id into promoted from public.profiles order by created_at asc limit 1;
    if promoted is not null then
      update public.profiles set role = 'admin' where id = promoted;
      raise notice '已把最早注册的用户提升为管理员：%', promoted;
    end if;
  end if;
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  should_be_admin boolean;
begin
  -- 目前一个管理员都没有 → 这个新用户就是站长
  should_be_admin := not exists (select 1 from public.profiles where role = 'admin');

  insert into public.profiles (id, username, avatar_url, role)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(coalesce(new.email, 'user'), '@', 1)
    ),
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    case when should_be_admin then 'admin' else 'member' end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- 触发器如果不存在就建上（schema.sql 里已经建过，这里是双保险）
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 手动指定管理员（把邮箱换成你的）：
-- update public.profiles set role = 'admin'
-- where id = (select id from auth.users where email = 'me@test.com');

-- ---------------------------------------------------------------------------
-- 12. 自检
-- ---------------------------------------------------------------------------
-- select username, role, is_banned from public.profiles order by created_at;
