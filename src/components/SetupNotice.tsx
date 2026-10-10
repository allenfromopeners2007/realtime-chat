import Link from "next/link";

import { AlertIcon, ChatIcon } from "@/components/icons";
import { SUPABASE_SETUP_HINT } from "@/lib/env";

/** 没有配置 Supabase 环境变量时展示的引导页，避免直接白屏报错 */
export function SetupNotice() {
  const steps = [
    {
      title: "创建 Supabase 项目",
      detail: "打开 supabase.com → New project，等它初始化完成。",
    },
    {
      title: "执行建表脚本",
      detail: "SQL Editor 里粘贴并运行仓库中的 supabase/schema.sql（会创建表、RLS 策略、Storage bucket 和 Realtime 发布）。",
    },
    {
      title: "填写环境变量",
      detail:
        "复制 .env.local.example 为 .env.local（Windows：copy .env.local.example .env.local），填上 Project URL 和 Publishable key（旧版界面叫 anon public key），然后重启开发服务器。",
    },
  ];

  return (
    <main className="grid min-h-dvh place-items-center bg-ink-950 px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/25">
            <ChatIcon className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-ink-100">实时聊天室</h1>
            <p className="text-xs text-ink-400">Next.js + Tailwind CSS + Supabase</p>
          </div>
        </div>

        <div className="rounded-3xl border border-amber-500/25 bg-amber-500/5 p-6">
          <div className="mb-4 flex items-center gap-2 text-amber-200">
            <AlertIcon className="h-5 w-5" />
            <p className="text-sm font-medium">还差一步：Supabase 尚未配置</p>
          </div>

          <pre className="scrollbar-thin mb-5 overflow-x-auto rounded-2xl border border-ink-800 bg-ink-950/80 p-4 text-[11px] leading-relaxed text-ink-300">
            {SUPABASE_SETUP_HINT}
          </pre>

          <ol className="space-y-4">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-800 text-xs font-semibold text-ink-200">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm text-ink-100">{step.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-400">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>

          <Link
            href="/login"
            className="mt-6 inline-flex h-10 items-center rounded-xl border border-ink-700 px-4 text-sm text-ink-200 transition hover:border-brand-500/50 hover:text-white"
          >
            先去登录页看看
          </Link>
        </div>
      </div>
    </main>
  );
}
