/**
 * 把异常转成"能直接看懂"的一行文字。
 *
 * 为什么需要：Node 的 fetch 失败时只会给一句 `TypeError: fetch failed`，
 * 真正的原因（DNS 解析不了 / 连不上 / 证书过期 / 超时）藏在 `error.cause` 里。
 * 不看 cause 就只能靠猜。
 */

type ErrorWithCause = Error & {
  cause?: unknown;
  code?: string;
  errno?: string | number;
  syscall?: string;
  address?: string;
  port?: number;
};

function describeCause(cause: unknown): string | null {
  if (!cause) return null;

  if (cause instanceof Error) {
    const detail = cause as ErrorWithCause;
    const parts: string[] = [detail.message];
    if (detail.code) parts.push(`code=${detail.code}`);
    if (detail.syscall) parts.push(`syscall=${detail.syscall}`);
    if (detail.address) parts.push(`address=${detail.address}`);
    if (detail.port) parts.push(`port=${detail.port}`);
    return parts.join(" / ");
  }

  if (typeof cause === "string") return cause;
  return String(cause);
}

/** 生成给用户/日志看的一句话，包含底层原因 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const own = error as ErrorWithCause;
  const segments: string[] = [own.message || error.name];

  const cause = describeCause(own.cause);
  if (cause && cause !== own.message) segments.push(`底层原因：${cause}`);

  if (own.code && !String(own.message).includes(String(own.code))) {
    segments.push(`code=${own.code}`);
  }

  return segments.join("；");
}

/** 网络类失败时给一句人话建议 */
export function hintForFetchError(error: unknown, target: string): string | null {
  const text = describeError(error).toLowerCase();

  if (/enotfound|eai_again|getaddrinfo/.test(text)) {
    return `域名解析失败：检查 .env.local 里的地址是否写错（当前用的是 ${target}），以及本机 DNS 是否正常。`;
  }
  if (/econnrefused|etimedout|timeout|undici/.test(text)) {
    return `连不上 ${target}：可能是网络被墙/代理拦截、公司防火墙，或者该进程没有外网访问权限。`;
  }
  if (/certificate|self signed|unable to verify|tls|ssl/.test(text)) {
    return `TLS/证书校验失败：如果本机有抓包代理（Fiddler / Charles / 杀软 HTTPS 扫描），先关掉再试。`;
  }
  if (/fetch failed/.test(text)) {
    return `请求发不到 ${target}：请检查网络、代理设置，以及运行 dev server 的那个终端是否有外网访问权限。`;
  }
  return null;
}
