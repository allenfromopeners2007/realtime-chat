"use client";

import { useEffect, useRef, useState } from "react";

import { Avatar } from "@/components/Avatar";
import { MicIcon, PhoneIcon, PhoneOffIcon } from "@/components/icons";
import { cn } from "@/lib/format";
import type { CallState } from "@/lib/useCall";
import { formatDuration } from "@/lib/voice";

type Props = {
  state: CallState;
  remoteStream: MediaStream | null;
  onAccept: () => void;
  onReject: () => void;
  onHangUp: () => void;
  onToggleMute: () => void;
  /** 没配 TURN 时给一句提示（部分网络会连不上） */
  turnConfigured: boolean;
};

/**
 * 通话界面：来电弹窗 + 通话中浮层 + 承载远端音频的隐藏 audio 标签。
 *
 * 为什么要一个隐藏 audio：WebRTC 收到的远端音轨要通过 <audio> 播放出来，
 * 直接 <audio srcObject> 在 React 里要用 ref 赋值（srcObject 不是 attribute）。
 */
export function CallOverlay({
  state,
  remoteStream,
  onAccept,
  onReject,
  onHangUp,
  onToggleMute,
  turnConfigured,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [tick, setTick] = useState(0);

  // 把远端音频接到 <audio> 上并播放
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.srcObject = remoteStream;
    if (remoteStream) {
      void audio.play().catch((error) => {
        console.warn("[call] 远端音频自动播放被拦截，需要用户点一下页面", error);
      });
    }
  }, [remoteStream]);

  // 通话中每秒刷新一次计时
  useEffect(() => {
    if (state.phase === "idle") return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [state.phase]);

  // 只有"结束"才需要提示，进行中的状态都由界面表达
  if (state.phase === "idle") {
    return <audio ref={audioRef} autoPlay className="hidden" />;
  }

  const elapsed = state.startedAt > 0 ? Date.now() - state.startedAt : 0;
  const durationText = formatDuration(elapsed);

  // ---------- 来电弹窗 ----------
  if (state.phase === "ringing") {
    return (
      <>
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="animate-pop-in w-full max-w-xs rounded-3xl border border-ink-800 bg-ink-900 p-6 text-center shadow-2xl">
            <div className="relative mx-auto h-20 w-20">
              <span className="absolute inset-0 animate-ping rounded-full bg-brand-500/30" />
              <span className="relative grid h-20 w-20 place-items-center">
                <Avatar name={state.peerName} url={null} size={72} />
              </span>
            </div>

            <p className="mt-4 text-base font-semibold text-ink-100">{state.peerName}</p>
            <p className="mt-1 text-xs text-ink-400">语音通话来电…</p>

            <div className="mt-6 flex items-center justify-center gap-8">
              <button
                type="button"
                onClick={onReject}
                className="flex flex-col items-center gap-1.5 text-ink-300 transition hover:text-ink-100"
                aria-label="拒绝"
              >
                <span className="grid h-14 w-14 place-items-center rounded-full bg-rose-500/90 text-white shadow-lg shadow-rose-500/25 transition hover:bg-rose-400">
                  <PhoneOffIcon className="h-6 w-6" />
                </span>
                <span className="text-[11px]">拒绝</span>
              </button>

              <button
                type="button"
                onClick={onAccept}
                className="flex flex-col items-center gap-1.5 text-ink-300 transition hover:text-ink-100"
                aria-label="接听"
              >
                <span className="grid h-14 w-14 animate-bounce place-items-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-400">
                  <PhoneIcon className="h-6 w-6" />
                </span>
                <span className="text-[11px]">接听</span>
              </button>
            </div>

            <audio ref={audioRef} autoPlay className="hidden" />
          </div>
        </div>
      </>
    );
  }

  // ---------- 呼叫中 / 通话中浮层 ----------
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-20 z-[75] flex justify-center px-4">
        <div className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-ink-700 bg-ink-900/95 px-3 py-2.5 shadow-2xl shadow-black/50 backdrop-blur">
          <Avatar name={state.peerName} url={null} size={36} />

          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-ink-100">{state.peerName}</p>
            <p className="flex items-center gap-1.5 text-[11px] text-ink-400">
              {state.phase === "active" ? (
                <>
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  通话中 {durationText}
                </>
              ) : (
                <>
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                  {state.detail || "正在连接…"} {elapsed > 2000 ? durationText : ""}
                </>
              )}
            </p>
          </div>

          {state.phase === "active" && (
            <button
              type="button"
              onClick={onToggleMute}
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-xl transition",
                state.muted
                  ? "bg-amber-500/20 text-amber-200 hover:bg-amber-500/30"
                  : "bg-ink-800 text-ink-300 hover:bg-ink-700 hover:text-ink-100",
              )}
              aria-label={state.muted ? "取消静音" : "静音"}
              title={state.muted ? "取消静音" : "静音"}
            >
              <MicIcon className="h-4 w-4" />
            </button>
          )}

          <button
            type="button"
            onClick={onHangUp}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-500 text-white transition hover:bg-rose-400"
            aria-label="挂断"
            title="挂断"
          >
            <PhoneOffIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!turnConfigured && state.phase === "connecting" && (
        <div className="pointer-events-none fixed inset-x-0 top-36 z-[74] flex justify-center px-4">
          <p className="rounded-full bg-ink-900/90 px-3 py-1 text-[11px] text-ink-400">
            正在尝试直连…（未配置 TURN 服务器时，部分网络可能连不上）
          </p>
        </div>
      )}

      <audio ref={audioRef} autoPlay className="hidden" />
    </>
  );
}
