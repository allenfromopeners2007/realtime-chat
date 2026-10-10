-- ============================================================================
--  群组管理 · 增量迁移（置顶公告 + 只允许管理员建群）
--  前置条件：必须先执行过 supabase/admin-migration.sql（需要 is_admin 函数）
--  可以重复执行（幂等）
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. 前置检查：没有 is_admin 就先报个明白的错误
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'is_admin') then
    raise exception '请先执行 supabase/admin-migration.sql（本脚本依赖它创建的 is_admin 函数）';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. rooms 增加公告字段
--    announcement_by_name 是冗余的展示名，避免每次读公告都要 join profiles
-- ---------------------------------------------------------------------------
alter table public.rooms add column if not exists announcement         text;
alter table public.rooms add column if not exists announcement_at      timestamptz;
alter table public.rooms add column if not exists announcement_by_name text;

do $$
begin
  alter table public.rooms
    add constraint rooms_announcement_length check (char_length(coalesce(announcement, '')) <= 500);
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. 只允许管理员建群
--    原来任何登录用户都能建群（rooms_insert_authenticated）。
--    admin-migration 里的 rooms_admin_write 策略已经允许管理员增删改，
--    所以这里只要把"普通用户也能建"那条策略删掉即可。
-- ---------------------------------------------------------------------------
drop policy if exists "rooms_insert_authenticated" on public.rooms;
drop policy if exists "rooms_insert_admin" on public.rooms;
create policy "rooms_insert_admin" on public.rooms
  for insert to authenticated
  with check (auth.uid() = created_by and public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. 顺手把现有群组的公告字段初始化为 NULL（新列默认就是 NULL，这里只是显式说明）
-- ---------------------------------------------------------------------------
update public.rooms set announcement = null where announcement = '';

-- ---------------------------------------------------------------------------
-- 4. 自检
-- ---------------------------------------------------------------------------
-- 看群组和公告：
--   select name, description, announcement, announcement_by_name from public.rooms order by created_at;
-- 看策略（应该只剩 rooms_select_all / rooms_admin_write / rooms_insert_admin）：
--   select policyname, cmd from pg_policies where tablename = 'rooms';
