/**
 * Worker 冒烟测试（离线，不联网）
 *
 * 用假的 fetch 捕获 Worker 实际发出的上游请求，验证：
 *   1. 健康检查 / 路径白名单 / apikey 校验
 *   2. **CORS 预检（OPTIONS）必须放行** ← 这一条曾经漏掉，
 *      导致线上浏览器登录报 `Failed to fetch`（预检请求不带 apikey，
 *      被 Worker 按"缺 apikey"拒绝 → 浏览器判定跨域失败）
 *   3. 转发地址拼接、请求头/请求体透传
 *   4. WebSocket 的 Upgrade 头保留（实时推送靠它）
 *   5. 重定向 Location 改写回自己的域名
 *   6. 上游响应与 CORS 头原样返回
 *
 * 跑法：npm run test:worker
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const UPSTREAM = "lvntlhgpalgbgrsloxyy.supabase.co";
const WORKER_ORIGIN = "https://sb.example.com";
const sourcePath = new URL("../deploy/supabase-proxy-worker.js", import.meta.url);

// Worker 源码是 .js，而项目 package.json 没声明 type:module →
// 复制成 .mjs 才能被 import（纯测试便利，不影响部署）
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-test-"));
const tempFile = path.join(tempDir, "worker.mjs");
fs.copyFileSync(sourcePath, tempFile);
const worker = (await import(`file://${tempFile.replace(/\\/g, "/")}`)).default;

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

let captured = [];
let upstreamResponseFactory = () =>
  new Response("{}", { status: 200, headers: { "content-type": "application/json" } });

globalThis.fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  captured.push(request);
  return upstreamResponseFactory();
};

async function run(pathname, { method = "GET", headers = {}, body, env = { SUPABASE_HOST: UPSTREAM } } = {}) {
  captured = [];
  const request = new Request(`${WORKER_ORIGIN}${pathname}`, { method, headers, body });
  const response = await worker.fetch(request, env);
  return { response, captured };
}

console.log("========== 1) 健康检查 ==========");
{
  const { response } = await run("/__health", { env: {} });
  check("没配 SUPABASE_HOST → 500", response.status === 500, `HTTP ${response.status}`);
  check("并给出可读提示", (await response.text()).includes("SUPABASE_HOST"));
}
{
  const { response } = await run("/__health");
  const data = await response.json();
  check("配好后 → 200 且 ok=true", response.status === 200 && data.ok === true, JSON.stringify(data));
}

console.log("");
console.log("========== 2) 路径白名单 ==========");
for (const [pathname, shouldAllow] of [
  ["/rest/v1/messages", true],
  ["/auth/v1/token", true],
  ["/storage/v1/object/public/chat-attachments/a.png", true],
  ["/realtime/v1/websocket", true],
  ["/functions/v1/hello", true],
  ["/", false],
  ["/evil/path", false],
  ["/../../etc/passwd", false],
]) {
  const { response } = await run(pathname, { headers: { apikey: "k" } });
  const blocked = response.status === 404;
  check(`${pathname} → ${shouldAllow ? "放行" : "拦截"}`, shouldAllow ? !blocked : blocked, `HTTP ${response.status}`);
}

console.log("");
console.log("========== 3) apikey 校验 ==========");
{
  const { response } = await run("/rest/v1/messages");
  check("非公开路径缺 apikey → 401", response.status === 401, `HTTP ${response.status}`);
}
{
  const { response } = await run("/storage/v1/object/public/chat-attachments/a.png");
  check("公开图片不带 apikey 也能过", response.status === 200, `HTTP ${response.status}`);
}

console.log("");
console.log("========== 4) CORS 预检（OPTIONS）★ 曾经线上翻车的地方 ==========");
{
  // 浏览器预检的真实特征：method=OPTIONS，没有 apikey，只有 Access-Control-Request-* 头
  const { response, captured: c } = await run("/auth/v1/token?grant_type=password", {
    method: "OPTIONS",
    headers: {
      origin: "https://app.example.com",
      "access-control-request-method": "POST",
      "access-control-request-headers": "apikey,authorization,content-type,x-client-info",
    },
  });
  check("预检不带 apikey 也必须放行（不能 401）", response.status !== 401, `HTTP ${response.status}`);
  check("确实转发给 Supabase 处理", c.length === 1, `捕获到 ${c.length} 个上游请求`);
  check("method 保持 OPTIONS", c[0]?.method === "OPTIONS", c[0]?.method);
  check("预检相关头保留", (c[0]?.headers.get("access-control-request-headers") ?? "").includes("apikey"));
}
{
  upstreamResponseFactory = () =>
    new Response(null, {
      status: 204,
      headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "apikey,authorization" },
    });
  const { response } = await run("/auth/v1/token", { method: "OPTIONS", headers: { origin: "https://app.example.com" } });
  check("Supabase 的 CORS 头原样返回", response.headers.get("access-control-allow-origin") === "*");
  upstreamResponseFactory = () => new Response("{}", { status: 200 });
}

console.log("");
console.log("========== 5) 转发地址与参数 ==========");
{
  const { captured: c } = await run("/rest/v1/messages?select=*&limit=5", { headers: { apikey: "k" } });
  const url = c[0]?.url ?? "";
  check("主机名换成上游", url.startsWith(`https://${UPSTREAM}/`), url);
  check("路径与查询串保持不变", url.endsWith("/rest/v1/messages?select=*&limit=5"));
  check("协议强制 https", url.startsWith("https://"));
}

console.log("");
console.log("========== 6) 请求头 / 请求体透传 ==========");
{
  const { captured: c } = await run("/rest/v1/messages", {
    method: "POST",
    headers: { apikey: "my-anon-key", "content-type": "application/json", prefer: "return=representation" },
    body: JSON.stringify({ content: "hi" }),
  });
  const request = c[0];
  check("method 保持 POST", request?.method === "POST", request?.method);
  check("apikey 头保留", request?.headers.get("apikey") === "my-anon-key");
  check("content-type 保留", request?.headers.get("content-type") === "application/json");
  check("prefer 头保留", request?.headers.get("prefer") === "return=representation");
  check("请求体一致", (await request?.text()) === JSON.stringify({ content: "hi" }));
}

console.log("");
console.log("========== 7) WebSocket 升级头 ==========");
{
  const { captured: c } = await run("/realtime/v1/websocket?apikey=k&vsn=1.0.0", {
    headers: { apikey: "k", Upgrade: "websocket", Connection: "Upgrade" },
  });
  check("Upgrade: websocket 保留", c[0]?.headers.get("upgrade") === "websocket");
  check("Connection: Upgrade 保留", (c[0]?.headers.get("connection") ?? "").toLowerCase() === "upgrade");
}

console.log("");
console.log("========== 8) 重定向 Location 改写 ==========");
{
  upstreamResponseFactory = () =>
    new Response(null, { status: 302, headers: { location: `https://${UPSTREAM}/auth/v1/callback?code=1` } });
  const { response } = await run("/auth/v1/authorize", { headers: { apikey: "k" } });
  const location = response.headers.get("location") ?? "";
  check("不再指向 supabase.co", !location.includes(UPSTREAM), location);
  check("改成 Worker 自己的域名", location.startsWith(WORKER_ORIGIN), location);
  upstreamResponseFactory = () => new Response("{}", { status: 200 });
}

console.log("");
console.log("========== 9) 上游响应原样返回 ==========");
{
  upstreamResponseFactory = () =>
    new Response(JSON.stringify([{ id: 1 }]), {
      status: 200,
      headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
    });
  const { response } = await run("/rest/v1/rooms", { headers: { apikey: "k" } });
  check("状态码保持 200", response.status === 200);
  check("CORS 头保留（跨域才能用）", response.headers.get("access-control-allow-origin") === "*");
  check("响应体保持", (await response.text()) === JSON.stringify([{ id: 1 }]));
}

fs.rmSync(tempDir, { recursive: true, force: true });

console.log("");
console.log(`========== 结果：${pass} 项通过 / ${fail} 项失败 ==========`);
process.exitCode = fail === 0 ? 0 : 1;
