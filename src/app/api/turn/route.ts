import { jsonError, jsonOk, jsonUnauthorized } from "@/lib/api-response";
import { isSupabaseConfigured } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/turn → 给浏览器用的 TURN 中继凭据
 *
 * 为什么需要这个接口（而不是直接在前端写死 TURN 账号）：
 *   Cloudflare TURN 只支持**短期凭据** —— 用 Key ID + API Token 去换，
 *   而 API Token 是**密钥**，绝不能出现在前端代码里 ✗
 *   所以由服务端代换一次，把短期凭据发给浏览器 ✓
 *
 * 安全：必须登录才能调用 ✓ 否则任何拿到网址的人都能白嫖我们的 TURN 流量 ✗
 * 缓存：Cloudflare 的凭据有 ttl，这里在内存里缓存 10 分钟，避免每次都打接口 ✓
 *
 * 环境变量（服务端专用，不加 NEXT_PUBLIC_ 前缀）：
 *   CLOUDFLARE_TURN_KEY_ID      —— Cloudflare → Realtime → TURN 里创建的 Key ID
 *   CLOUDFLARE_TURN_API_TOKEN   —— 同一个 TURN 应用对应的 API Token
 * 没配的话返回 null，前端只用 STUN（能用但部分网络连不上）✓
 */

const CLOUDFLARE_TURN_ENDPOINT = "https://rtc.live.cloudflare.com/v1/turn/keys";

/** 凭据缓存：{ 到期时间, 数据 } */
let cache: { expiresAt: number; iceServers: unknown } | null = null;
const CACHE_MS = 10 * 60 * 1000;

export async function GET() {
  if (!isSupabaseConfigured) return jsonOk({ iceServers: null });

  const keyId = (process.env.CLOUDFLARE_TURN_KEY_ID ?? "").trim();
  const apiToken = (process.env.CLOUDFLARE_TURN_API_TOKEN ?? "").trim();

  // 没配置 → 明确返回 null，前端退回只用 STUN
  if (keyId === "" || apiToken === "") {
    return jsonOk({ iceServers: null, configured: false });
  }

  // 必须登录：避免变成"任何人可用的免费中继"
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return jsonUnauthorized("请先登录");
  } catch (error) {
    console.error("[api/turn] 校验登录态失败", error);
    return jsonError("服务端异常，请查看终端日志", 500);
  }

  if (cache && cache.expiresAt > Date.now()) {
    return jsonOk({ iceServers: cache.iceServers, configured: true, cached: true });
  }

  try {
    const response = await fetch(`${CLOUDFLARE_TURN_ENDPOINT}/${keyId}/credentials/generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "content-type": "application/json",
      },
      // ttl 一小时：够一次通话用，又不会长期有效
      body: JSON.stringify({ ttl: 3600 }),
    });

    const text = await response.text();
    if (!response.ok) {
      console.error(`[api/turn] Cloudflare 返回 ${response.status}：${text.slice(0, 300)}`);
      return jsonError(
        `获取 TURN 凭据失败（Cloudflare 返回 ${response.status}）：请检查 CLOUDFLARE_TURN_KEY_ID / API_TOKEN 是否正确`,
        502,
      );
    }

    const data = JSON.parse(text) as { iceServers?: unknown };
    const iceServers = data.iceServers ?? null;
    cache = { expiresAt: Date.now() + CACHE_MS, iceServers };

    return jsonOk({ iceServers, configured: true });
  } catch (error) {
    console.error("[api/turn] 请求 Cloudflare 失败", error);
    return jsonError("获取 TURN 凭据失败，请查看终端日志", 502);
  }
}
