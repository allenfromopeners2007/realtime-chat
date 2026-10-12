"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ChatIcon, SpinnerIcon } from "@/components/icons";
import { isSupabaseConfigured } from "@/lib/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * 邮件链接的落地点（邀请邮件 / 确认邮件都会跳到这里）。
 *
 * 为什么必须是**客户端页面**，不能是服务端路由：
 *   管理员用接口发邀请时，Supabase 走的是**隐含流程** ——
 *   令牌放在 URL 的 `#access_token=...` **片段**里 ✗
 *   而片段**永远不会发送给服务器** ✗ 所以服务端代码读不到它 ✓
 *   只有浏览器里的 supabase-js 能解析片段并把会话写进 Cookie ✓
 *
 * 同时兼容 `?code=...`（PKCE 流程，客户端发起的注册确认会用它 ✓）。
 *
 * 处理完统一跳到 /welcome 让新同学设置密码 ✓
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("正在确认你的邀请链接…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setFailed(true);
      setMessage("Supabase 还没有配置");
      return;
    }

    const params = new URLSearchParams(window.location.search);

    // 只允许站内跳转，避免开放重定向
    const rawNext = params.get("next") ?? "/welcome";
    const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/welcome";

    const errorDescription = params.get("error_description") ?? params.get("error");
    if (errorDescription) {
      setFailed(true);
      setMessage(errorDescription);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    let cancelled = false;

    async function run() {
      // ① PKCE：带 ?code= 时在浏览器里兑换（验证串 Cookie 是客户端发起流程时种下的）
      const code = params.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (error) {
          setFailed(true);
          setMessage(error.message);
          return;
        }
        router.replace(next);
        return;
      }

      // ② 隐含流程：令牌在 #片段 里，supabase-js 创建时会自动解析。
      //    这里轮询等待会话就绪（网络慢时可能需要几秒）
      let attempt = 0;
      while (!cancelled && attempt < 12) {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session) {
          router.replace(next);
          return;
        }
        attempt += 1;
        if (attempt === 5) setMessage("还在确认，请稍等一下…");
        await new Promise((resolve) => window.setTimeout(resolve, 400));
      }

      if (cancelled) return;
      setFailed(true);
      setMessage("这个链接已经失效或过期了。请找管理员重新发一次邀请。");
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="grid min-h-dvh place-items-center bg-ink-950 px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-ink-800 bg-ink-900/70 p-6 text-center shadow-2xl shadow-black/40">
        <div className="mb-5 flex items-center gap-3 text-left">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/25">
            <ChatIcon className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold text-ink-100">确认邀请</h1>
            <p className="text-[11px] text-ink-500">马上就好</p>
          </div>
        </div>

        {failed ? (
          <div className="space-y-4">
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-200">
              ⚠️ {message}
            </p>
            <Link
              href="/login"
              className="flex w-full items-center justify-center rounded-xl border border-ink-800 bg-ink-900 py-2.5 text-sm text-ink-200 transition hover:border-brand-500/50"
            >
              去登录页
            </Link>
          </div>
        ) : (
          <p className="flex items-center justify-center gap-2 py-4 text-xs text-ink-400">
            <SpinnerIcon className="h-4 w-4 animate-spin" />
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
