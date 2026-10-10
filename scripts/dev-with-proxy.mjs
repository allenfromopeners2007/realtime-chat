/**
 * 带代理的开发服务器启动器（国内网络访问 Supabase 用）。
 *
 * 背景：Windows 的「系统代理」只对浏览器这类程序生效，
 * Node.js 的 fetch（undici）默认既不看系统代理，也不看 HTTP_PROXY/HTTPS_PROXY。
 * 结果就是：浏览器能打开 Supabase 后台，但 dev server 直连 *.supabase.co 会被重置（ECONNRESET）。
 *
 * Node 24 起提供了官方的开关：设置 NODE_USE_ENV_PROXY=1 之后，
 * fetch 就会读取 HTTP_PROXY / HTTPS_PROXY / NO_PROXY 环境变量。
 *
 * 用法：
 *   npm run dev:proxy                       # 默认走 http://127.0.0.1:7897（Clash Verge 默认端口）
 *   DEV_PROXY=http://127.0.0.1:7890 npm run dev:proxy    # 指定别的代理端口
 *
 * 如果你的代理软件开了「TUN 模式 / 全局模式」，流量在系统层就被接管了，直接用 npm run dev 即可。
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const proxy = process.env.DEV_PROXY || "http://127.0.0.1:7897";

process.env.NODE_USE_ENV_PROXY = "1";
process.env.HTTP_PROXY = proxy;
process.env.HTTPS_PROXY = proxy;
// 本机地址不要走代理，否则访问 localhost 的请求会绕一圈
process.env.NO_PROXY = "localhost,127.0.0.1,::1";

const nextBin = path.join("node_modules", "next", "dist", "bin", "next");

if (!existsSync(nextBin)) {
  console.error("找不到 Next.js，请先执行 npm install");
  process.exit(1);
}

console.log(`[dev:proxy] 已为 Node 配置代理：${proxy}`);
console.log("[dev:proxy] 如果代理端口不对，用 DEV_PROXY=http://127.0.0.1:端口 重新运行");
console.log("");

const child = spawn(process.execPath, [nextBin, "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
