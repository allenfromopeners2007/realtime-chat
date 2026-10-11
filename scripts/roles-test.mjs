/**
 * 角色工具单测
 *
 * 重点：**owner 必须被当成管理员** ✓
 * 因为全项目有 20 多处"是不是管理员"的判断，漏掉一处，
 * 站长就会出现"有些功能能进、有些进不去"的诡异现象 ✗
 *
 * 跑法：npm run test:roles
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const sourcePath = new URL("../src/lib/roles.ts", import.meta.url);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "roles-test-"));
const tempFile = path.join(tempDir, "roles.mts");
fs.copyFileSync(sourcePath, tempFile);
const mod = await import(`file://${tempFile.replace(/\\/g, "/")}`);
fs.rmSync(tempDir, { recursive: true, force: true });

const { isAdminRole, isOwnerRole, normalizeRole, roleLabel } = mod;

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

console.log("========== 1) isAdminRole：owner 也算管理员 ==========");
check("owner 是管理员", isAdminRole("owner") === true);
check("admin 是管理员", isAdminRole("admin") === true);
check("member 不是管理员", isAdminRole("member") === false);
check("null 安全", isAdminRole(null) === false);
check("undefined 安全", isAdminRole(undefined) === false);
check("脏数据安全", isAdminRole("superuser") === false);
check("数字安全", isAdminRole(1) === false);

console.log("");
console.log("========== 2) isOwnerRole：只有 owner 是所有者 ==========");
check("owner 是", isOwnerRole("owner") === true);
check("admin 不是", isOwnerRole("admin") === false);
check("member 不是", isOwnerRole("member") === false);
check("null 安全", isOwnerRole(null) === false);

console.log("");
console.log("========== 3) normalizeRole ==========");
for (const [input, expected] of [
  ["owner", "owner"],
  ["admin", "admin"],
  ["member", "member"],
  ["", "member"],
  [null, "member"],
  [undefined, "member"],
  ["ADMIN", "member"],
  ["乱写", "member"],
]) {
  const actual = normalizeRole(input);
  check(`${JSON.stringify(input)} → ${expected}`, actual === expected, actual);
}

console.log("");
console.log("========== 4) roleLabel ==========");
check('owner → "所有者"', roleLabel("owner") === "所有者");
check('admin → "管理员"', roleLabel("admin") === "管理员");
check('member → "成员"', roleLabel("member") === "成员");
check('未知值 → "成员"', roleLabel("xyz") === "成员");

console.log("");
console.log("========== 5) 三种角色的关系符合设计 ==========");
check(
  "owner ⊃ admin（owner 能做 admin 的一切）",
  isAdminRole("owner") && isAdminRole("admin") && !isAdminRole("member"),
);
check(
  "owner 与 admin 可以区分开（任免管理员只给 owner）",
  isOwnerRole("owner") && !isOwnerRole("admin"),
);

console.log("");
console.log(`========== 结果：${pass} 项通过 / ${fail} 项失败 ==========`);
process.exitCode = fail === 0 ? 0 : 1;
