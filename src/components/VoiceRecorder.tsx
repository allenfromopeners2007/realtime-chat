"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CloseIcon, MicIcon, StopIcon } from "@/components/icons";
import { cn } from "@/lib/format";
import {
  MAX_VOICE_MS,
  MIN_VOICE_MS,
  canRecordVoice,
  describeRecorderError,
  formatDuration,
  pickVoiceMime,
  voiceFileName,
} from "@/lib/voice";

type Props = {
  /** 未登录 / 正在发送时禁用 */
  disabled: boolean;
  /** 录音结束（未取消）后回调：给出文件与真实时长 */
  onRecorded: (file: File, durationMs: number) => void;
  onError: (message: string) => void;
  /** 通知父组件"正在录音"，父组件据此隐藏其它输入控件 */
  onRecordingChange?: (recording: boolean) => void;
};

/**
 * 语音消息录制按钮。
 *
 * 交互：点 🎤 → 浏览器请求麦克风权限 → 开始录音（显示计时）→
 *     点「完成」结束并上传，或点「取消」丢弃。
 *
 * ⚠️ 只能在**真实浏览器**里工作：
 *   - 需要 HTTPS（本项目已满足）
 *   - 需要用户授权麦克风 —— DeepSeek 内置浏览器会直接拒绝所有网页权限，
 *     所以测试必须用 Edge / Chrome。
 */
export function VoiceRecorder({ disabled, onRecorded, onError, onRecordingChange }: Props) {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  // 用 ref 保存最新回调，避免把它们放进 useCallback 依赖里造成频繁重建
  const onRecordedRef = useRef(onRecorded);
  const onErrorRef = useRef(onError);
  const onRecordingChangeRef = useRef(onRecordingChange);

  useEffect(() => {
    onRecordedRef.current = onRecorded;
    onErrorRef.current = onError;
    onRecordingChangeRef.current = onRecordingChange;
  }, [onRecorded, onError, onRecordingChange]);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const setRecordingState = useCallback((value: boolean) => {
    setRecording(value);
    onRecordingChangeRef.current?.(value);
  }, []);

  /** 结束录音；cancelled = true 表示丢弃这段录音 */
  const stop = useCallback(
    (cancelled: boolean) => {
      cancelledRef.current = cancelled;
      stopTimer();

      const recorder = recorderRef.current;
      recorderRef.current = null;

      if (recorder && recorder.state !== "inactive") {
        // onstop 里会做上传 / 丢弃
        recorder.stop();
        return;
      }

      releaseStream();
      setRecordingState(false);
      setElapsedMs(0);
    },
    [releaseStream, setRecordingState, stopTimer],
  );

  // 组件卸载（或切换页面）时释放麦克风，否则标签页会一直显示"正在录音"
  useEffect(() => {
    return () => {
      stopTimer();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        cancelledRef.current = true;
        try {
          recorder.stop();
        } catch {
          // 已经停了，忽略
        }
      }
      releaseStream();
    };
  }, [releaseStream, stopTimer]);

  async function start() {
    if (disabled || recording) return;

    if (!canRecordVoice()) {
      onError("这个浏览器不能录音：请用 Edge / Chrome 打开，且必须是 https 地址");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      console.error("[voice] 获取麦克风失败", error);
      onError(describeRecorderError(error));
      return;
    }

    // 优先 mp4（iPhone 也能播），退而求其次 webm/ogg
    const mime = pickVoiceMime((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (mime === null) {
      stream.getTracks().forEach((track) => track.stop());
      onError("这个浏览器没有可用的录音格式，请用 Edge / Chrome");
      return;
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: mime });
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      console.error("[voice] 创建 MediaRecorder 失败", error);
      onError(describeRecorderError(error));
      return;
    }

    chunksRef.current = [];
    cancelledRef.current = false;
    streamRef.current = stream;
    startedAtRef.current = Date.now();
    setElapsedMs(0);

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onerror = (event) => {
      console.error("[voice] 录音出错", event);
      onError("录音过程中出错，请重试");
      stop(true);
    };

    recorder.onstop = () => {
      const durationMs = Date.now() - startedAtRef.current;
      const chunks = chunksRef.current;
      chunksRef.current = [];
      releaseStream();
      setRecordingState(false);
      setElapsedMs(0);

      if (cancelledRef.current) return;

      if (durationMs < MIN_VOICE_MS) {
        onErrorRef.current("录音太短了，请多说一会儿");
        return;
      }

      const blob = new Blob(chunks, { type: mime });
      if (blob.size === 0) {
        onErrorRef.current("没有录到声音，请检查麦克风是否正常");
        return;
      }

      // 文件名必须是 ASCII（中文名会被 Supabase Storage 拒绝），扩展名按格式给
      const file = new File([blob], voiceFileName(mime, Date.now()), { type: mime.split(";")[0] });
      onRecordedRef.current(file, durationMs);
    };

    recorderRef.current = recorder;
    recorder.start();
    setRecordingState(true);

    // 计时 + 到上限自动结束（自动发送，不丢弃）
    timerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      setElapsedMs(elapsed);
      if (elapsed >= MAX_VOICE_MS) stop(false);
    }, 200);
  }

  if (recording) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
        </span>

        <span className="shrink-0 tabular-nums text-sm font-medium text-rose-100">
          {formatDuration(elapsedMs)}
        </span>
        <span className="hidden shrink-0 text-[11px] text-rose-200/60 sm:inline">
          / 最长 {formatDuration(MAX_VOICE_MS)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-rose-200/70">正在录音…</span>

        <button
          type="button"
          onClick={() => stop(true)}
          className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-rose-100 transition hover:bg-rose-500/20"
          aria-label="取消录音"
        >
          <CloseIcon className="h-3.5 w-3.5" />
          取消
        </button>

        <button
          type="button"
          onClick={() => stop(false)}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-rose-500 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-rose-400"
          aria-label="完成录音"
        >
          <StopIcon className="h-3.5 w-3.5" />
          完成
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void start()}
      disabled={disabled}
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-300 transition hover:bg-ink-800 hover:text-ink-100",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
      )}
      aria-label="录制语音消息"
      title="录制语音消息（最长 2 分钟）"
    >
      <MicIcon className="h-5 w-5" />
    </button>
  );
}
