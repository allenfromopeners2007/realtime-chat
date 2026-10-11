/**
 * 附件下载相关的小工具（纯函数，方便单元测试）
 */

/**
 * 把原始文件名整理成可以安全用在 `download` 属性上的名字。
 *
 * 为什么需要：
 *   - 文件名可能带路径（"a/b.txt"）或控制字符，直接塞进 download 会被浏览器忽略 ✗
 *   - 但**中文名要保留** ✓（`download="期末复习.pdf"` 是合法的，也是用户想要的 ✓）
 *
 * 注意：上传到 Supabase Storage 时用的是 ASCII 文件名（Storage 不接受中文 key ✗），
 *      但下载时用的是数据库里存的**原始名字** ✓ 所以这里要保留中文 ✓
 */
export function safeDownloadName(name: string, fallback = "download"): string {
  const base = (name.split(/[\\/]/).pop() ?? "")
    // 去掉控制字符和文件系统非法字符，只替换成下划线
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_")
    .trim();

  if (base === "" || base === "." || base === "..") return fallback;
  // 太长的名字截断（保留扩展名）
  if (base.length <= 120) return base;

  const dot = base.lastIndexOf(".");
  if (dot <= 0) return base.slice(0, 120);
  const ext = base.slice(dot);
  return base.slice(0, Math.max(1, 120 - ext.length)) + ext;
}

/** 附件是不是适合在浏览器里直接预览（而不是只能下载） */
export function isPreviewable(name: string, mime: string): boolean {
  const lower = mime.toLowerCase();
  if (lower.startsWith("image/")) return true;
  if (lower === "application/pdf") return true;
  if (lower.startsWith("text/")) return true;
  return /\.(pdf|png|jpe?g|gif|webp|avif|svg|txt|md|csv|json|log)$/i.test(name);
}
