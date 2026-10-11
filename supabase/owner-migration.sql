-- ============================================================================
-- owner-migration.sql —— 给站长一个"最高权限"（owner = 所有者）
--
-- 解决的问题：
--   现在有多个 admin 时，任何一个 admin 都能把别人（包括站长）降级 ✗
--   本迁移引入 owner 角色：
--     ① 只有 owner 能任免管理员（admin）
--     ② owner 不能被降级、不能被封禁
--     ③ owner 拥有 admin 的全部能力（is_admin 把 owner 也算上）
--     ④ 原有规则全部保留：至少一个管理员、不能封禁管理员、封禁时间戳维护
--
-- 执行位置：Supabase → SQL Editor → 整段粘贴 → Run
-- 可以重复执行（幂等 ✓）
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. 允许 owner 这个角色值
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('owner', 'admin', 'member'));

-- ---------------------------------------------------------------------------
-- 2. is_admin() 把 owner 也算作管理员
--    （这样所有现有的管理员功能，owner 都照常能用，不用再改一遍策略）
-- ---------------------------------------------------------------------------
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role in ('admin', 'owner')
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. 新增 is_owner()
-- ---------------------------------------------------------------------------
create or replace function public.is_owner(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'owner'
  );
$$;

revoke all on function public.is_admin(uuid) from public;
revoke all on function public.is_owner(uuid) from public;
grant execute on function public.is_admin(uuid) to anon, authenticated;
grant execute on function public.is_owner(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. 守卫触发器：把 owner 的规则加进去
--
--    注意 auth.uid()：
--      从网站来的改动 → auth.uid() 是操作者的 id → 严格按规则校验 ✓
--      从 SQL Editor 来的改动 → auth.uid() 是 NULL → 视为"root 通道"放行
--        （初始化和救援都需要它；这也是给站长留的后门 ✓）
-- ---------------------------------------------------------------------------
create or replace function public.admin_guard_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  admin_count integer;
begin
  -- 4.1 只有 owner 能改角色
  if actor is not null and new.role is distinct from old.role then
    if not public.is_owner(actor) then
      raise exception '只有所有者可以任免管理员' using errcode = 'P0001';
    end if;
  end if;

  -- 4.2 owner 不能被降级 / 被封禁
  if actor is not null and old.role = 'owner' then
    if new.role is distinct from 'owner' then
      raise exception '所有者不能被降级；要转移所有权请在 SQL Editor 里执行 update' using errcode = 'P0001';
    end if;
    if new.is_banned then
      raise exception '所有者不能被禁言或封禁' using errcode = 'P0001';
    end if;
  end if;

  -- 4.3 至少保留一个管理员（owner 也算管理员）
  select count(*) into admin_count
  from public.profiles
  where role in ('admin', 'owner');

  if old.role in ('admin', 'owner')
     and new.role not in ('admin', 'owner')
     and admin_count <= 1 then
    raise exception '至少要保留一个管理员' using errcode = 'P0001';
  end if;

  -- 4.4 管理员不能被封禁（沿用原规则）
  if new.is_banned and new.role in ('admin', 'owner') then
    raise exception '不能封禁管理员，请先取消其管理员身份' using errcode = 'P0001';
  end if;

  -- 4.5 维护封禁时间戳（沿用原规则）
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
-- 5. 新项目里"第一个注册的人"直接成为 owner（而不是 admin）
--    已经有人注册时不会触发任何改动 ✓
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  should_be_admin boolean;
begin
  select not exists (select 1 from public.profiles where role in ('admin', 'owner'))
    into should_be_admin;

  insert into public.profiles (id, username, avatar_url, role)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
      split_part(new.email, '@', 1),
      '新同学'
    ),
    nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), ''),
    case when should_be_admin then 'owner' else 'member' end
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
-- 6. 把站长设为 owner（按 uid 找；找不到再按邮箱找）
-- ---------------------------------------------------------------------------
do $$
declare
  target uuid;
begin
  select id into target
  from public.profiles
  where id = 'b3902f5d-95a1-4265-83f3-52f8a1b84901';   -- Allen 的 uid

  if target is null then
    select p.id into target
    from public.profiles p
    join auth.users u on u.id = p.id
    where lower(u.email) = lower('allenfromopeners@163.com');
  end if;

  if target is null then
    raise exception '没找到站长账号。请手动执行：update public.profiles set role = ''owner'' where id = ''<你的 uid>'';';
  end if;

  update public.profiles set role = 'owner' where id = target;
  raise notice '已把 % 设为所有者(owner)', target;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- 7. 执行完请核对（把下面几行单独选中跑一次）
-- ---------------------------------------------------------------------------
-- select username, role, is_banned from public.profiles order by created_at asc;
-- select public.is_owner();          -- 用站长账号登录网站时调用应返回 true（SQL Editor 里是匿名）
-- select public.is_admin();          -- 同上
