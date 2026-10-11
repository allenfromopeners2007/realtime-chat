/**
 * 实时语音通话 · 纯函数单元测试
 *
 * 重点测「信令校验」—— 信令走的是公开广播频道，任何人拿到 anon key 都能往里发数据，
 * 所以校验必须严：任何字段不对的一律丢弃，否则会出现"莫名奇妙的通话弹窗"。
 *
 * 跑法：npm run test:call
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const sourcePath = new URL("../src/lib/call.ts", import.meta.url);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "call-test-"));
const tempFile = path.join(tempDir, "call.mts");
fs.copyFileSync(sourcePath, tempFile);
const call = await import(`file://${tempFile.replace(/\\/g, "/")}`);
fs.rmSync(tempDir, { recursive: true, force: true });

const {
  MAX_CALL_MS,
  RING_TIMEOUT_MS,
  ICE_GATHERING_TIMEOUT_MS,
  DEFAULT_STUN_URLS,
  callChannelName,
  createCallId,
  parseSignalMessage,
  buildIceServers,
  describeCallEnd,
  describeCallError,
  isBusy,
} = call;

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

console.log("========== 1) 常量与工具 ==========");
check("单通话上限 4 小时", MAX_CALL_MS === 4 * 60 * 60 * 1000);
check("振铃超时 45 秒", RING_TIMEOUT_MS === 45_000);
check("ICE 收集超时 8 秒", ICE_GATHERING_TIMEOUT_MS === 8_000);
check("频道名带用户 id", callChannelName("u1") === "call:u1");
check("STUN 首选国内可达的", DEFAULT_STUN_URLS[0].includes("miwifi"), DEFAULT_STUN_URLS[0]);
{
  const a = createCallId(1_791_631_493_251, 0.123456);
  const b = createCallId(1_791_631_493_251, 0.654321);
  check("callId 是纯 ASCII", /^[a-z0-9]+$/.test(a), a);
  check("同一时刻不同随机数 → 不同 id", a !== b, `${a} / ${b}`);
}

console.log("");
console.log("========== 2) 信令校验：合法消息 ==========");
const base = { callId: "c1", fromId: "u2" };
for (const [label, input, expectedType] of [
  ["invite", { ...base, type: "invite", fromName: "小张" }, "invite"],
  ["accept", { ...base, type: "accept" }, "accept"],
  ["reject", { ...base, type: "reject" }, "reject"],
  ["hangup", { ...base, type: "hangup" }, "hangup"],
  ["offer", { ...base, type: "offer", sdp: "v=0..." }, "offer"],
  ["answer", { ...base, type: "answer", sdp: "v=0..." }, "answer"],
]) {
  const parsed = parseSignalMessage(input);
  check(`${label} 通过校验`, parsed?.type === expectedType, JSON.stringify(parsed));
}

console.log("");
console.log("========== 3) 信令校验：非法消息必须全部丢弃 ==========");
for (const [label, input] of [
  ["null", null],
  ["字符串", "invite"],
  ["数组", []],
  ["空对象", {}],
  ["缺 type", { callId: "c1", fromId: "u2" }],
  ["缺 callId", { type: "invite", fromId: "u2", fromName: "x" }],
  ["缺 fromId", { type: "invite", callId: "c1", fromName: "x" }],
  ["type 不是字符串", { ...base, type: 123 }],
  ["未知 type", { ...base, type: "evil" }],
  ["invite 缺 fromName", { ...base, type: "invite" }],
  ["invite fromName 是空串", { ...base, type: "invite", fromName: "   " }],
  ["offer 缺 sdp", { ...base, type: "offer" }],
  ["offer sdp 不是字符串", { ...base, type: "offer", sdp: { evil: true } }],
  ["callId 是空串", { type: "accept", callId: "", fromId: "u2" }],
  ["ice 缺 candidate", { ...base, type: "ice" }],
  ["ice candidate 不是对象", { ...base, type: "ice", candidate: "x" }],
  ["ice candidate.candidate 是空", { ...base, type: "ice", candidate: { candidate: "" } }],
]) {
  check(`${label} → 丢弃`, parseSignalMessage(input) === null);
}
{
  // ICE：多余字段会被剥掉，只留 RTCIceCandidateInit 认的三个
  const parsed = parseSignalMessage({
    ...base,
    type: "ice",
    candidate: { candidate: "candidate:1 udp", sdpMid: "0", sdpMLineIndex: 0, evil: "payload" },
  });
  check("ice 合法消息通过", parsed?.type === "ice");
  check("ice 剥掉多余字段", parsed && !("evil" in parsed.candidate), JSON.stringify(parsed?.candidate));
}

console.log("");
console.log("========== 4) ICE 配置 ==========");
{
  const noTurn = buildIceServers(null);
  check("没配 TURN 时只有 STUN", noTurn.length === 1 && !("username" in noTurn[0]));
  check("STUN 地址都带上了", Array.isArray(noTurn[0].urls) && noTurn[0].urls.length === 3);

  const withTurn = buildIceServers({
    url: "turn:turn.example.com:3478",
    username: "u",
    credential: "p",
  });
  check("配了 TURN 时有两个条目", withTurn.length === 2);
  check("TURN 参数正确", withTurn[1].urls === "turn:turn.example.com:3478" && withTurn[1].username === "u");

  const blank = buildIceServers({ url: "   ", username: "u", credential: "p" });
  check("TURN 地址是空白 → 当没配", blank.length === 1);
}

console.log("");
console.log("========== 5) 结束原因文案 ==========");
for (const [reason, keyword] of [
  ["hangup", "已挂断"],
  ["rejected", "拒绝"],
  ["no-answer", "没有接听"],
  ["busy", "正在通话中"],
  ["failed", "TURN"],
]) {
  const text = describeCallEnd(reason, "小张");
  check(`${reason} → 含「${keyword}」`, text.includes(keyword), text);
}

console.log("");
console.log("========== 6) 错误翻译 ==========");
for (const [name, keyword] of [
  ["NotAllowedError", "麦克风权限"],
  ["NotFoundError", "没找到麦克风"],
  ["NotReadableError", "占用"],
  ["NotSupportedError", "不支持语音通话"],
]) {
  const text = describeCallError(Object.assign(new Error("raw"), { name }));
  check(`${name} → 含「${keyword}」`, text.includes(keyword), text);
}

console.log("");
console.log("========== 7) busy 判断 ==========");
for (const [phase, expected] of [
  ["idle", false],
  ["ringing", false],
  ["calling", true],
  ["connecting", true],
  ["active", true],
  ["ended", false],
]) {
  check(`${phase} → ${expected ? "忙" : "空闲"}`, isBusy(phase) === expected);
}

console.log("");
console.log(`========== 结果：${pass} 项通过 / ${fail} 项失败 ==========`);
process.exitCode = fail === 0 ? 0 : 1;
