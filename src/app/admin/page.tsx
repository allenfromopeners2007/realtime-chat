import Link from "next/link";

import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { AlertIcon, LockIcon } from "@/components/icons";
import { isSupabaseConfigured } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "管理后台 · 实时聊天室",
};

function Notice({
  title,
  detail,
  tone = "warn",
}: {
  title: string;
  detail: string;
  tone?: "warn" | "deny";
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-ink-950 px-4 py-10">
      <div
        className={
          tone === "deny"
            ? "w-full max-w-lg rounded-3xl border border-rose-500/30 bg-rose-500/5 p-6"
            : "w-full max-w-lg rounded-3xl border border-amber-500/25 bg-amber-500/5 p-6"
        }
      >
        <div
          className={
            tone === "deny"
              ? "mb-3 flex items-center gap-2 text-rose-200"
              : "mb-3 flex items-center gap-2 text-amber-200"
          }
        >
          {tone === "deny" ? <LockIcon className="h-5 w-5" /> : <AlertIcon className="h-5 w-5" />}
          <h1 className="text-sm font-semibold">{title}</h1>
        </div>
        <p className="text-xs leading-relaxed text-ink-300">{detail}</p>
        <pre className="scrollbar-thin mt-4 overflow-x-auto rounded-2xl border border-ink-800 bg-ink-950/80 p-4 text-[11px] leading-relaxed text-ink-400">
{`-- 把某个账号设为管理员（在 Supabase SQL Editor 里执行）
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = '你的邮箱@example.com');`}
        </pre>
        <Link
          href="/"
          className="mt-5 inline-flex h-10 items-center rounded-xl border border-ink-700 px-4 text-sm text-ink-200 transition hover:border-brand-500/50 hover:text-white"
        >
          回到聊天室
        </Link>
      </div>
    </main>
  );
}

export default async function AdminPage() {
  if (!isSupabaseConfigured) {
    return <Notice title="Supabase 尚未配置" detail="请先填写 .env.local 并重启开发服务器。" />;
  }

  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <Notice title="请先登录" detail="管理后台需要登录，并且账号必须具备管理员身份。" />;
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, username, is_banned")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return (
      <Notice
        title="读取权限失败"
        detail={`${error.message}。如果提示字段 role 不存在，请先在 SQL Editor 执行 supabase/admin-migration.sql。`}
      />
    );
  }

  if (profile?.role !== "admin") {
    return (
      <Notice
        tone="deny"
        title="需要管理员权限"
        detail="你的账号目前是普通成员。用下面的 SQL 把某个账号提升为管理员（记得把邮箱换成你的），然后刷新本页。"
      />
    );
  }

  return <AdminDashboard admin={{ id: user.id, name: String(profile.username ?? "") }} />;
}
