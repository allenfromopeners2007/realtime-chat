import type { SupabaseClient } from "@supabase/supabase-js";

import { ChatRoom } from "@/components/ChatRoom";
import { SetupNotice } from "@/components/SetupNotice";
import { isSupabaseConfigured, SUPABASE_URL_SERVER } from "@/lib/env";
import { describeError, hintForFetchError } from "@/lib/errors";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  displayNameOf,
  normalizeMember,
  normalizeMessage,
  normalizeRoom,
  type Member,
  type Message,
  type Room,
  type SessionUser,
} from "@/lib/types";

// 每次都读最新的数据库状态（聊天室不需要静态化）
export const dynamic = "force-dynamic";

type InitialData = {
  messages: Message[];
  rooms: Room[];
  members: Member[];
  user: SessionUser | null;
  problem: string | null;
};

/**
 * 首屏数据全部在这里拿。
 * 任何一步失败都只降级（返回空列表 + 一句提示），不让整个页面 500——
 * 比如 Supabase 地址填错、项目被暂停、本机断网，用户看到的应该是一个能用的空聊天室 + 提示条。
 */
async function loadInitialData(supabase: SupabaseClient): Promise<InitialData> {
  const empty: InitialData = {
    messages: [],
    rooms: [],
    members: [],
    user: null,
    problem: null,
  };

  try {
    const [messagesResult, roomsResult, membersResult, authResult] = await Promise.all([
      supabase.from("messages").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("rooms").select("*").order("created_at", { ascending: true }).order("name", { ascending: true }).limit(100),
      supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.auth.getUser(),
    ]);

    // 表不存在 / RLS 策略缺失，都会在这里暴露到终端
    if (messagesResult.error) {
      console.error("[page] 读取消息失败：", messagesResult.error.message);
    }
    if (roomsResult.error) {
      console.error("[page] 读取群组失败：", roomsResult.error.message);
    }
    if (membersResult.error) {
      console.error("[page] 读取成员失败：", membersResult.error.message);
    }

    const rooms: Room[] = (roomsResult.data ?? []).map(normalizeRoom);
    const activeRoomId = rooms[0]?.id ?? "";

    const messages: Message[] = (messagesResult.data ?? [])
      .map(normalizeMessage)
      .filter((message) => activeRoomId === "" || message.roomId === activeRoomId)
      .reverse();

    const members: Member[] = (membersResult.data ?? []).map(normalizeMember);

    const authUser = authResult.data.user;
    const avatar = authUser?.user_metadata?.avatar_url;

    // 额外查一次当前用户的角色，决定顶栏要不要显示「管理」入口。
    // 如果还没执行 admin-migration.sql，这里会报字段不存在 → 当作普通用户处理，不影响聊天。
    let isAdmin = false;
    if (authUser) {
      const { data: roleRow, error: roleError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authUser.id)
        .maybeSingle();
      if (roleError) {
        console.warn("[page] 读取角色失败（可能还没执行 admin-migration.sql）：", roleError.message);
      } else {
        isAdmin = roleRow?.role === "admin";
      }
    }

    const user: SessionUser | null = authUser
      ? {
          id: authUser.id,
          email: authUser.email ?? null,
          name: displayNameOf(authUser),
          avatarUrl: typeof avatar === "string" ? avatar : null,
          isAdmin,
        }
      : null;

    const schemaProblem = messagesResult.error ?? roomsResult.error;

    return {
      messages,
      rooms,
      members,
      user,
      problem: schemaProblem
        ? `读取数据失败：${schemaProblem.message}。如果数据库还是空的，请先在 Supabase SQL Editor 执行 supabase/schema.sql。`
        : null,
    };
  } catch (error) {
    const detail = describeError(error);
    console.error(`[page] 读取初始数据时抛出异常（目标 ${SUPABASE_URL_SERVER}）：${detail}`, error);
    const hint = hintForFetchError(error, SUPABASE_URL_SERVER);
    return {
      ...empty,
      problem: `连接 Supabase 失败：${detail}${hint ? ` —— ${hint}` : ""}`,
    };
  }
}

export default async function Page() {
  if (!isSupabaseConfigured) {
    return <SetupNotice />;
  }

  const supabase = await getSupabaseServerClient();
  const { messages, rooms, members, user, problem } = await loadInitialData(supabase);

  return (
    <ChatRoom
      initialMessages={messages}
      initialRooms={rooms}
      initialMembers={members}
      initialUser={user}
      notice={problem}
    />
  );
}
