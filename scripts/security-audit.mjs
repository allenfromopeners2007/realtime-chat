/**
 * 安全自测：只用「公开的 anon key」（任何人打开网页都能拿到）去尝试越权操作。
 * 每一条期望都被拦住；如果哪条成功了，就是真实漏洞。
 * 不修改任何数据：写入类操作期望被 RLS 拒绝，之后还会回读确认数据没变。
 */
import fs from "node:fs";

const envText = fs.readFileSync(
  new URL("../.env.local", import.meta.url).pathname.replace(/^\//, ""),
  "utf8",
);
const url = /^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m.exec(envText)[1].trim();
const key = /^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)$/m.exec(envText)[1].trim();

const base = { apikey: key, Authorization: `Bearer ${key}`, accept: "application/json" };

async function call(path, init = {}) {
  const response = await fetch(`${url}${path}`, { ...init, headers: { ...base, ...(init.headers ?? {}) } });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 非 JSON（比如 HTML 错误页） */
  }
  return { status: response.status, text, json };
}

let pass = 0;
let fail = 0;
const holes = [];

function verdict(label, blocked, detail) {
  if (blocked) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    holes.push(label);
    console.log(`  ❌ 【漏洞】${label}   ${detail}`);
  }
}

/** 被拦住 = 4xx，或者写操作返回空数组（RLS 过滤掉 = 一行都没动） */
function isBlocked({ status, json, text }) {
  if (status >= 400) return true;
  if (Array.isArray(json) && json.length === 0) return true;
  if (json === null && /row-level security|permission denied|violates/i.test(text)) return true;
  return false;
}

console.log("========== 0) 先读一次基线数据（后面用来确认没被改动）==========");
const roomsBefore = (await call("/rest/v1/rooms?select=id,name,announcement&order=created_at.asc")).json;
const profilesBefore = (await call("/rest/v1/profiles?select=id,username,role,is_banned")).json;
console.log(`  群组 ${roomsBefore?.length} 个、档案 ${profilesBefore?.length} 个`);
const victimUid = profilesBefore?.[0]?.id;
const victimRoom = roomsBefore?.[0];

console.log("");
console.log("========== 1) 读（公开可读是有意设计）==========");
for (const [label, path] of [
  ["读消息列表", "/rest/v1/messages?select=id,content&limit=1"],
  ["读用户档案（用户名）", "/rest/v1/profiles?select=id,username&limit=1"],
  ["读群组", "/rest/v1/rooms?select=id,name&limit=1"],
  ["读附件列表（公开 bucket）", "/storage/v1/object/list/chat-attachments"],
]) {
  const r = await call(path, path.includes("list") ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prefix: "", limit: 5 }) } : {});
  console.log(`  ${r.status >= 400 ? "⚠️" : "✓"} ${label} → HTTP ${r.status}`);
}

console.log("");
console.log("========== 2) 冒充访客写数据（全部应被拦）==========");

verdict("匿名发消息", isBlocked(await call("/rest/v1/messages", {
  method: "POST",
  headers: { "content-type": "application/json", prefer: "return=representation" },
  body: JSON.stringify({ room_id: victimRoom?.id, user_id: victimUid, author_name: "attacker", content: "anon was here" }),
})));

verdict("匿名改别人的消息", isBlocked(await call(`/rest/v1/messages?room_id=eq.${victimRoom?.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", prefer: "return=representation" },
  body: JSON.stringify({ content: "tampered" }),
})));

verdict("匿名删消息", isBlocked(await call(`/rest/v1/messages?room_id=eq.${victimRoom?.id}`, {
  method: "DELETE",
  headers: { prefer: "return=representation" },
})));

verdict("匿名把自己提权成管理员", isBlocked(await call(`/rest/v1/profiles?id=eq.${victimUid}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", prefer: "return=representation" },
  body: JSON.stringify({ role: "admin" }),
})));

verdict("匿名改别人的用户名", isBlocked(await call(`/rest/v1/profiles?id=eq.${victimUid}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", prefer: "return=representation" },
  body: JSON.stringify({ username: "hacked" }),
})));

verdict("匿名建群", isBlocked(await call("/rest/v1/rooms", {
  method: "POST",
  headers: { "content-type": "application/json", prefer: "return=representation" },
  body: JSON.stringify({ name: "__attack_room__", description: "x" }),
})));

verdict("匿名改群公告", isBlocked(await call(`/rest/v1/rooms?id=eq.${victimRoom?.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", prefer: "return=representation" },
  body: JSON.stringify({ announcement: "hacked by anon" }),
})));

verdict("匿名删群", isBlocked(await call(`/rest/v1/rooms?id=eq.${victimRoom?.id}`, {
  method: "DELETE",
  headers: { prefer: "return=representation" },
})));

console.log("");
console.log("========== 3) 上传/删除附件（全部应被拦）==========");
verdict("匿名上传文件到自己目录", isBlocked(await call("/storage/v1/object/chat-attachments/anon-uid/evil.txt", {
  method: "POST",
  headers: { "content-type": "text/plain" },
  body: "evil",
})));

verdict("匿名删除任意文件", isBlocked(await call("/storage/v1/object/chat-attachments/whatever.png", { method: "DELETE" })));

console.log("");
console.log("========== 4) 管理专用接口（全部应被拦）==========");
verdict("匿名调用 admin_list_users()（会泄露邮箱/角色）", isBlocked(await call("/rest/v1/rpc/admin_list_users", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
})));

verdict("匿名调用 admin_list_rooms()", isBlocked(await call("/rest/v1/rpc/admin_list_rooms", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
})));

verdict("匿名直接读 auth.users 表（邮箱泄露）", isBlocked(await call("/rest/v1/users?select=email&limit=1")));

console.log("");
console.log("========== 4.5) 网站自己的管理接口（匿名调用必须被拦）==========");
{
  // 这些接口在网站上（不是 Supabase），所以要单独请求
  const APP_URL = process.env.APP_URL ?? "https://app.theopener.top";

  async function callApp(path, init = {}) {
    try {
      const response = await fetch(`${APP_URL}${path}`, {
        ...init,
        headers: { accept: "application/json", ...(init.headers ?? {}) },
        redirect: "manual",
      });
      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        // 不是 JSON（比如 404 的 HTML 页）就留 null
      }
      return { status: response.status, json, text };
    } catch (error) {
      return { status: 0, json: null, text: String(error?.cause?.code ?? error?.message ?? error) };
    }
  }

  const invite = await callApp("/api/admin/invite", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "attacker@example.com" }),
  });
  // 401 = 要求登录（正常）；404 = 这个版本还没部署（也拦住了，至少没放行）
  verdict(
    "匿名调用 /api/admin/invite 发邀请（会用 service_role 发邮件）",
    invite.status === 401 || invite.status === 404,
    `HTTP ${invite.status}`,
  );

  // 关键：这个接口用了 service_role，响应里绝不能出现任何密钥片段
  const leaked = /service_role|sb_secret_|SUPABASE_SERVICE|eyJhbGciOi/i.test(invite.text);
  verdict("邀请接口把 service_role 密钥回显出来", !leaked, leaked ? "⚠️ 泄露了" : "没有 ✓");

  const users = await callApp("/api/admin/users");
  verdict("匿名调用 /api/admin/users", users.status === 401 || users.status === 404, `HTTP ${users.status}`);

  const turn = await callApp("/api/turn");
  verdict("匿名领取 TURN 凭据（会吃我们的免费流量）", turn.status === 401 || turn.status === 404, `HTTP ${turn.status}`);
}

console.log("");
console.log("========== 5) 辅助函数（设计上允许匿名调用）==========");
{
  const r = await call("/rest/v1/rpc/is_admin", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  console.log(`  is_admin() → HTTP ${r.status}，返回 ${JSON.stringify(r.json)}  ${r.json === false ? "✅ 正确（匿名不是管理员）" : ""}`);
}

console.log("");
console.log("========== 6) 注册开关（决定陌生人能不能注册进来发广告）==========");
{
  const r = await call("/auth/v1/settings");
  if (r.status === 200 && r.json) {
    const signupOff = r.json.disable_signup === true;
    const autoconfirm = r.json.mailer_autoconfirm === true;
    console.log(`  disable_signup     = ${r.json.disable_signup}`);
    console.log(`  mailer_autoconfirm = ${r.json.mailer_autoconfirm}`);
    console.log(
      signupOff
        ? "  ✅ 已关闭开放注册：陌生人注册不了"
        : autoconfirm
          ? "  ⚠️ 开放注册 + 邮箱免验证：任何人注册后立刻就能发消息（垃圾信息风险）"
          : "  ⚠️ 开放注册（但需要邮箱验证，风险稍低）",
    );
    if (!signupOff) holes.push("开放注册（陌生人可注册并发消息）");
  } else {
    console.log(`  读取失败 HTTP ${r.status}`);
  }
}

console.log("");
console.log("========== 7) 回读确认数据没被改动 ==========");
const roomsAfter = (await call("/rest/v1/rooms?select=id,name,announcement&order=created_at.asc")).json;
const profilesAfter = (await call("/rest/v1/profiles?select=id,username,role,is_banned")).json;
const roomsSame = JSON.stringify(roomsBefore) === JSON.stringify(roomsAfter);
const profilesSame = JSON.stringify(profilesBefore) === JSON.stringify(profilesAfter);
verdict("群组数据未被篡改", roomsSame, `之前 ${JSON.stringify(roomsBefore)} 现在 ${JSON.stringify(roomsAfter)}`);
verdict("用户档案未被篡改", profilesSame, `之前 ${JSON.stringify(profilesBefore)} 现在 ${JSON.stringify(profilesAfter)}`);

console.log("");
console.log(`========== 结果：${pass} 项拦住 / ${fail} 项漏过 ==========`);
if (holes.length) {
  console.log("需要关注：");
  for (const h of holes) console.log(`  ⚠️ ${h}`);
}
