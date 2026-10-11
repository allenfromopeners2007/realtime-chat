/**
 * 语音模块纯函数单元测试（离线，不碰浏览器 API）
 *
 * 为什么只测这些：MediaRecorder / getUserMedia 只能在真实浏览器里跑，
 * 但「挑格式、定扩展名、格式化时长、翻译错误」这些逻辑是纯函数，
 * 而且正是最容易出错的地方（比如扩展名错了 Storage 就不认）。
 *
 * 跑法：npm run test:voice
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// src/lib/voice.ts 是 TS。
// 这里统一复制成 .mts 再 import —— 原因：
//   1. 项目的 package.json 没有 "type": "module"（Next.js 项目加它会出别的问题），
//      直接 import .ts 时 Node 会打印 MODULE_TYPELESS_PACKAGE_JSON 警告；
//   2. .mts 一定是 ESM，任何 Node 版本上行为一致。
// Node 20+ 自带 type stripping，所以 .mts 里的 TS 类型标注能直接跑。
const sourcePath = new URL("../src/lib/voice.ts", import.meta.url);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "voice-test-"));
const tempFile = path.join(tempDir, "voice.mts");
fs.copyFileSync(sourcePath, tempFile);
const voice = await import(`file://${tempFile.replace(/\\/g, "/")}`);
fs.rmSync(tempDir, { recursive: true, force: true });

const {
  VOICE_MIME_CANDIDATES,
  MAX_VOICE_MS,
  MIN_VOICE_MS,
  pickVoiceMime,
  bareMime,
  extensionForVoiceMime,
  formatDuration,
  voiceFileName,
  describeRecorderError,
} = voice;

let pass = 0;
let fail = 0;

function check(label, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✅ ${label}${detail ? `  ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  ❌ ${label}${detail ? `  ${detail}` : ""}`);
  }
}

console.log("========== 1) 常量 ==========");
check("最长 2 分钟", MAX_VOICE_MS === 120_000, `${MAX_VOICE_MS}ms`);
check("最短 0.5 秒（防误触）", MIN_VOICE_MS === 500, `${MIN_VOICE_MS}ms`);
check(
  "首选格式是 audio/mp4（iPhone 也能播）",
  VOICE_MIME_CANDIDATES[0] === "audio/mp4",
  VOICE_MIME_CANDIDATES.join(" > "),
);

console.log("");
console.log("========== 2) 挑格式 pickVoiceMime ==========");
check("浏览器都支持 → 选 mp4", pickVoiceMime(() => true) === "audio/mp4");
check(
  "只支持 webm → 选 webm/opus",
  pickVoiceMime((m) => m.startsWith("audio/webm")) === "audio/webm;codecs=opus",
);
check(
  "只支持 ogg → 选 ogg/opus",
  pickVoiceMime((m) => m.startsWith("audio/ogg")) === "audio/ogg;codecs=opus",
);
check("都不支持 → null", pickVoiceMime(() => false) === null);
check(
  "isTypeSupported 抛错也不崩（老 Safari）",
  pickVoiceMime((m) => {
    if (m === "audio/mp4") throw new Error("boom");
    return m.startsWith("audio/webm");
  }) === "audio/webm;codecs=opus",
);

console.log("");
console.log("========== 3) 去掉 mime 参数 bareMime ==========");
check("audio/webm;codecs=opus → audio/webm", bareMime("audio/webm;codecs=opus") === "audio/webm");
check("大小写/空格也能处理", bareMime(" Audio/MP4 ") === "audio/mp4");
check("空字符串不崩", bareMime("") === "");

console.log("");
console.log("========== 4) 扩展名 extensionForVoiceMime ==========");
for (const [mime, expected] of [
  ["audio/mp4", "m4a"],
  ["audio/mp4;codecs=mp4a.40.2", "m4a"],
  ["audio/webm;codecs=opus", "webm"],
  ["audio/ogg;codecs=opus", "ogg"],
  ["audio/mpeg", "mp3"],
  ["audio/wav", "wav"],
  ["audio/unknown-thing", "webm"],
]) {
  const actual = extensionForVoiceMime(mime);
  check(`${mime} → .${expected}`, actual === expected, actual);
}

console.log("");
console.log("========== 5) 文件名必须是纯 ASCII（否则 Storage 报 Invalid key）==========");
{
  const name = voiceFileName("audio/webm;codecs=opus", 1791631493251);
  check("文件名是 ASCII", /^[A-Za-z0-9._-]+$/.test(name), name);
  check("扩展名正确", name.endsWith(".webm"), name);
  check("m4a 的情况", voiceFileName("audio/mp4", 1).endsWith(".m4a"), voiceFileName("audio/mp4", 1));
}

console.log("");
console.log("========== 6) 时长格式化 formatDuration ==========");
for (const [ms, expected] of [
  [0, "0:00"],
  [999, "0:01"],
  [7_000, "0:07"],
  [59_400, "0:59"],
  [60_000, "1:00"],
  [65_000, "1:05"],
  [120_000, "2:00"],
  [-100, "0:00"],
]) {
  const actual = formatDuration(ms);
  check(`${ms}ms → ${expected}`, actual === expected, actual);
}

console.log("");
console.log("========== 7) 错误翻译 describeRecorderError ==========");
for (const [name, keyword] of [
  ["NotAllowedError", "麦克风权限"],
  ["NotFoundError", "没找到麦克风"],
  ["NotReadableError", "占用"],
  ["TypeError", "不支持录音"],
]) {
  const text = describeRecorderError(
    Object.assign(new Error("raw"), { name }),
  );
  check(`${name} → 含「${keyword}」`, text.includes(keyword), text);
}
check(
  "未知错误也会带原文",
  describeRecorderError(new Error("奇怪的问题")).includes("奇怪的问题"),
);

console.log("");
console.log(`========== 结果：${pass} 项通过 / ${fail} 项失败 ==========`);
process.exitCode = fail === 0 ? 0 : 1;
