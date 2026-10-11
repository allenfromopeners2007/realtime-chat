"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { TURN_CONFIG } from "@/lib/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  MAX_CALL_MS,
  RING_TIMEOUT_MS,
  buildIceServers,
  callChannelName,
  createCallId,
  describeCallEnd,
  describeCallError,
  isBusy,
  parseSignalMessage,
  type CallEndReason,
  type SignalMessage,
} from "@/lib/call";
import type { Member, SessionUser } from "@/lib/types";

/** 通话阶段 */
export type CallPhase = "idle" | "calling" | "ringing" | "connecting" | "active";

export type CallState = {
  phase: CallPhase;
  callId: string;
  peerId: string;
  peerName: string;
  /** 呼叫/通话开始时间（用于计时） */
  startedAt: number;
  /** 是否已静音 */
  muted: boolean;
  /** 界面上的次要提示（比如"正在建立连接…"） */
  detail: string;
};

const IDLE: CallState = {
  phase: "idle",
  callId: "",
  peerId: "",
  peerName: "",
  startedAt: 0,
  muted: false,
  detail: "",
};

/** 建立连接的兜底超时：超过这个时间还没连上就认为失败（多半是需要 TURN） */
const CONNECT_TIMEOUT_MS = 20_000;
/** 连接短暂断开后的宽限期：ICE 有可能自己恢复 */
const DISCONNECT_GRACE_MS = 6_000;

type Options = {
  user: SessionUser | null;
  members: Member[];
  notify: (kind: "success" | "error" | "info", text: string) => void;
};

/**
 * 实时语音通话（一对一，基于浏览器原生 WebRTC）。
 *
 * 信令走 Supabase Realtime 的 **broadcast** 频道，不需要改数据库：
 *   每个用户订阅自己的频道 `call:<我的id>` 接收信令；
 *   给别人发信令时临时订阅对方的频道再 send。
 *
 * 为什么不自建信令服务器：Supabase Realtime 已经通了（而且国内可达），
 * 少维护一个服务、少一处故障点。
 */
export function useCall({ user, members, notify }: Options) {
  const [state, setState] = useState<CallState>(IDLE);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  /** TURN 是否可用（静态配置或服务端换来的短期凭据），用来决定要不要给用户提示 */
  const [turnAvailable, setTurnAvailable] = useState(TURN_CONFIG !== null);

  const stateRef = useRef<CallState>(IDLE);
  // 收到的 ICE 候选可能比 offer/answer 先到，先排队，设置了远端描述再补进去
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const inboxRef = useRef<RealtimeChannel | null>(null);
  const outboxesRef = useRef(new Map<string, { channel: RealtimeChannel; ready: Promise<void> }>());
  const ringTimerRef = useRef<number | null>(null);
  const connectTimerRef = useRef<number | null>(null);
  const disconnectTimerRef = useRef<number | null>(null);
  const maxCallTimerRef = useRef<number | null>(null);
  const membersRef = useRef<Member[]>(members);
  const notifyRef = useRef(notify);

  useEffect(() => {
    membersRef.current = members;
    notifyRef.current = notify;
  }, [members, notify]);

  /** 只在需要时更新 state，同时同步到 ref（信令回调里读 ref，避免闭包过期） */
  const update = useCallback((next: CallState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const clearTimers = useCallback(() => {
    for (const ref of [ringTimerRef, connectTimerRef, disconnectTimerRef, maxCallTimerRef]) {
      if (ref.current !== null) {
        window.clearTimeout(ref.current);
        ref.current = null;
      }
    }
  }, []);

  const releaseLocalStream = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
  }, []);

  const closePeer = useCallback(() => {
    pendingCandidatesRef.current = [];
    try {
      pcRef.current?.close();
    } catch {
      // 已经关过了
    }
    pcRef.current = null;
    setRemoteStream(null);
  }, []);

  /** 结束通话并回到空闲（message 不为空时弹一条提示） */
  const finish = useCallback(
    (reason: CallEndReason | null, message?: string) => {
      const current = stateRef.current;
      const peerName = current.peerName;

      clearTimers();
      closePeer();
      releaseLocalStream();

      // 断开通话用的频道（下次通话会重新建）
      const supabase = getSupabaseBrowserClient();
      for (const { channel } of outboxesRef.current.values()) {
        void supabase.removeChannel(channel);
      }
      outboxesRef.current.clear();

      update(IDLE);

      if (reason !== null) {
        notifyRef.current(reason === "local" ? "info" : "error", describeCallEnd(reason, peerName));
      } else if (message) {
        notifyRef.current("error", message);
      }
    },
    [clearTimers, closePeer, releaseLocalStream, update],
  );

  /** 拿到（或复用）一个可以给某人发信令的频道 */
  const getOutbox = useCallback((peerId: string) => {
    const existing = outboxesRef.current.get(peerId);
    if (existing) return existing;

    const supabase = getSupabaseBrowserClient();
    const channel = supabase.channel(callChannelName(peerId), {
      config: { broadcast: { self: false } },
    });

    const ready = new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("订阅超时")), 8_000);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          window.clearTimeout(timer);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          window.clearTimeout(timer);
          reject(new Error(`订阅失败：${status}`));
        }
      });
    });

    const entry = { channel, ready };
    outboxesRef.current.set(peerId, entry);
    return entry;
  }, []);

  /** 给某人发一条信令（失败只打日志，不打断通话流程） */
  const sendSignal = useCallback(
    async (peerId: string, message: SignalMessage) => {
      try {
        const { channel, ready } = getOutbox(peerId);
        await ready;
        await channel.send({ type: "broadcast", event: "signal", payload: message });
      } catch (error) {
        console.error("[call] 发送信令失败", message.type, error);
      }
    },
    [getOutbox],
  );

  /** 打开麦克风 */
  const openMic = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    localStreamRef.current = stream;
    return stream;
  }, []);

  /**
   * 解析本次通话要用的 ICE 配置。
   *
   * 优先向 /api/turn 换**短期 TURN 凭据**（Cloudflare 的密钥只在服务端 ✓），
   * 拿不到就退回静态配置 / 只用 STUN —— 通话本身不会因此失败，只是连通率低一些。
   */
  const resolveIceServers = useCallback(async (): Promise<RTCIceServer[]> => {
    const fallback = buildIceServers(TURN_CONFIG);
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 3_000);
      const response = await fetch("/api/turn", { signal: controller.signal });
      window.clearTimeout(timer);
      if (!response.ok) return fallback;

      const data = (await response.json()) as { iceServers?: unknown };
      if (!data.iceServers || typeof data.iceServers !== "object") return fallback;

      const servers = buildIceServers(data.iceServers as Parameters<typeof buildIceServers>[0]);
      if (servers.length > 1) setTurnAvailable(true);
      return servers;
    } catch (error) {
      console.warn("[call] 获取 TURN 凭据失败，退回 STUN", error);
      return fallback;
    }
  }, []);

  /** 建立（或复用）RTCPeerConnection */
  const ensurePeer = useCallback(
    async (peerId: string, callId: string): Promise<RTCPeerConnection> => {
      if (pcRef.current) return pcRef.current;

      const myId = user?.id ?? "";
      const iceServers = await resolveIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;

      const stream = await openMic();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        void sendSignal(peerId, {
          type: "ice",
          callId,
          fromId: myId,
          candidate: event.candidate.toJSON(),
        });
      };

      pc.ontrack = (event) => {
        const incoming = event.streams[0];
        if (incoming) setRemoteStream(incoming);
        else setRemoteStream(new MediaStream([event.track]));
      };

      pc.onconnectionstatechange = () => {
        const connectionState = pc.connectionState;
        if (connectionState === "connected") {
          if (connectTimerRef.current !== null) {
            window.clearTimeout(connectTimerRef.current);
            connectTimerRef.current = null;
          }
          if (disconnectTimerRef.current !== null) {
            window.clearTimeout(disconnectTimerRef.current);
            disconnectTimerRef.current = null;
          }
          const current = stateRef.current;
          if (current.phase !== "active") {
            update({ ...current, phase: "active", detail: "" });
          }
        } else if (connectionState === "failed") {
          finish("failed");
        } else if (connectionState === "disconnected") {
          // 短暂断开（切网、抖动）有可能自己恢复，给一个宽限期
          if (disconnectTimerRef.current === null) {
            disconnectTimerRef.current = window.setTimeout(() => {
              disconnectTimerRef.current = null;
              if (pcRef.current?.connectionState === "disconnected") finish("failed");
            }, DISCONNECT_GRACE_MS);
          }
        }
      };

      return pc;
    },
    [finish, openMic, resolveIceServers, sendSignal, update, user?.id],
  );

  /** 把排队中的 ICE 候选补进去 */
  const flushCandidates = useCallback(async (pc: RTCPeerConnection) => {
    const queued = pendingCandidatesRef.current;
    pendingCandidatesRef.current = [];
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (error) {
        console.warn("[call] 添加 ICE 候选失败（忽略）", error);
      }
    }
  }, []);

  /** 收到信令的统一入口 */
  const handleSignal = useCallback(
    async (raw: unknown) => {
      const message = parseSignalMessage(raw);
      if (!message) {
        // 公开频道上任何人都能发东西，不合法的直接丢
        console.warn("[call] 丢弃不合法信令", raw);
        return;
      }

      const myId = user?.id ?? "";
      if (message.fromId === myId) return; // 自己发的（理论上 self:false 收不到，双保险）
      if (!membersRef.current.some((member) => member.id === message.fromId)) {
        console.warn("[call] 丢弃非成员的呼叫", message.fromId);
        return;
      }

      const current = stateRef.current;

      switch (message.type) {
        case "invite": {
          // 正在通话/呼叫中 → 直接告诉对方"忙"，别让人干等
          if (isBusy(current.phase)) {
            void sendSignal(message.fromId, {
              type: "reject",
              callId: message.callId,
              fromId: myId,
              reason: "busy",
            });
            return;
          }
          // 已经在响铃（同一个来电重复到达）就忽略
          if (current.phase === "ringing" && current.callId === message.callId) return;

          update({
            phase: "ringing",
            callId: message.callId,
            peerId: message.fromId,
            peerName: message.fromName,
            startedAt: Date.now(),
            muted: false,
            detail: "来电",
          });
          return;
        }

        case "accept": {
          // 主叫收到"对方接听" → 发 offer
          if (current.phase !== "calling" || current.callId !== message.callId) return;
          if (ringTimerRef.current !== null) {
            window.clearTimeout(ringTimerRef.current);
            ringTimerRef.current = null;
          }
          update({ ...current, phase: "connecting", detail: "正在建立连接…" });

          try {
            const pc = await ensurePeer(message.fromId, message.callId);
            const offer = await pc.createOffer({ offerToReceiveAudio: true });
            await pc.setLocalDescription(offer);
            void sendSignal(message.fromId, {
              type: "offer",
              callId: message.callId,
              fromId: myId,
              sdp: offer.sdp ?? "",
            });
          } catch (error) {
            console.error("[call] 创建 offer 失败", error);
            finish(null, describeCallError(error));
          }
          return;
        }

        case "reject": {
          if (current.callId !== message.callId) return;
          finish(message.reason === "busy" ? "busy" : "rejected");
          return;
        }

        case "offer": {
          // 被叫：对方（主叫）已经在我接听后发来了 offer
          if (current.callId !== message.callId) return;
          if (current.phase !== "connecting") return;
          try {
            const pc = await ensurePeer(message.fromId, message.callId);
            await pc.setRemoteDescription({ type: "offer", sdp: message.sdp });
            await flushCandidates(pc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            void sendSignal(message.fromId, {
              type: "answer",
              callId: message.callId,
              fromId: myId,
              sdp: answer.sdp ?? "",
            });
          } catch (error) {
            console.error("[call] 处理 offer 失败", error);
            finish(null, describeCallError(error));
          }
          return;
        }

        case "answer": {
          // 主叫：收到被叫的 answer
          const pc = pcRef.current;
          if (!pc || current.callId !== message.callId) return;
          try {
            await pc.setRemoteDescription({ type: "answer", sdp: message.sdp });
            await flushCandidates(pc);
          } catch (error) {
            console.error("[call] 处理 answer 失败", error);
            finish(null, describeCallError(error));
          }
          return;
        }

        case "ice": {
          if (current.callId !== message.callId) return;
          const pc = pcRef.current;
          // 远端描述还没设置好就先进队列
          if (!pc || !pc.remoteDescription) {
            pendingCandidatesRef.current.push(message.candidate);
            return;
          }
          try {
            await pc.addIceCandidate(message.candidate);
          } catch (error) {
            console.warn("[call] 添加 ICE 候选失败（忽略）", error);
          }
          return;
        }

        case "hangup": {
          if (current.callId !== message.callId) return;
          finish("hangup");
          return;
        }

        default:
          return;
      }
    },
    [ensurePeer, finish, flushCandidates, sendSignal, update, user?.id],
  );

  // 订阅自己的频道（接收信令）
  useEffect(() => {
    if (!user || typeof window === "undefined") return;

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(callChannelName(user.id), { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "signal" }, ({ payload }) => {
        void handleSignal(payload);
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") console.error("[call] 信令频道连接失败");
      });

    inboxRef.current = channel;

    return () => {
      inboxRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [handleSignal, user]);

  // 卸载时确保释放麦克风和连接
  useEffect(() => {
    return () => {
      clearTimers();
      closePeer();
      releaseLocalStream();
    };
  }, [clearTimers, closePeer, releaseLocalStream]);

  /** 主叫：发起呼叫 */
  const startCall = useCallback(
    async (member: Member) => {
      const myId = user?.id ?? "";
      if (myId === "" || member.id === myId) return;
      if (isBusy(stateRef.current.phase)) {
        notifyRef.current("info", "你正在通话中");
        return;
      }

      // 先要权限：没麦克风就别发出去了（否则对方接了你也说不了话）
      try {
        await openMic();
      } catch (error) {
        notifyRef.current("error", describeCallError(error));
        return;
      }

      const callId = createCallId(Date.now(), Math.random());
      update({
        phase: "calling",
        callId,
        peerId: member.id,
        peerName: member.username,
        startedAt: Date.now(),
        muted: false,
        detail: "正在呼叫…",
      });

      void sendSignal(member.id, { type: "invite", callId, fromId: myId, fromName: user?.name ?? "有人" });

      // 对方一直不接 → 提示"没有接听"
      ringTimerRef.current = window.setTimeout(() => {
        void sendSignal(member.id, { type: "hangup", callId, fromId: myId });
        finish("no-answer");
      }, RING_TIMEOUT_MS);
    },
    [finish, openMic, sendSignal, update, user],
  );

  /** 被叫：接听 */
  const acceptCall = useCallback(async () => {
    const current = stateRef.current;
    if (current.phase !== "ringing") return;

    try {
      await openMic();
    } catch (error) {
      void sendSignal(current.peerId, {
        type: "reject",
        callId: current.callId,
        fromId: user?.id ?? "",
        reason: "declined",
      });
      finish(null, describeCallError(error));
      return;
    }

    update({ ...current, phase: "connecting", startedAt: Date.now(), detail: "正在建立连接…" });
    void sendSignal(current.peerId, {
      type: "accept",
      callId: current.callId,
      fromId: user?.id ?? "",
    });

    // 建立连接的兜底超时（多半是网络需要 TURN）
    connectTimerRef.current = window.setTimeout(() => {
      if (stateRef.current.phase !== "active") finish("failed");
    }, CONNECT_TIMEOUT_MS);
  }, [finish, openMic, sendSignal, update, user?.id]);

  /** 被叫：拒接 */
  const rejectCall = useCallback(() => {
    const current = stateRef.current;
    if (current.phase !== "ringing") return;
    void sendSignal(current.peerId, {
      type: "reject",
      callId: current.callId,
      fromId: user?.id ?? "",
      reason: "declined",
    });
    finish(null);
  }, [finish, sendSignal, user?.id]);

  /** 任意一方：挂断 */
  const hangUp = useCallback(() => {
    const current = stateRef.current;
    if (current.phase === "idle") return;
    void sendSignal(current.peerId, {
      type: "hangup",
      callId: current.callId,
      fromId: user?.id ?? "",
    });
    finish("local");
  }, [finish, sendSignal, user?.id]);

  /** 静音 / 取消静音 */
  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const nextMuted = !stateRef.current.muted;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    update({ ...stateRef.current, muted: nextMuted });
  }, [update]);

  // 主叫侧也要有连接兜底超时（被叫接听后 20 秒还没连上）
  useEffect(() => {
    if (state.phase !== "connecting") return;
    if (connectTimerRef.current !== null) return;
    connectTimerRef.current = window.setTimeout(() => {
      if (stateRef.current.phase !== "active") finish("failed");
    }, CONNECT_TIMEOUT_MS);
  }, [finish, state.phase]);

  // 通话超过上限自动挂断（防止忘记挂断一直占着麦克风）
  useEffect(() => {
    if (state.phase !== "active") return;
    maxCallTimerRef.current = window.setTimeout(() => {
      const current = stateRef.current;
      if (current.phase === "active") {
        void sendSignal(current.peerId, {
          type: "hangup",
          callId: current.callId,
          fromId: user?.id ?? "",
        });
        finish("timeout");
      }
    }, MAX_CALL_MS);
    return () => {
      if (maxCallTimerRef.current !== null) {
        window.clearTimeout(maxCallTimerRef.current);
        maxCallTimerRef.current = null;
      }
    };
  }, [finish, sendSignal, state.phase, user?.id]);

  return {
    state,
    remoteStream,
    startCall,
    acceptCall,
    rejectCall,
    hangUp,
    toggleMute,
    /** TURN 是否可用（界面上用来给提示） */
    turnConfigured: turnAvailable,
  };
}
