/**
 * 附件下载工具的单测
 *
 * 重点：safeDownloadName 必须**保留中文名**（用户就是要看到原名 ✓）
 * 同时不能让路径/控制字符混进去（否则浏览器会忽略 download 属性 ✗）
 *
 * 跑法：npm run test:download
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const sourcePath = new URL("../src/lib/download.ts", import.meta.url);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "download-test-"));
const tempFile = path.join(tempDir, "download.mts");
fs.copyFileSync(sourcePath, tempFile);
const mod = await import(`file://${tempFile.replace(/\\/g, "/")}`);
fs.rmSync(tempDir, { recursive: true, force: true });

const { safeDownloadName, isPreviewable } = mod;

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

console.log("========== 1) 保留中文文件名 ==========");
check("中文名原样保留", safeDownloadName("期末复习资料.pdf") === "期末复习资料.pdf");
check("中英混合也行", safeDownloadName("第1章-Notes.docx") === "第1章-Notes.docx");
check("带空格的保留", safeDownloadName("my report final.pdf") === "my report final.pdf");

console.log("");
console.log("========== 2) 去掉路径（防目录穿越）==========");
check("POSIX 路径只留文件名", safeDownloadName("/etc/passwd") === "passwd");
check("Windows 路径只留文件名", safeDownloadName("C:\\Users\\me\\a.txt") === "a.txt");
check("相对路径", safeDownloadName("../../secret.txt") === "secret.txt");

console.log("");
console.log("========== 3) 清理非法字符 ==========");
check("冒号换成下划线", safeDownloadName('a:b".txt') === 'a_b_.txt');
check("尖括号/竖线", safeDownloadName("a<b>|c.txt") === "a_b__c.txt");
check("控制字符", safeDownloadName("a\u0000b.txt") === "a_b.txt");
check("两边空格去掉", safeDownloadName("  name.txt  ") === "name.txt");

console.log("");
console.log("========== 4) 兜底值 ==========");
check("空字符串用兜底", safeDownloadName("", "附件") === "附件");
check("只有斜杠用兜底", safeDownloadName("/", "附件") === "附件");
check("只有点用兜底", safeDownloadName("..", "附件") === "附件");
check("默认兜底是 download", safeDownloadName("") === "download");

console.log("");
console.log("========== 5) 超长名字截断但保留扩展名 ==========");
{
  const long = "很长的名字".repeat(40) + ".pdf";
  const result = safeDownloadName(long);
  check("长度不超过 120", result.length <= 120, `${result.length} 字符`);
  check("扩展名还在", result.endsWith(".pdf"), result.slice(-12));
}
{
  const longNoExt = "x".repeat(200);
  check("没有扩展名也能截断", safeDownloadName(longNoExt).length === 120);
}

console.log("");
console.log("========== 6) 哪些能预览 ==========");
for (const [name, mime, expected] of [
  ["a.png", "image/png", true],
  ["a.pdf", "application/pdf", true],
  ["a.txt", "text/plain", true],
  ["a.pdf", "application/octet-stream", true],
  ["a.zip", "application/zip", false],
  ["a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", false],
  ["a.m4a", "audio/mp4", false],
]) {
  const actual = isPreviewable(name, mime);
  check(`${name} (${mime.slice(0, 24)}) → ${expected ? "可预览" : "只下载"}`, actual === expected);
}

console.log("");
console.log(`========== 结果：${pass} 项通过 / ${fail} 项失败 ==========`);
process.exitCode = fail === 0 ? 0 : 1;
