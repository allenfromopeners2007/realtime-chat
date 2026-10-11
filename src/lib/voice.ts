/**
 * 语音消息的公共逻辑。
 *
 * 这里全部是**纯函数**，不碰浏览器 API —— 目的有两个：
 *   1. 方便写单元测试（node scripts/voice-test.mjs 直接跑）
 *   2. 把「格式兼容性」这类容易踩坑的判断集中在一处
 */

/**
 * 录制格式候选，按「跨平台播放兼容性」从好到差排列。
 *
 * 为什么要排序：
 *   - `audio/mp4`（AAC）：Chromium 130+ 和 Safari 都支持，**iPhone 也能播** ✓ 首选
 *   - `audio/webm;codecs=opus`：Chromium 系默认，体积最小，但 **Safari 播不了** ✗
 *   - `audio/ogg;codecs=opus`：Firefox 系
 * 如果录成 webm，用 iPhone 的同学点开是听不到的 —— 所以优先 mp4。
 */
export const VOICE_MIME_CANDIDATES = [
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
] as const;

/** 单条语音最长时长（毫秒）。超过自动停止。 */
export const MAX_VOICE_MS = 120_000;

/** 时长不足这个值就当作误触，不发出去（毫秒） */
export const MIN_VOICE_MS = 500;

/**
 * 从候选里挑出当前浏览器支持的第一个格式。
 * `isSupported` 由调用方传入（浏览器里传 MediaRecorder.isTypeSupported），
 * 这样这个函数在 Node 里也能测。
 */
export function pickVoiceMime(isSupported: (mime: string) => boolean): string | null {
  for (const candidate of VOICE_MIME_CANDIDATES) {
    try {
      if (isSupported(candidate)) return candidate;
    } catch {
      // 老版 Safari 上 isTypeSupported 可能抛错 → 当作不支持，继续试下一个
    }
  }
  return null;
}

/** 去掉 mime 的参数部分：`audio/webm;codecs=opus` → `audio/webm` */
export function bareMime(mime: string): string {
  return mime.split(";")[0]?.trim().toLowerCase() ?? "";
}

/**
 * 根据 mime 决定文件扩展名。
 * 结果会进入 Storage 的对象名，所以**必须是 ASCII**（中文文件名会被 Storage 拒绝）。
 */
export function extensionForVoiceMime(mime: string): string {
  switch (bareMime(mime)) {
    case "audio/mp4":
    case "audio/m4a":
    case "audio/x-m4a":
      return "m4a";
    case "audio/ogg":
      return "ogg";
    case "audio/mpeg":
      return "mp3";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    default:
      return "webm";
  }
}

/** 毫秒 → `0:07` / `1:23` */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** 拼出语音文件名（ASCII，带正确扩展名） */
export function voiceFileName(mime: string, stamp: number): string {
  return `voice-${stamp}.${extensionForVoiceMime(mime)}`;
}

/** 把录音时抛出的浏览器异常翻译成人话 */
export function describeRecorderError(error: unknown): string {
  const name = (error as { name?: string } | null)?.name ?? "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "没有麦克风权限：请点浏览器地址栏左侧的图标，把「麦克风」设为允许，然后重试";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "没找到麦克风设备，请确认电脑接了麦克风或耳机";
    case "NotReadableError":
    case "TrackStartError":
      return "麦克风被其它程序占用了（比如正在开会），关掉它再试";
    case "OverconstrainedError":
      return "当前麦克风不支持所需的录音参数";
    case "TypeError":
      return "这个浏览器不支持录音，请用 Edge / Chrome 打开";
    default:
      return error instanceof Error ? `录音失败：${error.message}` : "录音失败，详情见控制台";
  }
}

/** 当前环境是否有可能录音（HTTPS + 浏览器支持 MediaRecorder 和 getUserMedia） */
export function canRecordVoice(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.MediaRecorder === "undefined") return false;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  // getUserMedia 只在安全上下文（HTTPS 或 localhost）里可用
  return window.isSecureContext === true;
}
