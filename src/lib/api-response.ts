import { NextResponse } from "next/server";

/**
 * 统一的 API 响应工具。
 *
 * 关键点：所有错误都必须以 JSON 返回（而不是抛出去让 Next 渲染 HTML 错误页），
 * 否则前端拿到的就是 "<!DOCTYPE html>"，触发 "Unexpected token <"。
 * 前端那边还有一层兜底（src/lib/http.ts），两边一起保证报错可读。
 */

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function jsonError(
  message: string,
  status = 400,
  extra?: Record<string, unknown>,
): NextResponse {
  if (status >= 500) {
    console.error(`[api] ${status} ${message}`, extra ?? "");
  } else {
    console.warn(`[api] ${status} ${message}`, extra ?? "");
  }
  return NextResponse.json({ error: message, ...(extra ?? {}) }, { status });
}

/** 未登录统一走这里，前端可据此弹出登录引导 */
export function jsonUnauthorized(message = "请先登录后再操作"): NextResponse {
  return jsonError(message, 401);
}

/** 读取 JSON 请求体：解析失败时返回可直接 return 的 400 响应，而不是抛异常 */
export async function readJsonBody<T>(
  request: Request,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let raw = "";
  try {
    raw = await request.text();
  } catch (error) {
    console.error("[api] 读取请求体失败", error);
    return { ok: false, response: jsonError("读取请求体失败", 400) };
  }

  if (raw.trim() === "") return { ok: true, data: {} as T };

  try {
    return { ok: true, data: JSON.parse(raw) as T };
  } catch (error) {
    console.error("[api] 请求体不是合法 JSON", error, raw.slice(0, 300));
    return { ok: false, response: jsonError("请求体不是合法 JSON", 400) };
  }
}
