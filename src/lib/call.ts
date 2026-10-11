/**
 * 实时语音通话 · 纯逻辑层
 *
 * 这里不碰 WebRTC / Supabase，只做"可以被单元测试"的部分：
 *   - 信令消息的类型与**严格校验**（广播是公开频道，任何人往里面发东西，
 *     所以绝不能直接信任收到的 payload —— 这是这一层存在的首要原因）
 *   - ICE 服务器配置（STUN 列表 + 可选的 TURN）
 *   - 频道名、结束原因文案、超时常量
 *
 * 真正的连接管理在 src/lib/useCall.ts。
 */

/** 单个通话最长时长（毫秒）：4 小时，防止忘记挂断把麦克风一直占着 */
export const MAX_CALL_MS = 4 * 60 * 60 * 1000;

/** 主叫发出邀请后，等对方接听的超时（毫秒） */
export const RING_TIMEOUT_MS = 45_000;

/** ICE 候选收集超时（毫秒）：超过就不再等，直接用已有的候选尝试连 */
export const ICE_GATHERING_TIMEOUT_MS = 8_000;

/**
 * 免费公共 STUN 服务器。
 * 优先用**国内可达**的（小米、B站），再加一个 Google 的兜底。
 *
 * ⚠️ STUN 只能帮双方"互相发现"，遇到对称型 NAT（很多 4G/5G 和公司网络）
 * 就必须靠 TURN 中继 —— 没配 TURN 时部分通话会连不上，前端会给出明确提示。
 */
export const DEFAULT_STUN_URLS = [
  "stun:stun.miwifi.com:3478",
  "stun:stun.chat.bilibili.com:3478",
  "stun:stun.l.google.com:19302",
];

export type TurnConfig = {
  url: string;
  username: string;
  credential: string;
};

/** 拒接的原因：declined = 手动点了拒绝；busy = 他正在通话中 */
export type RejectReason = "declined" | "busy";

/** 信令消息（全部带 callId 与 fromId，收到后必须按 callId 过滤掉别的通话） */
export type SignalMessage =
  | { type: "invite"; callId: string; fromId: string; fromName: string }
  | { type: "accept"; callId: string; fromId: string }
  | { type: "reject"; callId: string; fromId: string; reason: RejectReason }
  | { type: "offer"; callId: string; fromId: string; sdp: string }
  | { type: "answer"; callId: string; fromId: string; sdp: string }
  | { type: "ice"; callId: string; fromId: string; candidate: RTCIceCandidateInit }
  | { type: "hangup"; callId: string; fromId: string };

/** 通话结束原因（决定界面文案） */
export type CallEndReason =
  | "hangup" // 对方挂断
  | "rejected" // 对方拒接
  | "no-answer" // 对方没接（超时）
  | "busy" // 对方正在通话中
  | "failed" // 连接建立失败
  | "timeout" // 通话超时自动挂断
  | "local"; // 自己挂断

/** 每个用户订阅自己的频道，别人往这个频道发信令 */
export function callChannelName(userId: string): string {
  return `call:${userId}`;
}

/** 生成一个通话 id（不需要密码学强度，只要在同一时刻唯一即可） */
export function createCallId(now: number, random: number): string {
  return `c${now.toString(36)}${Math.floor(random * 1e6).toString(36)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * 严格校验收到的信令。
 *
 * 为什么必须严：信令走的是 **公开广播频道**，任何拿到 anon key 的人都能往里发数据。
 * 这里把所有字段都验一遍，任何不合法的一律返回 null 直接丢弃。
 */
export function parseSignalMessage(value: unknown): SignalMessage | null {
  if (!isRecord(value)) return null;

  const type = nonEmptyString(value.type);
  const callId = nonEmptyString(value.callId);
  const fromId = nonEmptyString(value.fromId);
  if (!type || !callId || !fromId) return null;

  switch (type) {
    case "invite": {
      const fromName = nonEmptyString(value.fromName);
      return fromName ? { type, callId, fromId, fromName } : null;
    }
    case "accept":
    case "hangup":
      return { type, callId, fromId };
    case "reject": {
      // 缺 reason 时按"手动拒接"处理（老版本前端可能不发这个字段）
      const reason: RejectReason = value.reason === "busy" ? "busy" : "declined";
      return { type, callId, fromId, reason };
    }
    case "offer":
    case "answer": {
      const sdp = nonEmptyString(value.sdp);
      return sdp ? { type, callId, fromId, sdp } : null;
    }
    case "ice": {
      if (!isRecord(value.candidate)) return null;
      const candidate = nonEmptyString(value.candidate.candidate);
      if (!candidate) return null;
      // RTCIceCandidateInit 只要这几个字段，多余的一律丢掉
      return {
        type,
        callId,
        fromId,
        candidate: {
          candidate,
          sdpMid: typeof value.candidate.sdpMid === "string" ? value.candidate.sdpMid : null,
          sdpMLineIndex:
            typeof value.candidate.sdpMLineIndex === "number" ? value.candidate.sdpMLineIndex : null,
          usernameFragment:
            typeof value.candidate.usernameFragment === "string"
              ? value.candidate.usernameFragment
              : null,
        },
      };
    }
    default:
      return null;
  }
}

/** 组装 RTCPeerConnection 的 iceServers（配了 TURN 就带上，明显提高连通率） */
export function buildIceServers(turn: TurnConfig | null): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: DEFAULT_STUN_URLS }];
  const url = turn?.url?.trim();
  if (url) {
    servers.push({
      urls: url,
      username: turn?.username ?? "",
      credential: turn?.credential ?? "",
    });
  }
  return servers;
}

/** 结束原因 → 界面文案 */
export function describeCallEnd(reason: CallEndReason, peerName: string): string {
  switch (reason) {
    case "hangup":
      return `${peerName} 已挂断`;
    case "rejected":
      return `${peerName} 拒绝了通话`;
    case "no-answer":
      return `${peerName} 没有接听`;
    case "busy":
      return `${peerName} 正在通话中`;
    case "failed":
      return "连接失败：双方网络无法直连（需要配置 TURN 服务器）";
    case "timeout":
      return "通话时间过长，已自动挂断";
    case "local":
      return "通话已结束";
    default:
      return "通话已结束";
  }
}

/** 把 getUserMedia / RTCPeerConnection 抛出的异常翻译成人话 */
export function describeCallError(error: unknown): string {
  const name = (error as { name?: string } | null)?.name ?? "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "没有麦克风权限：请点浏览器地址栏左侧的图标，把「麦克风」设为允许";
    case "NotFoundError":
      return "没找到麦克风设备，请确认电脑接了麦克风或耳机";
    case "NotReadableError":
      return "麦克风被其它程序占用了，关掉它再试";
    case "NotSupportedError":
      return "这个浏览器不支持语音通话，请用 Edge / Chrome";
    default:
      return error instanceof Error ? `通话失败：${error.message}` : "通话失败，详情见控制台";
  }
}

/** 判断收到邀请时手机/浏览器是不是"忙"（已经在通话/呼叫中） */
export function isBusy(phase: string): boolean {
  return phase === "calling" || phase === "connecting" || phase === "active";
}
