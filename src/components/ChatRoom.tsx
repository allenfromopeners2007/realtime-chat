"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { CallOverlay } from "@/components/CallOverlay";
import { Composer } from "@/components/Composer";
import { DockPanel } from "@/components/DockPanel";
import { ImageLightbox } from "@/components/ImageLightbox";
import { LoginRequired } from "@/components/LoginRequired";
import { MessageList } from "@/components/MessageList";
import { AnnouncementBanner, RoomSettingsPanel } from "@/components/RoomSettingsPanel";
import { Toast, type ToastState } from "@/components/Toast";
import { TopBar, type ConnectionState } from "@/components/TopBar";
import { isSupabaseConfigured } from "@/lib/env";
import { apiFetch, describeApiError } from "@/lib/http";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isBusy as isCallBusy } from "@/lib/call";
import { useCall } from "@/lib/useCall";
import {
  displayNameOf,
  mergeMessages,
  normalizeMessage,
  type Attachment,
  type Member,
  type Message,
  type Room,
  type SessionUser,
} from "@/lib/types";

/** localStorage 里记住"上次所在的群组"用的键名 */
const LAST_ROOM_KEY = "realtime-chat:last-room";

type Props = {
  initialMessages: Message[];
  initialRooms: Room[];
  initialMembers: Member[];
  initialUser: SessionUser | null;
  /** 服务端读取数据失败时（例如还没执行 schema.sql）显示的提示 */
  notice?: string | null;
};

export function ChatRoom({
  initialMessages,
  initialRooms,
  initialMembers,
  initialUser,
  notice,
}: Props) {
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [rooms, setRooms] = useState<Room[]>(initialRooms);
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [activeRoomId, setActiveRoomId] = useState<string>(initialRooms[0]?.id ?? "");
  const [user, setUser] = useState<SessionUser | null>(initialUser);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Message[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [sending, setSending] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadingRoom, setLoadingRoom] = useState(false);

  const searchSeq = useRef(0);

  /**
   * 记住"上次待在哪个群组"。
   * 为什么需要：即使服务端已经做了稳定排序，种子群组的 created_at 也可能相同，
   * 默认打开哪个群组对用户来说应该是"上次那个"，而不是"排序第一个"。
   * 读取放在 effect 里（挂载后才做），避免服务端渲染和客户端渲染不一致。
   */
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LAST_ROOM_KEY);
      if (!saved || saved === activeRoomId) return;
      if (!rooms.some((room) => room.id === saved)) return;
      setActiveRoomId(saved);
      void loadRoom(saved);
    } catch (error) {
      console.warn("[chat] 读取上次所在群组失败", error);
    }
    // 只在首次挂载执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeRoomId === "") return;
    try {
      window.localStorage.setItem(LAST_ROOM_KEY, activeRoomId);
    } catch {
      // 隐私模式下 localStorage 可能不可用，忽略即可
    }
  }, [activeRoomId]);

  const showToast = useCallback((kind: ToastState["kind"], text: string) => {
    setToast({ id: Date.now(), kind, text });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  // ---------- 实时语音通话（WebRTC + Supabase Realtime 信令）----------
  const {
    state: callState,
    remoteStream: callRemoteStream,
    startCall,
    acceptCall,
    rejectCall,
    hangUp,
    toggleMute,
    turnConfigured,
  } = useCall({ user, members, notify: showToast });

  const callBusy = isCallBusy(callState.phase);

  // ---------- 登录状态：跟着 Supabase 的 auth 事件走 ----------
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let subscription: { unsubscribe: () => void } | null = null;
    try {
      const supabase = getSupabaseBrowserClient();
      const result = supabase.auth.onAuthStateChange((_event, session) => {
        const nextUser = session?.user;
        if (!nextUser) {
          setUser(null);
          return;
        }

        const avatar = nextUser.user_metadata?.avatar_url;

        // 先用本地信息更新界面。
        // 注意：这里必须**保留原有的 isAdmin** —— 服务端渲染时已经查过角色，
        // 而这个回调会在页面加载后立刻触发，如果把 isAdmin 丢了，
        // 顶栏的「管理」按钮就会一闪而过地消失。
        setUser((previous) => ({
          id: nextUser.id,
          email: nextUser.email ?? null,
          name: displayNameOf(nextUser),
          avatarUrl: typeof avatar === "string" ? avatar : null,
          isAdmin: previous?.id === nextUser.id ? previous.isAdmin : undefined,
        }));

        // 再从服务端拿一次权威信息（角色可能刚被改过）
        void apiFetch<{ user: SessionUser | null }>("/api/me", { context: "刷新用户信息" })
          .then((data) => {
            if (data.user) setUser(data.user);
          })
          .catch((error) => {
            console.error("[chat] 刷新用户信息失败", error);
          });
      });
      subscription = result.data.subscription;
    } catch (error) {
      console.error("[chat] 初始化登录状态监听失败", error);
    }

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // ---------- 切换群组时拉历史消息 ----------
  const loadRoom = useCallback(
    async (roomId: string) => {
      if (!isSupabaseConfigured || roomId === "") return;
      // 未登录：RLS 本来就不让读消息，不用白发一次请求
      if (user === null) {
        setMessages([]);
        return;
      }
      setLoadingRoom(true);
      try {
        const data = await apiFetch<{ messages: Message[] }>(
          `/api/messages?roomId=${encodeURIComponent(roomId)}&limit=100`,
          { context: "加载消息" },
        );
        setMessages(data.messages.map(normalizeMessage));
      } catch (error) {
        showToast("error", describeApiError(error));
      } finally {
        setLoadingRoom(false);
      }
    },
    [showToast, user?.id],
  );

  // ---------- Realtime：订阅当前群组的 INSERT ----------
  useEffect(() => {
    if (!isSupabaseConfigured || activeRoomId === "" || user === null) {
      setConnection("offline");
      return;
    }

    let supabase: ReturnType<typeof getSupabaseBrowserClient>;
    try {
      supabase = getSupabaseBrowserClient();
    } catch (error) {
      console.error("[chat] 创建 Supabase 客户端失败", error);
      setConnection("offline");
      return;
    }

    const channel = supabase
      .channel(`room:${activeRoomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${activeRoomId}`,
        },
        (payload) => {
          const incoming = normalizeMessage(payload.new);
          if (incoming.roomId !== "" && incoming.roomId !== activeRoomId) return;
          setMessages((previous) => mergeMessages(previous, [incoming]));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${activeRoomId}`,
        },
        (payload) => {
          // 别人（或管理员）删了消息 → 本地也立刻移除
          const removedId = (payload.old as { id?: string } | null)?.id;
          if (typeof removedId !== "string" || removedId === "") return;
          setMessages((previous) => previous.filter((message) => message.id !== removedId));
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnection("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnection("offline");
        } else setConnection("connecting");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeRoomId, user?.id]);

  // ---------- Realtime 掉线时的兜底轮询 ----------
  useEffect(() => {
    if (connection !== "offline" || !isSupabaseConfigured || activeRoomId === "") return;
    if (user === null) return; // 未登录不轮询
    const timer = window.setInterval(() => {
      void loadRoom(activeRoomId);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [connection, activeRoomId, loadRoom, user?.id]);

  // ---------- 搜索：300ms 防抖 + 竞态保护 ----------
  useEffect(() => {
    const keyword = query.trim();
    if (user === null) {
      // 未登录不能读消息，搜索也没有意义（界面上会显示登录提示）
      searchSeq.current += 1;
      setSearchResults(null);
      setSearching(false);
      return;
    }
    if (keyword === "") {
      searchSeq.current += 1;
      setSearchResults(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    const seq = searchSeq.current + 1;
    searchSeq.current = seq;

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const data = await apiFetch<{ messages: Message[] }>(
            `/api/messages?q=${encodeURIComponent(keyword)}&limit=100`,
            { context: "搜索消息" },
          );
          if (seq !== searchSeq.current) return;
          setSearchResults(data.messages.map(normalizeMessage));
        } catch (error) {
          if (seq !== searchSeq.current) return;
          console.error("[chat] 搜索失败", error);
          showToast("error", describeApiError(error));
          setSearchResults([]);
        } finally {
          if (seq === searchSeq.current) setSearching(false);
        }
      })();
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query, showToast, user?.id]);

  // ---------- 操作 ----------
  const handleSelectRoom = useCallback(
    (roomId: string) => {
      setDockOpen(false);
      if (roomId === activeRoomId) return;
      setActiveRoomId(roomId);
      void loadRoom(roomId);
    },
    [activeRoomId, loadRoom],
  );

  const handleUpload = useCallback(async (file: File): Promise<Attachment> => {
    const form = new FormData();
    form.append("file", file);
    const data = await apiFetch<{ attachment: Attachment }>("/api/upload", {
      method: "POST",
      body: form,
      context: "上传附件",
    });
    return data.attachment;
  }, []);

  const handleSend = useCallback(
    async (content: string, attachment: Attachment | null): Promise<boolean> => {
      if (activeRoomId === "") {
        showToast("error", "还没有可用的群组，请先创建一个");
        return false;
      }

      setSending(true);
      try {
        const data = await apiFetch<{ message: Message }>("/api/messages", {
          method: "POST",
          body: JSON.stringify({ roomId: activeRoomId, content, attachment }),
          context: "发送消息",
        });
        setMessages((previous) => mergeMessages(previous, [normalizeMessage(data.message)]));
        return true;
      } catch (error) {
        showToast("error", describeApiError(error));
        return false;
      } finally {
        setSending(false);
      }
    },
    [activeRoomId, showToast],
  );

  /** 删除消息：作者本人或管理员都能删（权限由服务端 + RLS 双重校验） */
  const handleDeleteMessage = useCallback(
    async (message: Message) => {
      try {
        await apiFetch(`/api/messages?id=${encodeURIComponent(message.id)}`, {
          method: "DELETE",
          context: "删除消息",
        });
        setMessages((previous) => previous.filter((item) => item.id !== message.id));
        setSearchResults((previous) =>
          previous === null ? null : previous.filter((item) => item.id !== message.id),
        );
        showToast("success", "消息已删除");
      } catch (error) {
        showToast("error", describeApiError(error));
        throw error;
      }
    },
    [showToast],
  );

  const handleCreateRoom = useCallback(
    async (name: string): Promise<boolean> => {
      try {
        const data = await apiFetch<{ room: Room }>("/api/rooms", {
          method: "POST",
          body: JSON.stringify({ name }),
          context: "创建群组",
        });
        setRooms((previous) => [...previous, data.room]);
        setMessages([]);
        setActiveRoomId(data.room.id);
        setDockOpen(false);
        showToast("success", `群组「${data.room.name}」创建成功`);
        return true;
      } catch (error) {
        showToast("error", describeApiError(error));
        return false;
      }
    },
    [showToast],
  );

  /** 群组设置保存成功 → 更新本地列表（顶栏群组名、公告栏会立刻跟着变） */
  const handleRoomSaved = useCallback((updated: Room) => {
    setRooms((previous) => previous.map((room) => (room.id === updated.id ? updated : room)));
  }, []);

  /** 群组被删除 → 从列表移除；如果删的正是当前群组，就切到第一个剩下的 */
  const handleRoomDeleted = useCallback(
    (roomId: string) => {
      setRooms((previous) => previous.filter((room) => room.id !== roomId));

      if (roomId === activeRoomId) {
        const fallback = rooms.find((room) => room.id !== roomId)?.id ?? "";
        setActiveRoomId(fallback);
        setMessages([]);
        if (fallback !== "") void loadRoom(fallback);
      }
    },
    [activeRoomId, rooms, loadRoom],
  );

  const handleLogout = useCallback(async () => {
    try {
      await getSupabaseBrowserClient().auth.signOut();
      setUser(null);
      // 关键：本地缓存的消息必须清掉。
      // 不清的话，退出登录后屏幕上还留着刚才的聊天记录（共用电脑时就是泄露）。
      setMessages([]);
      setSearchResults(null);
      setQuery("");
      showToast("info", "已退出登录");
      router.refresh();
    } catch (error) {
      console.error("[chat] 退出登录失败", error);
      showToast("error", "退出登录失败，详情见控制台");
    }
  }, [router, showToast]);

  const activeRoom = useMemo(
    () => rooms.find((room) => room.id === activeRoomId) ?? null,
    [rooms, activeRoomId],
  );

  const searchingActive = query.trim() !== "";
  const visibleMessages = searchResults ?? messages;

  return (
    <div className="relative flex h-dvh flex-col bg-ink-950">
      <TopBar
        roomName={activeRoom?.name ?? "未选择群组"}
        query={query}
        onQueryChange={setQuery}
        connection={connection}
        user={user}
        onLogout={() => void handleLogout()}
        onToggleDock={() => setDockOpen((open) => !open)}
        dockOpen={dockOpen}
        onOpenRoomSettings={activeRoom ? () => setSettingsOpen(true) : undefined}
      />

      {notice && (
        <div className="border-b border-amber-500/25 bg-amber-500/10 px-4 py-2 text-center text-[11px] leading-relaxed text-amber-100">
          {notice}
        </div>
      )}

      {activeRoom && (
        <AnnouncementBanner
          room={activeRoom}
          isAdmin={user?.isAdmin === true}
          onEdit={() => setSettingsOpen(true)}
        />
      )}

      {user === null ? (
        <LoginRequired roomName={activeRoom?.name ?? ""} />
      ) : (
        <MessageList
          messages={visibleMessages}
          currentUserId={user.id}
          isAdmin={user.isAdmin === true}
          query={query}
          loading={loadingRoom && !searchingActive}
          searching={searching}
          onOpenImage={setPreview}
          onDeleteMessage={handleDeleteMessage}
          emptyTitle={activeRoom ? "这里还很安静" : "还没有群组"}
          emptyHint={
            activeRoom
              ? "发出第一条消息，其他人会实时收到。"
              : "点击右下角的悬浮按钮，创建一个群组开始聊天。"
          }
        />
      )}

      <Composer
        user={user}
        sending={sending}
        onSend={handleSend}
        onUpload={handleUpload}
        onError={(text) => showToast("error", text)}
      />

      <DockPanel
        open={dockOpen}
        onToggle={() => setDockOpen((open) => !open)}
        rooms={rooms}
        members={members}
        activeRoomId={activeRoomId}
        onSelectRoom={handleSelectRoom}
        onCreateRoom={handleCreateRoom}
        canCreateRoom={user?.isAdmin === true}
        user={user}
        onCall={(member) => void startCall(member)}
        callBusy={callBusy}
      />

      {settingsOpen && activeRoom && (
        <RoomSettingsPanel
          room={activeRoom}
          onClose={() => setSettingsOpen(false)}
          onSaved={handleRoomSaved}
          onDeleted={handleRoomDeleted}
          notify={showToast}
        />
      )}

      {preview && <ImageLightbox attachment={preview} onClose={() => setPreview(null)} />}

      <CallOverlay
        state={callState}
        remoteStream={callRemoteStream}
        onAccept={() => void acceptCall()}
        onReject={rejectCall}
        onHangUp={hangUp}
        onToggleMute={toggleMute}
        turnConfigured={turnConfigured}
      />

      <Toast state={toast} onDismiss={dismissToast} />
    </div>
  );
}
