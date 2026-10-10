import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL, SUPABASE_URL_SERVER } from "@/lib/env";
import { describeError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/diagnose —— 连不上 Supabase 时的排查工具。
 *
 * 它会依次检查：环境变量 → DNS 解析 → 原始 fetch → 官方 SDK，
 * 并把每一层的真实错误（含 error.cause，例如 ENOTFOUND / ECONNREFUSED / 证书错误）打出来。
 *
 * 安全说明：只返回 URL 和 key 的前缀/长度（这两个本来就是公开信息），不返回完整 key。
 * 正式上线前可以直接删掉这个文件。
 *
 * 对照实验：加 ?probe=supabase.com —— 如果连这个域名都解析不了，
 * 说明是运行环境本身没有外网/DNS，而不是项目地址写错。
 */
export async function GET(request: NextRequest) {
  const report: Record<string, unknown> = {
    node: process.version,
    time: new Date().toISOString(),
    configured: isSupabaseConfigured,
    supabaseUrl: SUPABASE_URL,
    supabaseUrlServer: SUPABASE_URL_SERVER,
    browserUsesProxy: SUPABASE_URL !== SUPABASE_URL_SERVER,
    keyPrefix: SUPABASE_ANON_KEY.slice(0, 16),
    keyLength: SUPABASE_ANON_KEY.length,
    keyLooksPublishable: SUPABASE_ANON_KEY.startsWith("sb_publishable_"),
    keyLooksJwt: SUPABASE_ANON_KEY.startsWith("eyJ"),
  };

  // ---- 直连 REST 验证：?restprobe=<host>（用当前 key 真的读一次数据库）
  const restProbe = request.nextUrl.searchParams.get("restprobe");
  if (restProbe) {
    const target = `https://${restProbe}/rest/v1/rooms?select=id,name,description&limit=5`;
    const restStart = Date.now();
    try {
      const response = await fetch(target, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      const body = await response.text();
      return NextResponse.json({
        target,
        ok: response.ok,
        status: response.status,
        elapsedMs: Date.now() - restStart,
        bodyPreview: body.slice(0, 800),
      });
    } catch (error) {
      return NextResponse.json({
        target,
        ok: false,
        elapsedMs: Date.now() - restStart,
        error: describeError(error),
      });
    }
  }

  // ---- 批量 DNS 探测：?dnsbatch=h1,h2,h3（只做 DNS，不发起 HTTP，用来快速穷举）
  const batch = request.nextUrl.searchParams.get("dnsbatch");
  if (batch) {
    const hosts = batch
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean)
      .slice(0, 300);
    const { lookup } = await import("node:dns/promises");
    const results = await Promise.all(
      hosts.map(async (host) => {
        try {
          const result = await lookup(host);
          return { host, ip: result.address };
        } catch {
          return { host, ip: null };
        }
      }),
    );
    return NextResponse.json({
      tested: hosts.length,
      resolved: results.filter((r) => r.ip !== null),
    });
  }

  const probe = request.nextUrl.searchParams.get("probe");
  if (probe) {
    const probeResult: Record<string, unknown> = { host: probe };
    try {
      const { lookup } = await import("node:dns/promises");
      const result = await lookup(probe);
      probeResult.dns = { address: result.address, family: result.family };
    } catch (error) {
      probeResult.dns = { error: describeError(error) };
    }
    const probeStart = Date.now();
    try {
      const response = await fetch(`https://${probe}/`, {
        method: "HEAD",
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      probeResult.http = {
        ok: response.ok,
        status: response.status,
        elapsedMs: Date.now() - probeStart,
      };
    } catch (error) {
      probeResult.http = { error: describeError(error), elapsedMs: Date.now() - probeStart };
    }

    // 外部 DNS 对照（阿里公共 DNS 的 DoH 接口，国内可访问）：
    // 用来区分"这个域名根本不存在" 和 "本机 DNS 解析不了它"
    try {
      const dohResponse = await fetch(
        `https://dns.alidns.com/resolve?name=${encodeURIComponent(probe)}&type=A`,
        { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(8000), cache: "no-store" },
      );
      const dohJson = (await dohResponse.json()) as {
        Status?: number;
        Answer?: Array<{ name: string; type: number; data: string }>;
      };
      probeResult.publicDns = {
        httpStatus: dohResponse.status,
        dnsStatus: dohJson.Status, // 0 = 正常, 3 = NXDOMAIN（域名不存在）
        meaning: dohJson.Status === 3 ? "NXDOMAIN：这个域名在公网上根本不存在" : "公网 DNS 能查到记录",
        answers: (dohJson.Answer ?? []).map((a) => a.data),
      };
    } catch (error) {
      probeResult.publicDns = { error: describeError(error) };
    }

    return NextResponse.json({ ...report, probe: probeResult });
  }

  if (!isSupabaseConfigured) {
    return NextResponse.json({
      ...report,
      verdict: "环境变量没读到：请确认 .env.local 存在，并且重启过 dev server",
    });
  }

  // ---- 1) DNS 解析
  const host = (() => {
    try {
      return new URL(SUPABASE_URL_SERVER).hostname;
    } catch {
      return null;
    }
  })();

  if (host) {
    try {
      const { lookup } = await import("node:dns/promises");
      const result = await lookup(host);
      report.dns = { host, address: result.address, family: result.family };
    } catch (error) {
      report.dns = { host, error: describeError(error) };
    }
  } else {
    report.dns = { error: "服务端 Supabase 地址不是合法 URL" };
  }

  // ---- 2) 原始 fetch（绕过 SDK，看最底层的报错）
  const target = `${SUPABASE_URL_SERVER}/rest/v1/rooms?select=id,name&limit=1`;
  const startedAt = Date.now();
  try {
    const response = await fetch(target, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        accept: "application/json",
      },
      cache: "no-store",
    });
    const body = await response.text();
    report.rawFetch = {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      elapsedMs: Date.now() - startedAt,
      bodyPreview: body.slice(0, 500),
    };
  } catch (error) {
    report.rawFetch = {
      ok: false,
      elapsedMs: Date.now() - startedAt,
      error: describeError(error),
    };
  }

  // ---- 3) 官方 SDK（和页面上看到的是同一条路径）
  try {
    const { getSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.from("rooms").select("id,name").limit(2);
    report.sdk = error
      ? {
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        }
      : { rows: data };
  } catch (error) {
    report.sdk = { error: describeError(error) };
  }

  const raw = report.rawFetch as { ok?: boolean } | undefined;
  const sdk = report.sdk as { rows?: unknown } | undefined;

  report.verdict = raw?.ok
    ? sdk?.rows
      ? "✅ 一切正常：数据库可读"
      : "⚠️ 原始请求成功，但 SDK 出错了"
    : "❌ 连不上 Supabase：请看 rawFetch.error 里的底层原因";

  return NextResponse.json(report);
}
