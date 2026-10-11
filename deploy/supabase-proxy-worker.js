/**
 * ============================================================================
 *  Supabase 反向代理 · Cloudflare Worker
 * ============================================================================
 *
 * 作用：让国内用户**不用开代理**也能用这个聊天室。
 *
 * 背景：`*.supabase.co` 在国内很多网络会被直接重置连接（ECONNRESET），
 * 而聊天消息、图片、实时推送都是**浏览器直连 Supabase** 的。
 * 这个 Worker 把 Supabase 挂到你自己的域名（或免费的 *.workers.dev）后面，
 * 浏览器就只连你的域名了。
 *
 * 部署方式（零代码，网页上点几下）：
 *   1. Cloudflare 控制台 → Workers & Pages → Create → Worker
 *   2. 把这段代码整个粘贴进去 → Deploy
 *   3. Worker → Settings → Variables and Secrets → 添加变量
 *        名称：SUPABASE_HOST
 *        值：  lvntlhgpalgbgrsloxyy.supabase.co     ← 你的项目域名（不要带 https://）
 *   4. 再 Deploy 一次，然后打开  https://<你的worker>.workers.dev/__health  应该看到 {"ok":true,...}
 *
 * 然后用这个 Worker 的域名当作前端的环境变量：
 *      NEXT_PUBLIC_SUPABASE_URL=https://<你的worker>.workers.dev
 *      SUPABASE_URL_SERVER=https://<你的项目>.supabase.co      ← 服务端直连，不走 Worker
 */

export default {
  async fetch(request, env) {
    const upstreamHost = String(env.SUPABASE_HOST || "").trim();

    // 自检端点：浏览器直接打开就能确认 Worker 活着、上游配对了没有
    const url = new URL(request.url);
    if (url.pathname === "/__health") {
      return json(
        {
          ok: upstreamHost !== "",
          upstream: upstreamHost || null,
          hint: upstreamHost === "" ? "请在 Worker 的 Variables 里设置 SUPABASE_HOST" : "配置正常",
        },
        upstreamHost === "" ? 500 : 200,
      );
    }

    if (upstreamHost === "") {
      return json({ error: "SUPABASE_HOST 未配置" }, 500);
    }

    // 只放行 Supabase 的 API 路径，避免这个 Worker 变成对所有人开放的万能代理
    const allowedPrefixes = ["/rest/", "/auth/", "/storage/", "/realtime/", "/functions/"];
    if (!allowedPrefixes.some((prefix) => url.pathname.startsWith(prefix))) {
      return json({ error: "Not found" }, 404);
    }

    // 把请求原样转发到 Supabase
    // 用原 request 作为 init：method / body / 所有头（含 Upgrade，实时 WebSocket 靠它透传）都会保留
    const target = new URL(request.url);
    target.protocol = "https:";
    target.hostname = upstreamHost;
    target.port = "";

    const forward = () => fetch(new Request(target.toString(), request), { redirect: "manual" });

    // ⚠️⚠️ 这一条不能少：CORS 预检请求（OPTIONS）**不携带 apikey 等自定义头**
    // （浏览器只会在 Access-Control-Request-Headers 里列出它们）。
    // 如果在这里按"缺 apikey"拒绝，浏览器就会判定跨域失败，
    // 前端表现为 `Failed to fetch` —— 登录、上传全部挂掉。
    // 所以预检必须直接转给 Supabase，让它返回标准的 CORS 头。
    if (request.method === "OPTIONS") {
      return forward();
    }

    // 公开对象（消息里的图片等）允许匿名读取；
    // 其余路径必须带 apikey（正常前端一定会带），挡掉顺手白嫖流量的人。
    //
    // ⚠️ 注意 apikey 有两种携带方式：
    //   - HTTP 请求：放在 `apikey` 请求头里（supabase-js 的行为）
    //   - **实时推送的 WebSocket**：浏览器 `new WebSocket()` **不能自定义请求头**，
    //     所以 supabase-js 只能把 apikey 拼在 URL 查询参数里（?apikey=...&vsn=1.0.0）。
    //     只认请求头的话，实时连接会被 401 挡掉 → 前端一直显示「离线（15s 轮询）」。
    const isPublicObject = url.pathname.startsWith("/storage/v1/object/public/");
    const hasApiKey =
      Boolean(request.headers.get("apikey")) || url.searchParams.has("apikey");
    if (!isPublicObject && !hasApiKey) {
      return json({ error: "missing apikey" }, 401);
    }

    const upstreamResponse = await forward();

    // Supabase 有时会返回跳转（Location 指向 supabase.co）。
    // 必须改写成我们自己的域名，否则浏览器会去直连那个被墙的地址。
    const location = upstreamResponse.headers.get("location");
    if (location && location.includes(upstreamHost)) {
      const headers = new Headers(upstreamResponse.headers);
      headers.set(
        "location",
        location
          .replace(`https://${upstreamHost}`, url.origin)
          .replace(`http://${upstreamHost}`, url.origin),
      );
      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers,
      });
    }

    return upstreamResponse;
  },
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
