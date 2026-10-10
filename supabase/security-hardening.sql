-- ============================================================================
--  安全加固 · 可选迁移（建议执行）
--  前置：schema.sql → admin-migration.sql → rooms-migration.sql 都跑过了
--  可以重复执行（幂等）
-- ============================================================================

-- 前置检查
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'is_admin') then
    raise exception '请先执行 supabase/admin-migration.sql（本脚本依赖它）';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. 聊天记录改成「登录才能读」
--
--    原来 messages_select_all 是 using(true)：配合公开的 anon key，
--    等于**任何打开过你网站的人（甚至不用登录）都能用一句 REST 调用拉走全部聊天记录**。
--    改成 to authenticated 之后，未登录访客读不到任何一条消息。
-- ---------------------------------------------------------------------------
drop policy if exists "messages_select_all" on public.messages;
drop policy if exists "messages_select_authenticated" on public.messages;
create policy "messages_select_authenticated" on public.messages
  for select to authenticated using (true);

-- 顺手可选：成员名单也只给登录用户看（需要的话把下面两行的注释去掉）
-- drop policy if exists "profiles_select_all" on public.profiles;
-- create policy "profiles_select_authenticated" on public.profiles
--   for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 2. 发言频率限制：每人每 10 秒最多 5 条
--
--    在数据库层强制执行 —— 改前端代码、直接调 REST 接口都绕不过去。
--    没有这一层的话，一个注册账号就能一天刷几万条。
-- ---------------------------------------------------------------------------
create index if not exists messages_user_created_idx
  on public.messages (user_id, created_at desc);

create or replace function public.messages_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  -- 没有 JWT 的场景（后台导入 / SQL 直接插入）不限制
  if auth.uid() is null then
    return new;
  end if;

  select count(*) into recent_count
  from public.messages
  where user_id = auth.uid()
    and created_at > now() - interval '10 seconds';

  if recent_count >= 5 then
    raise exception '发言太快了，请等几秒再发（每 10 秒最多 5 条）';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_rate_limit on public.messages;
create trigger messages_rate_limit
  before insert on public.messages
  for each row execute function public.messages_rate_limit();

-- ---------------------------------------------------------------------------
-- 3. 自检
-- ---------------------------------------------------------------------------
-- 看消息表的策略（应该只剩 insert / delete / select_authenticated 三条）：
--   select policyname, cmd, roles from pg_policies where tablename = 'messages';
-- 看限流触发器：
--   select tgname from pg_trigger where tgrelid = 'public.messages'::regclass and not tgisinternal;
-- 整套越权测试（推荐）：
--   npm run audit:security
