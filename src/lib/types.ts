/**
 * 领域模型 + 运行时归一化。
 *
 * 为什么需要归一化：
 * 1. 数据库（PostgREST）返回的行、Realtime 推送的 payload、我们自己 API 返回的 JSON，
 *    三者结构虽然相似但不完全一致，字段可能缺失或为 null。
 * 2. 组件里直接读 row.xxx 很容易在某个字段为空时炸掉。
 * 所以统一在这里转成前端只认的 Message / Room / Member 类型。
 */

export type Attachment = {
  kind: "image" | "file";
  name: string;
  size: number;
  mime: string;
  /** Storage 里的对象路径，删除附件时用得到 */
  path: string;
  /** 可直接访问的公开 URL */
  url: string;
};

export type Message = {
  id: string;
  roomId: string;
  userId: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  content: string;
  attachment: Attachment | null;
  createdAt: string;
};

export type Room = {
  id: string;
  name: string;
  description: string | null;
  /** 置顶公告（管理员可编辑），显示在消息列表上方 */
  announcement: string | null;
  announcementAt: string | null;
  announcementByName: string | null;
  createdAt: string;
};

export type Member = {
  id: string;
  username: string;
  avatarUrl: string | null;
  createdAt: string;
};

export type SessionUser = {
  id: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
  /** 是否是管理员（决定顶栏要不要显示「管理」入口） */
  isAdmin?: boolean;
};

/** 管理页：用户行 */
export type AdminUser = {
  id: string;
  username: string;
  email: string | null;
  role: "admin" | "member";
  isBanned: boolean;
  bannedReason: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  messageCount: number;
};

/** 管理页：群组行 */
export type AdminRoom = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  messageCount: number;
  lastMessageAt: string | null;
};

/** 管理页：消息行（带群组名，方便直接看） */
export type AdminMessage = Message & { roomName: string };

/** 管理页：Storage 里的一个对象或文件夹 */
export type StorageEntry = {
  name: string;
  path: string;
  isFolder: boolean;
  size: number;
  updatedAt: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function strOrNull(value: unknown): string | null {
  const result = str(value, "");
  return result === "" ? null : result;
}

/** 把任意来源的附件字段转成 Attachment，无法识别时返回 null */
export function normalizeAttachment(value: unknown): Attachment | null {
  let source: unknown = value;

  // Postgres 里存的是 jsonb：有时会被驱动返回成字符串
  if (typeof source === "string") {
    const text = source.trim();
    if (text === "" || text === "null") return null;
    try {
      source = JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  }

  if (!isRecord(source)) return null;

  const url = str(source.url);
  if (url === "") return null;

  const mime = str(source.mime, "application/octet-stream");
  const kind = source.kind === "image" || mime.startsWith("image/") ? "image" : "file";

  return {
    kind,
    name: str(source.name, "未命名文件"),
    size: num(source.size, 0),
    mime,
    path: str(source.path),
    url,
  };
}

/** 把任意来源的一行消息转成 Message */
export function normalizeMessage(row: unknown): Message {
  const source = isRecord(row) ? row : {};
  // 注意：这里的兜底值必须是"确定性"的（不能用 Date.now()/randomUUID()），
  // 否则同一份数据在服务端和浏览器上算出的结果不同，会触发 hydration 报错。
  const ids = str(source.id);
  const createdAt = str(source.created_at ?? source.createdAt);
  const authorName = str(source.author_name ?? source.authorName, "匿名用户");
  return {
    id: ids !== "" ? ids : `local-${createdAt}-${authorName}`,
    roomId: str(source.room_id ?? source.roomId),
    userId: strOrNull(source.user_id ?? source.userId),
    authorName,
    authorAvatarUrl: strOrNull(source.author_avatar ?? source.authorAvatarUrl),
    content: str(source.content),
    attachment: normalizeAttachment(source.attachment),
    createdAt,
  };
}

export function normalizeRoom(row: unknown): Room {
  const source = isRecord(row) ? row : {};
  return {
    id: str(source.id),
    name: str(source.name, "未命名群组"),
    description: strOrNull(source.description),
    announcement: strOrNull(source.announcement),
    announcementAt: strOrNull(source.announcement_at ?? source.announcementAt),
    announcementByName: strOrNull(source.announcement_by_name ?? source.announcementByName),
    createdAt: str(source.created_at ?? source.createdAt),
  };
}

export function normalizeMember(row: unknown): Member {
  const source = isRecord(row) ? row : {};
  return {
    id: str(source.id),
    username: str(source.username, "匿名用户"),
    avatarUrl: strOrNull(source.avatar_url ?? source.avatarUrl),
    createdAt: str(source.created_at ?? source.createdAt),
  };
}

export function normalizeAdminUser(row: unknown): AdminUser {
  const source = isRecord(row) ? row : {};
  return {
    id: str(source.id),
    username: str(source.username, "匿名用户"),
    email: strOrNull(source.email),
    role: source.role === "admin" ? "admin" : "member",
    isBanned: source.is_banned === true || source.isBanned === true,
    bannedReason: strOrNull(source.banned_reason ?? source.bannedReason),
    createdAt: str(source.created_at ?? source.createdAt),
    lastSignInAt: strOrNull(source.last_sign_in_at ?? source.lastSignInAt),
    messageCount: num(source.message_count ?? source.messageCount, 0),
  };
}

export function normalizeAdminRoom(row: unknown): AdminRoom {
  const source = isRecord(row) ? row : {};
  return {
    id: str(source.id),
    name: str(source.name, "未命名群组"),
    description: strOrNull(source.description),
    createdAt: str(source.created_at ?? source.createdAt),
    messageCount: num(source.message_count ?? source.messageCount, 0),
    lastMessageAt: strOrNull(source.last_message_at ?? source.lastMessageAt),
  };
}

/** 消息按时间升序排列（同一毫秒时用 id 兜底，保证顺序稳定） */
export function sortMessages(list: Message[]): Message[] {
  return [...list].sort((a, b) => {
    if (a.createdAt === b.createdAt) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    return a.createdAt < b.createdAt ? -1 : 1;
  });
}

/** 按 id 去重后追加（Realtime 推送和 API 返回可能拿到同一条消息） */
export function mergeMessages(current: Message[], incoming: Message[]): Message[] {
  const map = new Map<string, Message>();
  for (const item of current) map.set(item.id, item);
  for (const item of incoming) map.set(item.id, item);
  return sortMessages([...map.values()]);
}

/** 从 Supabase 用户对象里取一个可读的名字 */
export function displayNameOf(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): string {
  const metadata = user.user_metadata ?? {};
  const fromMeta = metadata.username ?? metadata.full_name ?? metadata.name;
  if (typeof fromMeta === "string" && fromMeta.trim() !== "") return fromMeta.trim();
  const email = user.email ?? "";
  return email.includes("@") ? email.split("@")[0] : email || "匿名用户";
}
