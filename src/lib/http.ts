/**
 * ============================================================================
 *  安全 JSON 请求层（对应需求 4）
 * ============================================================================
 *
 * 背景：`await response.json()` 在响应体其实是 HTML 的时候会抛出
 *      `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`
 * ——这条报错完全没有信息量：看不出是 404 页面、500 错误页，还是被重定向到了登录页。
 *
 * 这里的做法：
 *   1. 先用 `response.text()` 把正文读成字符串（只读一次）；
 *   2. 先看 Content-Type 是不是 JSON；
 *   3. 不是 JSON → 在控制台打印 状态码 / Content-Type / 正文前 800 字 / HTML title /
 *      排查建议，然后抛出一个带完整上下文的 ApiError；
 *   4. 是 JSON 但解析失败 → 打印 JSON.parse 的真实错误 + 正文片段；
 *   5. 只有确认是合法 JSON 才把它交给业务代码。
 *
 * 全项目对后端的请求都走 `apiFetch`，不要直接调用 `response.json()`。
 */

export type ApiErrorKind = "network" | "not-json" | "invalid-json" | "http";

type ApiErrorInit = {
  kind: ApiErrorKind;
  message: string;
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  contentType?: string;
  rawBody?: string;
  payload?: unknown;
  cause?: unknown;
};

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly url: string;
  readonly method: string;
  readonly status?: number;
  readonly statusText?: string;
  readonly contentType?: string;
  readonly rawBody?: string;
  readonly payload?: unknown;
  readonly cause?: unknown;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = "ApiError";
    this.kind = init.kind;
    this.url = init.url;
    this.method = init.method;
    this.status = init.status;
    this.statusText = init.statusText;
    this.contentType = init.contentType;
    this.rawBody = init.rawBody;
    this.payload = init.payload;
    this.cause = init.cause;
  }

  /** 响应根本不是 JSON（HTML 404/500 页面、登录页重定向等） */
  get isNotJson(): boolean {
    return this.kind === "not-json";
  }

  /** 登录态失效 */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

const BODY_PREVIEW_LIMIT = 800;

/** 截取正文片段，避免把整页 HTML 全打到控制台 */
export function previewBody(body: string): string {
  const text = body.trim();
  if (text.length <= BODY_PREVIEW_LIMIT) return text || "(空响应体)";
  return `${text.slice(0, BODY_PREVIEW_LIMIT)}\n…（已截断，完整长度 ${text.length} 字符）`;
}

function looksLikeHtml(body: string): boolean {
  const head = body.trim().slice(0, 120).toLowerCase();
  return head.startsWith("<");
}

function extractHtmlTitle(body: string): string | null {
  const matched = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body);
  if (!matched) return null;
  const title = matched[1].replace(/\s+/g, " ").trim();
  return title === "" ? null : title.slice(0, 140);
}

function troubleshootingHint(status: number | undefined, body: string): string {
  if (looksLikeHtml(body)) {
    if (status === 404) {
      return "后端返回的是 HTML 404 页面：接口路径写错了，或者请求被中间件/反向代理改写到了别处。";
    }
    if (status === 401 || status === 403) {
      return "请求被重定向到了登录页（HTML）：登录态可能已失效，或者这条接口没有放行当前用户。";
    }
    if (typeof status === "number" && status >= 500) {
      return "服务端抛异常并返回了 HTML 错误页：去看运行 `pnpm dev` 的终端里的堆栈。";
    }
    return "响应是 HTML 而不是 JSON，常见原因：路由不存在 / 服务端崩溃 / 被重定向到登录页 / CDN 拦截。";
  }
  return "请确认接口地址正确、开发服务器在运行、且没有被代理或网关拦截。";
}

function reportNotJson(meta: {
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  contentType?: string;
  rawBody: string;
}): void {
  const title = extractHtmlTitle(meta.rawBody);
  console.error(
    [
      "",
      "================= ✗ API 响应不是 JSON =================",
      `请求:        ${meta.method} ${meta.url}`,
      `HTTP 状态:   ${meta.status ?? "?"} ${meta.statusText ?? ""}`.trimEnd(),
      `Content-Type: ${meta.contentType || "(缺失)"}`,
      "期望类型:    application/json",
      title ? `HTML 标题:   ${title}` : "",
      "------ 响应正文（前 800 字符，真实内容）------",
      previewBody(meta.rawBody),
      "------ 排查建议 ------",
      troubleshootingHint(meta.status, meta.rawBody),
      "=====================================================",
      "",
    ]
      .filter((line) => line !== "")
      .join("\n"),
  );
}

function reportInvalidJson(meta: {
  method: string;
  url: string;
  status?: number;
  error: unknown;
  rawBody: string;
}): void {
  console.error(
    [
      "",
      "================= ✗ JSON 解析失败 =================",
      `请求:      ${meta.method} ${meta.url}`,
      `HTTP 状态: ${meta.status ?? "?"}`,
      "JSON.parse 抛出的真实错误：",
      meta.error,
      "------ 响应正文（前 800 字符）------",
      previewBody(meta.rawBody),
      "===================================================",
      "",
    ].join("\n"),
  );
}

function extractServerMessage(payload: unknown): string | null {
  if (typeof payload === "string" && payload.trim() !== "") return payload.trim();
  if (typeof payload === "object" && payload !== null) {
    const record = payload as Record<string, unknown>;
    for (const key of ["error", "message", "msg", "detail"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim() !== "") return value.trim();
    }
  }
  return null;
}

export type ReadJsonOptions = {
  /** 用于日志前缀，一眼看出是哪个请求出的问题 */
  context?: string;
  method?: string;
};

/**
 * 把一个 Response 安全地读成 JSON。
 * 不是 JSON / 解析失败都会：① 在控制台打印真实错误 ② 抛出带上下文的 ApiError。
 */
export async function readJsonResponse<T>(
  response: Response,
  options: ReadJsonOptions = {},
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const url = response.url || (options.context ?? "unknown-url");

  // 只读一次：后面 JSON.parse 复用这份文本，避免 "body already read"
  const rawBody = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const isJsonContentType = /(application|text)\/(problem\+)?json/i.test(contentType);

  if (!isJsonContentType) {
    reportNotJson({
      method,
      url,
      status: response.status,
      statusText: response.statusText,
      contentType,
      rawBody,
    });
    throw new ApiError({
      kind: "not-json",
      message: `服务端返回的不是 JSON（HTTP ${response.status}，Content-Type: ${contentType || "缺失"}），详细内容已打印到控制台。`,
      url,
      method,
      status: response.status,
      statusText: response.statusText,
      contentType,
      rawBody,
    });
  }

  if (rawBody.trim() === "") {
    if (response.ok) return undefined as T;
    throw new ApiError({
      kind: "http",
      message: `服务端返回了空响应（HTTP ${response.status}）。`,
      url,
      method,
      status: response.status,
      statusText: response.statusText,
      contentType,
      rawBody,
    });
  }

  try {
    return JSON.parse(rawBody) as T;
  } catch (error) {
    reportInvalidJson({ method, url, status: response.status, error, rawBody });
    throw new ApiError({
      kind: "invalid-json",
      message: `JSON 解析失败（HTTP ${response.status}），原始报错已打印到控制台。`,
      url,
      method,
      status: response.status,
      statusText: response.statusText,
      contentType,
      rawBody,
      cause: error,
    });
  }
}

export type ApiFetchInit = RequestInit & {
  /** 日志前缀，例如 "加载消息" */
  context?: string;
};

/**
 * 项目里唯一允许调后端的地方。
 * - 自动补齐 Content-Type / Accept
 * - 网络层失败、非 JSON 响应、HTTP 错误码都会打印可读日志并抛 ApiError
 */
export async function apiFetch<T>(url: string, init: ApiFetchInit = {}): Promise<T> {
  const { context, ...rest } = init;
  const method = (rest.method ?? "GET").toUpperCase();
  const headers = new Headers(rest.headers);
  const body = rest.body;

  // FormData 交给浏览器自己设置 multipart 边界，千万不要手动写 Content-Type
  if (typeof body === "string" && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (!headers.has("accept")) headers.set("accept", "application/json");

  let response: Response;
  try {
    response = await fetch(url, { ...rest, method, headers, credentials: "same-origin" });
  } catch (cause) {
    console.error(
      `[${context ?? "apiFetch"}] 请求没有发出去（网络层失败）：${method} ${url}`,
      cause,
    );
    throw new ApiError({
      kind: "network",
      message: "网络请求失败，请检查网络连接或开发服务器是否在运行。",
      url,
      method,
      cause,
    });
  }

  const payload = await readJsonResponse<T>(response, { method, context });

  if (!response.ok) {
    const serverMessage = extractServerMessage(payload);
    console.error(
      `[${context ?? "apiFetch"}] 服务端返回错误：HTTP ${response.status} ${response.statusText}`,
      payload,
    );
    throw new ApiError({
      kind: "http",
      message: serverMessage ?? `请求失败（HTTP ${response.status}）。`,
      url,
      method,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get("content-type") ?? "",
      payload,
    });
  }

  return payload;
}

/** 把任意异常转成可以直接显示给用户的一句话 */
export function describeApiError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.kind) {
      case "network":
        return "网络异常：请求没有送达服务端。";
      case "not-json":
        return `接口返回的不是 JSON（HTTP ${error.status ?? "?"}）：多半是路由 404、服务端 500 或登录态失效，详情见控制台。`;
      case "invalid-json":
        return "接口返回的 JSON 格式不合法，详情见控制台。";
      default:
        return error.message;
    }
  }
  if (error instanceof Error) return error.message;
  return "发生未知错误，详情见控制台。";
}

/** 判断响应体像不像 HTML，供其它模块复用 */
export function isHtmlLike(body: string): boolean {
  return looksLikeHtml(body);
}
