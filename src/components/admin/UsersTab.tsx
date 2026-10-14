"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Badge,
  Button,
  Card,
  DangerAction,
  Empty,
  ErrorBox,
  Loading,
  TableWrap,
  Td,
  Th,
} from "@/components/admin/ui";
import { InviteResultCard, type InviteResult } from "@/components/admin/InviteResultCard";
import { apiFetch, describeApiError } from "@/lib/http";
import { formatTime } from "@/lib/format";
import { normalizeAdminUser, type AdminUser } from "@/lib/types";

type Props = {
  adminId: string;
  /** 是不是所有者：只有所有者能任免管理员 */
  isOwner: boolean;
  notify: (kind: "success" | "error" | "info", text: string) => void;
};

export function UsersTab({ adminId, isOwner, notify }: Props) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  /** 正在给谁设密码（内联输入框） */
  const [passwordFor, setPasswordFor] = useState<string | null>(null);
  const [passwordValue, setPasswordValue] = useState("");
  /** 「重发邀请」的结果（含可复制的链接） */
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);

  /**
   * 管理员直接给账号设一个密码 —— 最可靠的加人方式 ✓
   *
   * 为什么需要它：邀请链接是一次性令牌 ✗ 会被"重发"/链接预览消耗掉，
   * 邮件投递也不稳 ✗ 而同学本来就常用微信接收信息 ✓
   * 设好密码后把「邮箱 + 密码」发给同学，他打开网址就能登录 ✓
   */
  async function applyPassword(user: AdminUser) {
    const password = passwordValue.trim();
    if (password.length < 6) {
      notify("error", "密码至少要 6 位");
      return;
    }

    setBusyId(user.id);
    try {
      await apiFetch("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({ userId: user.id, action: "setPassword", password }),
        context: "设置密码",
      });
      setPasswordFor(null);
      setPasswordValue("");
      notify(
        "success",
        `已给 ${user.username} 设好密码：${password} —— 复制这个密码，连同他的邮箱一起发给同学`,
      );
    } catch (cause) {
      notify("error", describeApiError(cause));
    } finally {
      setBusyId(null);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ users: AdminUser[] }>("/api/admin/users", {
        context: "读取用户列表",
      });
      setUsers(data.users.map(normalizeAdminUser));
    } catch (cause) {
      setError(describeApiError(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 重发邀请：给"已经存在但卡在设置密码"的同学重新生成邮件 + 可复制链接 ✓
   * 复用 /api/admin/invite（它会按 invite → recovery → magiclink 依次尝试生成链接）
   */
  async function resendInvite(user: AdminUser) {
    const target = (user.email ?? "").trim();
    if (target === "") {
      notify("error", "这个账号没有邮箱，无法重发邀请");
      return;
    }

    setBusyId(user.id);
    setInviteResult(null);
    try {
      const data = await apiFetch<InviteResult>("/api/admin/invite", {
        method: "POST",
        body: JSON.stringify({ email: target }),
        context: "重发邀请",
      });
      setInviteResult(data);
      notify(
        data.inviteLink ? "success" : "error",
        data.inviteLink
          ? `已为 ${user.username} 重新生成邀请 ✓ 把下面的链接发给他`
          : "重发失败，请看下方提示",
      );
    } catch (cause) {
      const message = describeApiError(cause);
      notify("error", message);
    } finally {
      setBusyId(null);
    }
  }
  async function patch(userId: string, body: Record<string, unknown>, successText: string) {
    setBusyId(userId);
    try {
      await apiFetch("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({ userId, ...body }),
        context: "修改用户",
      });
      notify("success", successText);
      await load();
    } catch (cause) {
      notify("error", describeApiError(cause));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <Loading text="正在读取用户…" />;
  if (error) return <ErrorBox message={error} onRetry={() => void load()} />;
  if (users.length === 0) return <Empty text="还没有用户" />;

  return (
    <Card
      title={`用户（${users.length}）`}
      subtitle="封禁后该用户仍能登录、能看历史消息，但无法发言 —— 由数据库 RLS 强制执行，绕不过去"
      actions={<Button onClick={() => void load()}>刷新</Button>}
    >
      {inviteResult && (
        <div className="mb-4">
          <InviteResultCard
            result={inviteResult}
            notify={notify}
            title={`重新邀请：${inviteResult.email}`}
          />
        </div>
      )}

      <TableWrap>
        <thead>
          <tr className="border-b border-ink-800">
            <Th>昵称</Th>
            <Th>邮箱</Th>
            <Th>角色</Th>
            <Th>状态</Th>
            <Th className="text-right">发言</Th>
            <Th>注册</Th>
            <Th>最后登录</Th>
            <Th className="text-right">操作</Th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const isSelf = user.id === adminId;
            const busy = busyId === user.id;

            return (
              <tr key={user.id} className="border-b border-ink-800/60 last:border-0">
                <Td>
                  {renamingId === user.id ? (
                    <span className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        maxLength={24}
                        className="h-7 w-28 rounded-lg border border-ink-700 bg-ink-950 px-2 text-xs text-ink-100 outline-none focus:border-brand-500/60"
                      />
                      <Button
                        variant="primary"
                        busy={busy}
                        onClick={() => {
                          const name = renameValue.trim();
                          if (name === "") return;
                          void patch(user.id, { action: "rename", username: name }, "昵称已更新");
                          setRenamingId(null);
                        }}
                      >
                        存
                      </Button>
                      <Button onClick={() => setRenamingId(null)}>×</Button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium text-ink-100">{user.username}</span>
                      {isSelf && <Badge tone="brand">你</Badge>}
                    </span>
                  )}
                </Td>

                <Td className="text-ink-400">{user.email ?? "—"}</Td>

                <Td>
                  {user.role === "owner" ? (
                    <Badge tone="brand">👑 所有者</Badge>
                  ) : user.role === "admin" ? (
                    <Badge tone="brand">管理员</Badge>
                  ) : (
                    <Badge>成员</Badge>
                  )}
                </Td>

                <Td>
                  {user.isBanned ? (
                    <Badge tone="danger" >已禁言</Badge>
                  ) : (
                    <Badge tone="success">正常</Badge>
                  )}
                  {user.isBanned && user.bannedReason && (
                    <span className="ml-1 text-[10px] text-ink-500">{user.bannedReason}</span>
                  )}
                </Td>

                <Td className="text-right tabular-nums">{user.messageCount}</Td>
                <Td className="text-ink-500">{formatTime(user.createdAt)}</Td>
                <Td className="text-ink-500">
                  {user.lastSignInAt ? formatTime(user.lastSignInAt) : "从未"}
                </Td>

                <Td>
                  {passwordFor === user.id ? (
                    <span className="flex flex-wrap items-center justify-end gap-1.5">
                      <input
                        autoFocus
                        value={passwordValue}
                        onChange={(event) => setPasswordValue(event.target.value)}
                        maxLength={72}
                        placeholder="新密码（≥6 位）"
                        className="h-7 w-32 rounded-lg border border-ink-700 bg-ink-950 px-2 text-xs text-ink-100 outline-none focus:border-brand-500/60"
                      />
                      <Button
                        variant="primary"
                        busy={busy}
                        onClick={() => void applyPassword(user)}
                      >
                        存
                      </Button>
                      <Button
                        onClick={() => {
                          setPasswordFor(null);
                          setPasswordValue("");
                        }}
                      >
                        ×
                      </Button>
                    </span>
                  ) : (
                    <span className="flex flex-wrap items-center justify-end gap-1.5">
                      <Button
                        onClick={() => {
                          setRenamingId(user.id);
                          setRenameValue(user.username);
                        }}
                        disabled={busy}
                      >
                        改名
                      </Button>

                      {/* 设密码：只有所有者能做（能接管账号，属于高危操作）*/}
                      {isOwner && (
                        <Button
                          onClick={() => {
                            setPasswordFor(user.id);
                            setPasswordValue("");
                          }}
                          disabled={busy}
                          title="直接给这个账号设一个密码，然后把「邮箱 + 密码」发给同学（最可靠的加人方式）"
                        >
                          设密码
                        </Button>
                      )}

                      <Button
                        onClick={() => void resendInvite(user)}
                        disabled={busy}
                        title="给这个人重新生成邀请邮件 + 可复制的链接（卡在设置密码的人用这个）"
                      >
                        重发邀请
                      </Button>

                    {/* 任免管理员：只有所有者(owner)能操作 ✓ 普通管理员看不到这些按钮 */}
                    {isOwner && user.role === "owner" ? (
                      <span className="px-1 text-[10px] text-ink-500">所有者不可降级</span>
                    ) : isOwner && user.role === "admin" ? (
                      <Button
                        onClick={() =>
                          void patch(user.id, { action: "setRole", role: "member" }, "已降为普通成员")
                        }
                        disabled={busy || isSelf}
                        title={isSelf ? "不能取消自己的管理员身份" : undefined}
                      >
                        降为成员
                      </Button>
                    ) : isOwner ? (
                      <Button
                        variant="primary"
                        onClick={() =>
                          void patch(user.id, { action: "setRole", role: "admin" }, "已设为管理员")
                        }
                        disabled={busy}
                      >
                        设为管理员
                      </Button>
                    ) : null}

                    {user.isBanned ? (
                      <Button
                        onClick={() => void patch(user.id, { action: "setBan", banned: false }, "已解除禁言")}
                        disabled={busy}
                      >
                        解除禁言
                      </Button>
                    ) : (
                      <DangerAction
                        label="禁言"
                        confirmLabel="确认禁言？"
                        busy={busy}
                        title={isSelf ? "不能禁言自己" : undefined}
                        onConfirm={() =>
                          void patch(user.id, { action: "setBan", banned: true }, "已禁言")
                        }
                      />
                    )}
                  </span>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
    </Card>
  );
}
