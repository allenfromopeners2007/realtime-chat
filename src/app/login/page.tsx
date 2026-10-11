"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AlertIcon, ChatIcon, CheckIcon, SpinnerIcon } from "@/components/icons";
import { isSupabaseConfigured } from "@/lib/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    if (!isSupabaseConfigured) {
      setFeedback({ kind: "error", text: "Supabase 还没有配置，请先填写 .env.local" });
      return;
    }
    if (password.length < 6) {
      setFeedback({ kind: "error", text: "密码至少 6 位（Supabase 默认要求）" });
      return;
    }

    setPending(true);
    setFeedback(null);

    try {
      const supabase = getSupabaseBrowserClient();

      if (mode === "signup") {
        const trimmedName = username.trim();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: trimmedName === "" ? undefined : { username: trimmedName },
          },
        });
        if (error) throw error;

        if (data.session) {
          router.replace("/");
          router.refresh();
          return;
        }
        setFeedback({
          kind: "success",
          text: "注册成功！如果项目开启了邮箱验证，请先去邮箱点确认链接，再回来登录。",
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/");
        router.refresh();
      }
    } catch (error) {
      console.error("[login] 认证失败", error);
      setFeedback({
        kind: "error",
        text: error instanceof Error ? error.message : "登录失败，详情见控制台",
      });
    } finally {
      setPending(false);
    }
  }

  const inputClass =
    "h-11 w-full rounded-xl border border-ink-800 bg-ink-950 px-3.5 text-sm text-ink-100 outline-none transition placeholder:text-ink-500 focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/20";

  return (
    <main className="grid min-h-dvh place-items-center bg-ink-950 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/25">
            <ChatIcon className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-ink-100">
              {mode === "signin" ? "登录后开始聊天" : "创建一个账号"}
            </h1>
            <p className="mt-1 text-xs text-ink-400">登录后才能查看聊天记录并发言</p>
          </div>
        </div>

        <div className="rounded-3xl border border-ink-800 bg-ink-900/60 p-5 shadow-2xl shadow-black/40">
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-ink-950 p-1">
            {(["signin", "signup"] as Mode[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setMode(item);
                  setFeedback(null);
                }}
                className={
                  item === mode
                    ? "rounded-lg bg-brand-500/20 py-2 text-xs font-medium text-brand-100"
                    : "rounded-lg py-2 text-xs text-ink-400 transition hover:text-ink-100"
                }
              >
                {item === "signin" ? "登录" : "注册"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="昵称（可留空，默认用邮箱前缀）"
                maxLength={24}
                className={inputClass}
              />
            )}

            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="邮箱"
              autoComplete="email"
              className={inputClass}
            />

            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="密码（至少 6 位）"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              className={inputClass}
            />

            {feedback && (
              <div
                className={
                  feedback.kind === "error"
                    ? "flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs leading-relaxed text-rose-100"
                    : "flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs leading-relaxed text-emerald-100"
                }
              >
                {feedback.kind === "error" ? (
                  <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                ) : (
                  <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                )}
                <span>{feedback.text}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 text-sm font-medium text-white shadow-lg shadow-brand-500/25 transition hover:bg-brand-400 disabled:bg-ink-800 disabled:text-ink-500 disabled:shadow-none"
            >
              {pending && <SpinnerIcon className="h-4 w-4 animate-spin" />}
              {mode === "signin" ? "登录" : "注册并登录"}
            </button>
          </form>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-ink-500">
            没有账号也可以
            <Link href="/" className="mx-1 text-brand-300 underline-offset-2 hover:underline">
              先随便看看
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
