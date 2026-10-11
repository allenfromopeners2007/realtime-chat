/**
 * 角色判定（纯函数，方便单测）
 *
 * 三种角色：
 *   owner  = 所有者（站长）：拥有管理员的一切能力 + **只有他能任免管理员**
 *   admin  = 管理员：删消息、禁言、管群组、看后台
 *   member = 普通成员
 *
 * 为什么要集中在这里：全项目有 20 多处判断"是不是管理员"，
 * 一旦出现 `role === "admin"` 这种写法，owner 就会被漏掉 ✗（站长反而进不去后台）
 */

export type Role = "owner" | "admin" | "member";

/** 是不是管理员（owner 也算 ✓ 因为 owner 拥有管理员的一切能力） */
export function isAdminRole(role: unknown): boolean {
  return role === "admin" || role === "owner";
}

/** 是不是所有者（只有他能任免管理员） */
export function isOwnerRole(role: unknown): boolean {
  return role === "owner";
}

/** 数据库里的角色值 → 规范化（防止脏数据把界面搞乱） */
export function normalizeRole(role: unknown): Role {
  if (role === "owner") return "owner";
  if (role === "admin") return "admin";
  return "member";
}

/** 界面上的角色名 */
export function roleLabel(role: unknown): string {
  switch (normalizeRole(role)) {
    case "owner":
      return "所有者";
    case "admin":
      return "管理员";
    default:
      return "成员";
  }
}
