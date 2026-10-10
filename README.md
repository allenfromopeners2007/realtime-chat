# 实时聊天室 · Next.js + Tailwind CSS + Supabase

一个深色主题的实时聊天室：Supabase Realtime 推送消息、Storage 存图片/文件、登录后才能发言。

## 需求实现对照

| # | 需求 | 实现位置 |
|---|------|----------|
| 1 | 深色主题、顶部搜索框、底部输入框 + 发送按钮（表情 / 图片 / 文件图标） | `src/components/TopBar.tsx`、`src/components/Composer.tsx`、`src/components/EmojiPicker.tsx`、`src/app/globals.css` |
| 2 | 中间消息列表、右下角悬浮的群组/联系人按钮 | `src/components/MessageList.tsx`、`src/components/DockPanel.tsx` |
| 3 | 登录才能发言；图片上传到 Supabase Storage | `src/app/api/messages/route.ts`（401 拦截）、`src/app/api/upload/route.ts`、`src/lib/supabase/*`、`supabase/schema.sql` |
| 4 | 收到后端数据先判断是不是 JSON，不是就把真实错误打到控制台 | **`src/lib/http.ts`**（`readJsonResponse` / `apiFetch`），全项目对后端的请求都走它 |

## 技术栈

- **Next.js 15**（App Router、Route Handlers、Server Components）
- **React 19** + **TypeScript**（`strict: true`）
- **Tailwind CSS v4**（`@theme` 定义深色主题色板，无需 config 文件）
- **Supabase**：Postgres + RLS、Auth（邮箱密码）、Realtime（`postgres_changes`）、Storage
- 图标全是手写内联 SVG，没有引入任何图标库

## 目录结构

```
src/
├─ app/
│  ├─ layout.tsx              # 深色外壳、语言、viewport
│  ├─ globals.css             # Tailwind v4 主题令牌、滚动条、动画
│  ├─ page.tsx                # 服务端组件：拉取首屏数据 + 当前用户
│  ├─ login/page.tsx          # 登录 / 注册
│  └─ api/
│     ├─ messages/route.ts    # GET 列表&搜索（公开） / POST 发消息（需登录）
│     ├─ upload/route.ts      # POST 上传附件到 Storage（需登录）
│     ├─ rooms/route.ts       # GET 群组列表 / POST 新建群组
│     ├─ members/route.ts     # GET 成员列表
│     └─ me/route.ts          # GET 当前登录用户
├─ components/
│  ├─ ChatRoom.tsx            # 客户端主控：状态、Realtime 订阅、搜索、上传、发送
│  ├─ TopBar.tsx              # 顶部：群组名、连接状态、搜索框、登录/退出
│  ├─ MessageList.tsx         # 消息列表：日期分隔、连续消息合并、回到底部
│  ├─ MessageBubble.tsx       # 单条消息：链接、图片、文件卡片、搜索高亮
│  ├─ Composer.tsx            # 输入区：表情 / 图片 / 文件 / 发送、粘贴与拖拽
│  ├─ EmojiPicker.tsx         # 内置表情面板（无第三方依赖）
│  ├─ DockPanel.tsx           # 右下角悬浮群组/联系人按钮
│  ├─ ImageLightbox.tsx       # 图片大图预览
│  ├─ SetupNotice.tsx         # 未配置 Supabase 时的引导页
│  ├─ Avatar.tsx / Toast.tsx / icons.tsx
├─ lib/
│  ├─ http.ts                 # ★ 安全 JSON 请求层（需求 4）
│  ├─ types.ts                # 领域模型 + 运行时归一化
│  ├─ format.ts               # 时间 / 体积 / 首字母 / 链接解析
│  ├─ env.ts                  # 环境变量集中出口
│  ├─ api-response.ts         # 统一 JSON 响应与错误
│  └─ supabase/{client,server,middleware}.ts
└─ middleware.ts              # 刷新登录 Cookie
supabase/schema.sql           # 建表 + RLS + Storage + Realtime + 初始群组
```

## 快速开始

```bash
# 1. 安装依赖（Windows 上把 cp / rm 换成本地写法）
npm install           # 也可以用 pnpm install / yarn

# 2. 建表：把 supabase/schema.sql 整段粘贴到 Supabase 控制台 → SQL Editor → Run

# 3. 配置环境变量
cp .env.local.example .env.local        # Windows: copy .env.local.example .env.local
#   填入 Supabase 的 Project URL 与 Publishable key（旧版界面叫 anon key）

# 4. 启动
npm run dev           # http://localhost:3000
```

> **Windows / PowerShell 用户注意**
> 如果 `npm install` 报 `无法加载文件 ...\npm.ps1，因为在此系统上禁止运行脚本`，
> 说明执行策略是 Restricted。两个办法：
> ① 用 `npm.cmd install`（直接调批处理文件，绕过 .ps1）；
> ② 一劳永逸：`Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`（不需要管理员权限）。

没配置 `.env.local` 时不会白屏：首页会显示一个引导页告诉你还差哪几步。

### 国内网络：`*.supabase.co` 被拦截怎么办

如果你的浏览器能打开 Supabase 后台（`supabase.com`），但应用报
`连接 Supabase 失败：TypeError: fetch failed / ECONNRESET`，原因是：

| | 走系统代理？ | 结果 |
|---|---|---|
| 浏览器 | ✅ 走 Windows 系统代理 | `supabase.com` 正常 |
| **Node.js / dev server** | ❌ **不看系统代理**（`fetch`/undici 的默认行为） | 直连 `*.supabase.co` → **连接被重置** |

Node 24 起有官方开关可以解决，本项目已封装成一个脚本：

```bash
npm run dev:proxy                                  # 默认代理 http://127.0.0.1:7897
DEV_PROXY=http://127.0.0.1:7890 npm run dev:proxy  # 换成你的代理端口
```

它的本质就是给 Node 进程设置这几个环境变量：

```bash
NODE_USE_ENV_PROXY=1
HTTPS_PROXY=http://127.0.0.1:7897
HTTP_PROXY=http://127.0.0.1:7897
NO_PROXY=localhost,127.0.0.1
```

> 如果你的代理软件开了 **TUN 模式 / 全局模式**，流量在系统层就被接管了，
> 直接用普通的 `npm run dev` 就行。
> 如果 Node 版本低于 24，需要自己装 `undici` 并用 `ProxyAgent` 包一层 fetch。

## 管理后台 `/admin`

管理功能需要先执行一次增量迁移（在已经跑过 `schema.sql` 的项目上）：

```
Supabase → SQL Editor → 粘贴 supabase/admin-migration.sql → Run
```

> 如果还要群组管理（置顶公告 / 只允许管理员建群），再跑一次 `supabase/rooms-migration.sql`。
> 三个脚本都是幂等的，顺序是：`schema.sql` → `admin-migration.sql` → `rooms-migration.sql`。

迁移会做四件事：给 `profiles` 加 `role` / `is_banned` 字段、把**最早注册的账号自动提升为管理员**、
收紧 RLS（禁言用户发不出消息、管理员能删任何消息 / 改任何群组）、以及加两个只有管理员能调用的查询函数。

登录后顶栏会出现「管理」入口，`/admin` 里有四个页签：

| 页签 | 能做什么 |
|---|---|
| **用户** | 查看邮箱 / 注册时间 / 最后登录 / 发言数；改名、设为管理员、**禁言 / 解除禁言** |
| **群组** | 新建、改名改简介、删除（会连带清空该群所有消息，删除前有二次确认） |
| **消息** | 按内容 + 群组检索最近 200 条，删除任意消息（图片消息直接显示缩略图） |
| **附件** | 浏览 Storage 目录树（`<用户id>/<年>/<月>/<文件>`），删除任意文件 |

### 权限模型（重要）

- 管理员身份存在 `profiles.role`，所有校验都在**数据库层**：RLS 策略 + `security definer` 函数里的 `is_admin()`
- **不需要 `service_role` 总钥匙** —— 管理操作全部用管理员自己的登录态完成，接口被绕过也拿不到额外权限
- 「禁言」是**应用级**的：被禁用户仍能登录、能看历史消息，但**发不出消息**（RLS 的 `messages_insert_own` 里检查 `is_banned`）
- 保护措施：不能把最后一个管理员降级、不能禁言管理员、管理员不能对自己执行降级/禁言
- 想要「禁止登录」「彻底删除账号」这类操作，必须接 Supabase Admin API（需要 `service_role`），本项目**刻意没做**，避免把总钥匙放进服务器

### 群组管理（聊天界面内）

管理员在顶栏会看到一个**齿轮按钮**，点开就是当前群组的设置面板：

| 能做什么 | 说明 |
|---|---|
| **改群名 / 简介** | 群名唯一，重名会提示 |
| **📌 置顶公告** | 最多 500 字，显示在消息列表**上方**（不随消息滚动），带「谁在什么时候更新的」；留空 = 取消公告。公告是公开可读的，所有人都能看到 |
| **删除群组** | 二次确认，会**连带删除该群所有消息** |

另外还有两条规则：

- **只有管理员能建群**（`rooms_insert_admin` 策略）。普通用户点悬浮按钮时看不到「新建群组」入口，硬调接口也会被 403
- 公告用 `rooms.announcement` / `announcement_at` / `announcement_by_name` 三个字段存储；
  冗余存展示名是为了读公告时不用 join profiles

## 部署上线

**面向国内用户（同学/同事）请直接看 [DEPLOY.md](DEPLOY.md)** —— 里面有逐步操作。

一句话概括为什么不能只部署 Vercel：

```
浏览器 ──> 你的网站（Vercel）        ✅ 能开
浏览器 ──> *.supabase.co             ❌ 国内很多网络直接重置连接
```

消息、图片、实时推送都是**浏览器直连 Supabase** 的，所以需要一层你自己域名的反向代理：

```
浏览器 ──> 你的网站（Vercel）
浏览器 ──> 你的 Cloudflare Worker ──> Supabase（Worker 在海外，直连正常）
```

代码已经支持这种拆分：

| 环境变量 | 谁用 | 线上填什么 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **浏览器** | 你的反代域名，如 `https://sb.example.com` |
| `SUPABASE_URL_SERVER` | **服务端**（route handler / RSC / middleware） | 官方地址 `https://xxx.supabase.co`（海外机器直连，少绕一跳） |

没配 `SUPABASE_URL_SERVER` 时两者相同，本地开发完全不受影响。

> ⚠️ **只在本地需要**的代理变量（`NODE_USE_ENV_PROXY` / `HTTPS_PROXY`）**不要**配到 Vercel 上，
> 否则服务器会去连不存在的 `127.0.0.1:7897` 而全部失败。

## 排查工具：`/api/diagnose`
连不上 Supabase 时，浏览器打开这几个地址可以快速定位（不需要看代码）：

| 地址 | 作用 |
|---|---|
| `/api/diagnose` | 逐层检查：环境变量 → DNS → 原始 fetch → SDK，并打印 `error.cause` 里的真实原因（`ENOTFOUND` / `ECONNRESET` / 证书错误…） |
| `/api/diagnose?probe=supabase.com` | 拿一个正常的域名做对照，区分"环境没网"和"地址写错" |
| `/api/diagnose?restprobe=<host>` | 用当前 key 真的读一次数据库，验证 URL + key + 表 + RLS |
| `/api/diagnose?dnsbatch=h1,h2` | 批量 DNS 探测（当时就是靠它从几百个猜测里锁定了正确的项目 ref） |

它只会返回 URL 和 key 的**前缀/长度**，不会泄露完整密钥；正式上线前可以直接删掉 `src/app/api/diagnose/`。

### 关于邮箱验证

Supabase 默认开启邮箱验证。本地调试想直接登录的话：
**Authentication → Providers → Email → 关闭 "Confirm email"**，
否则注册后需要先去邮箱点确认链接。

## 需求 4：为什么不会再有 `Unexpected token '<'`

`await response.json()` 遇到 HTML 响应体会抛出
`SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`，
这条报错完全看不出真实原因（404 页面？500 错误页？被重定向到登录页？）。

`src/lib/http.ts` 的做法：

1. 先用 `response.text()` 把正文读成字符串（只读一次，避免 `body already read`）；
2. **先检查 `Content-Type` 是不是 JSON**；
3. 不是 JSON → 在控制台打印：请求方法与 URL、HTTP 状态、`Content-Type`、
   **响应正文前 800 字符**、HTML `<title>`、以及针对性排查建议，然后抛 `ApiError`；
4. 是 JSON 但解析失败 → 打印 `JSON.parse` 的真实错误 + 正文片段；
5. 只有确认合法 JSON 才交给业务代码。

控制台里长这样：

```
================= ✗ API 响应不是 JSON =================
请求:        POST /api/messages
HTTP 状态:   500 Internal Server Error
Content-Type: text/html; charset=utf-8
期望类型:    application/json
HTML 标题:   Application error: a server-side exception has occurred
------ 响应正文（前 800 字符，真实内容）------
<!DOCTYPE html><html><head><meta charSet="utf-8"/>...
------ 排查建议 ------
服务端抛异常并返回了 HTML 错误页：去看运行 `pnpm dev` 的终端里的堆栈。
=====================================================
```

**自己验证一下**：把 `ChatRoom.tsx` 里的 `/api/messages` 改成 `/api/not-exist`，
再发一条消息 —— 页面弹出可读的中文提示，控制台打印上面的完整诊断块，
而不是一句没有信息量的 `Unexpected token '<'`。

配套地，后端所有 route handler 也用 `src/lib/api-response.ts` 统一返回 JSON 错误
（`{ error: "..." }`），两边一起保证报错可读。

## 数据模型

| 表 | 说明 |
|---|---|
| `profiles` | 用户资料（`id` 关联 `auth.users`），注册时由触发器自动创建 |
| `rooms` | 群组 |
| `messages` | 消息。冗余存 `author_name` / `author_avatar`，因为 Realtime 的 payload 不带 join 结果 |

`attachment` 是 jsonb：`{ kind, name, size, mime, path, url }`。

### RLS 规则

- `profiles` / `rooms` / `messages`：**所有人可读**（未登录也能看历史消息）
- `messages` 插入：仅 `authenticated`，且 `auth.uid() = user_id` → 这就是"登录才能发言"的服务端保证
- `rooms` 插入：仅 `authenticated`
- Storage `chat-attachments`：bucket 公开可读；写入仅限登录用户，且对象路径第一段必须是自己的 `uid`

### Realtime

`schema.sql` 里已把 `messages` 加入 `supabase_realtime` 发布。
前端订阅 `postgres_changes` 的 INSERT 事件并按 `room_id` 过滤；
如果订阅失败（离线、Realtime 未开），界面右上角会显示"离线（15s 轮询）"并自动降级为轮询，
不会出现"消息收不到也没提示"的情况。

## 功能细节

- **搜索**：300ms 防抖调 `/api/messages?q=`，带竞态保护（旧请求回来不会覆盖新结果），命中文字高亮
- **输入法友好**：`Enter` 发送前会检查 `isComposing`，中文选词时按回车不会误发
- **上传**：图片 / PDF / Office / zip 等，单文件上限 10MB（前后端都校验），支持**粘贴**和**拖拽**图片
- **消息列表**：按天分隔、同一作者 5 分钟内连续消息合并头像；只在"本来就在底部"时自动滚动，向上翻阅不会被打断
- **悬浮按钮**：右下角按钮打开面板，「群组」页签可切换/新建群组，「联系人」页签列出成员
- **删除消息**：鼠标悬停消息 → 右上角出现垃圾桶图标 → 两步确认后删除。
  权限是「**消息作者本人** 或 **管理员**」（`messages_delete_own_or_admin` 策略）。
  删除时会连带清理 Storage 里的附件，并通过 Realtime 的 `DELETE` 事件**实时同步给其他在线的人**

## 常见问题

| 现象 | 原因 / 解决 |
|---|---|
| 悬停消息看不到删除按钮 | 只有**消息作者本人**和**管理员**能删；另外要先刷新一次页面让新代码生效 |
| 删除消息后附件还在 Storage 里 | 正常流程会连带删除；如果删除 Storage 失败（比如权限问题），终端会打印警告，可到管理后台「附件」页手动删 |
| PowerShell 里 `npm install` 报「禁止运行脚本」 | 执行策略为 Restricted。用 `npm.cmd install`，或 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| 首页显示"还差一步：Supabase 尚未配置" | 没建 `.env.local`，或改完没重启 `npm run dev` |
| 首页顶部黄条「读取数据失败：TypeError: fetch failed」 | 连不上 Supabase：检查 `.env.local` 里的地址/key、项目是否被暂停、本机网络。终端里会打印三条具体错误 |
| 顶部提示 `读取数据失败：relation "public.messages" does not exist` | 还没执行 `supabase/schema.sql` |
| 发消息返回 401 | 没登录或登录态过期了，重新登录即可 |
| 上传返回 403 `没有上传权限` | Storage 策略没建成功，重跑 `schema.sql` 第 6 节 |
| 上传返回 500 `bucket not found` | bucket 没创建，重跑 `schema.sql` |
| 右上角一直"离线（15s 轮询）" | 控制台 Database → Replication 里确认 `messages` 在 `supabase_realtime` 发布中；另外实时推送需要浏览器能连上 Supabase 的 WebSocket |
| 消息发出去但别人看不到 | 检查是否两个浏览器登录了同一账号（Realtime 是广播给所有订阅者的，正常应该能看到） |

## 已知限制 / 可继续做的

- 没有做消息分页（只取最近 100 条）、没有"删除消息"入口（策略已留好）
- 没有限流（生产建议在 `/api/messages` 加 IP / 用户维度的速率限制）
- 成员列表目前是"注册用户列表"，没有做在线状态（可用 Supabase Realtime Presence 扩展）
- 头像目前来自 `profiles.avatar_url`，还没有做"上传自定义头像"的界面

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | **Publishable key**（旧版界面叫 `anon` public key）。两种格式都支持：`sb_publishable_...` 或 `eyJ...`。**绝不要用 Secret key / service_role** |
| `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET` | | 默认 `chat-attachments` |
| `NEXT_PUBLIC_TIMEZONE` | | 默认 `Asia/Shanghai`；服务端和浏览器用同一个时区渲染时间，避免 hydration 不一致 |
