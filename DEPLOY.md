# 部署指南：Vercel + Cloudflare Worker（国内可用 · 免费）

> 目标：让**国内的同学/同事不用开代理**就能用这个聊天室。

## 为什么不能只部署 Vercel

```
浏览器 ──①──> 你的网站（Vercel）        ← 这个能正常访问
浏览器 ──②──> *.supabase.co             ← ❌ 国内很多网络会直接重置连接
```

聊天消息、图片、实时推送都走 ②，所以**只部署 Vercel 的话，同学打开是能开，但发不出消息、看不到图**。

解决办法：加一层你自己域名的反向代理，让浏览器改成走 ③：

```
浏览器 ──①──> 你的网站（Vercel）
浏览器 ──③──> 你的 Cloudflare Worker ──> Supabase（Worker 在海外，直连没问题）
```

代码已经支持这种拆分（`SUPABASE_URL_SERVER` 环境变量），你只需要配好环境变量。

---

## 需要准备

| 东西 | 是否必须 | 说明 |
|---|---|---|
| GitHub 账号 | ✅ 你有 | 存代码，Vercel 从它拉取 |
| Cloudflare 账号 | ✅ 要注册 | 免费，2 分钟；用来跑那个 Worker |
| Vercel 账号 | ✅ 要注册 | 免费，建议直接用 GitHub 登录 |
| **一个域名** | ✅ **基本必须** | 见下方实测结论。域名 ¥10–60/年 |

> **实测结论（2026-10，中国大陆某 ISP，全部为不挂代理的直连测试）**
>
> | 目标 | 结果 | 说明 |
> |---|---|---|
> | `supabase-proxy.xxx.workers.dev` | ❌ 超时 | **`*.workers.dev` 被墙，免费子域不能用** |
> | `www.cloudflare.com` | ✅ 200 | Cloudflare 边缘可达 |
> | `developers.cloudflare.com` | ✅ 200 | 同上 |
> | `cdnjs.cloudflare.com` | ✅ 200 | 第三方 Cloudflare 域名也通 → 不是官网特例 |
> | `1.1.1.1` | ❌ 000 | Cloudflare 的 DNS 网站，被墙属正常 |
>
> 结论：**封锁针对的是 `workers.dev` 这个域名，不是 Cloudflare 的 IP。**
> 所以**必须做第 6 步把自定义域名绑到 Worker 上**，绑完直连就能通。
>
> 自测命令（在终端直连测试，`curl.exe` 不读系统代理）：
> ```powershell
> curl.exe -s https://sb.你的域名/__health
> ```

---

## 第一步：把代码推到 GitHub

```powershell
cd "C:\Users\18855\Documents\deepseek-harness\default-workspace\realtime-chat"
git add .
git commit -m "realtime chat room"
```

然后：

1. 打开 https://github.com/new
2. **Repository name** 填 `realtime-chat`，可见性选 **Private**（推荐）或 Public
3. 不要勾选 "Add a README" 之类的初始化选项 → 点 **Create repository**
4. 回到终端，把下面两行的 `<你的用户名>` 换掉后执行：

```powershell
git remote add origin https://github.com/<你的用户名>/realtime-chat.git
git push -u origin main
```

第一次推送会弹浏览器让你登录 GitHub 授权（Git Credential Manager 自动处理），按提示点几下即可。

> `.gitignore` 已经排除了 `.env.local` 和 `node_modules`，密钥不会被传上去。

---

## 第二步：Cloudflare Worker 反代 Supabase

1. 打开 https://dash.cloudflare.com/sign-up 注册（只要邮箱 + 密码，免费）
2. 左侧菜单 → **Workers & Pages** → **Create** → 选 **Worker**（新版可能是 `Create application` → `Worker`）
3. 名字填 `supabase-proxy` → **Deploy**（先部署它默认的 Hello World）
4. 点 **Edit code**（或 `</> Edit code`）→ 把编辑器里的内容**全选删掉** → 粘贴本项目的
   **`deploy/supabase-proxy-worker.js`** 全文 → 右上角 **Deploy**
5. 回到这个 Worker 的页面 → **Settings** → **Variables and Secrets**（旧版叫 Environment Variables）
   → **Add**：

   | 类型 | 名称 | 值 |
   |---|---|---|
   | Text | `SUPABASE_HOST` | `lvntlhgpalgbgrsloxyy.supabase.co` |

   > ⚠️ 只填域名，**不要带 `https://`**，也不要带结尾斜杠。

6. 再点一次 **Deploy** 保存
7. 记下这个 Worker 的访问地址，形如：

   ```
   https://supabase-proxy.<你的账号子域>.workers.dev
   ```

8. **自检**：在浏览器里打开

   ```
   https://supabase-proxy.<你的账号子域>.workers.dev/__health
   ```

   应该看到 `{"ok":true,"upstream":"lvntlhgpalgbgrsloxyy.supabase.co","hint":"配置正常"}`

   - 如果 `ok:false` → `SUPABASE_HOST` 变量没生效，回第 5 步检查
   - 如果打不开 → 说明 `workers.dev` 在你这边不通，需要做第 6 步绑域名

---

## 第三步：Vercel 部署

1. 打开 https://vercel.com/signup → 选 **Continue with GitHub** 授权
2. **Add New… → Project** → 找到 `realtime-chat` → **Import**
3. 展开 **Environment Variables**，逐个添加（注意区分大小写）：

   | 名称 | 值 |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://supabase-proxy.<你的账号子域>.workers.dev` |
   | `SUPABASE_URL_SERVER` | `https://lvntlhgpalgbgrsloxyy.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 你的 `sb_publishable_...`（46 字符） |
   | `NEXT_PUBLIC_TIMEZONE` | `Asia/Shanghai`（可选） |
   | `NEXT_PUBLIC_MAX_UPLOAD_BYTES` | `4194304`（可选，见下方说明） |

   > 🚫 **千万不要**添加 `HTTP_PROXY` / `HTTPS_PROXY` / `NODE_USE_ENV_PROXY` ——
   > 那是你**本地**用来绕过网络的，Vercel 服务器在海外直连就行，填了反而全部报错。

4. Framework 会自动识别为 **Next.js**，Build/Output 都不用改
5. 点 **Deploy**，等 1–2 分钟，拿到 `https://<项目名>.vercel.app`

> **为什么建议设 `NEXT_PUBLIC_MAX_UPLOAD_BYTES=4194304`**：
> Vercel 的函数请求体上限是 **4.5 MB**，超过会被平台直接拒掉。
> 设成 4 MB（4194304 字节）能让前端提前给出友好提示，而不是莫名失败。

---

## 第四步：Supabase 控制台配置

1. **Authentication → URL Configuration**
   - **Site URL** 改成你的线上地址：`https://<项目名>.vercel.app`（绑了域名就填 `https://app.你的域名`）
   - **Redirect URLs** 添加一条：`https://<项目名>.vercel.app/**`
   - Save
2. **Authentication → Users** → 把你自己的账号手动确认一下（行尾 `⋮` → `Confirm email`），
   或者干脆在 **Sign In / Providers → Email** 里把 **Confirm email** 关掉

---

## 第五步：验证

1. 打开你的 Vercel 域名 → 应该看到深色聊天室，左上角有「大厅」/「The Golden Lobby」
2. 打开诊断接口（**这一步最能说明问题**）：

   ```
   https://<项目名>.vercel.app/api/diagnose
   ```

   重点看这几个字段：

   | 字段 | 期望值 | 含义 |
   |---|---|---|
   | `supabaseUrl` | `https://supabase-proxy.….workers.dev` | 浏览器走 Worker ✓ |
   | `supabaseUrlServer` | `https://lvntlhgpalgbgrsloxyy.supabase.co` | 服务端直连 ✓ |
   | `browserUsesProxy` | `true` | 拆分生效 ✓ |
   | `rawFetch.ok` | `true` | 服务端能读到数据库 ✓ |
   | `sdk.rows` | 有数据 | RLS 也正常 ✓ |

3. 发一条消息 → 应该立刻出现
4. 传一张图 → 应该显示缩略图
5. 左上角连接状态应该是 🟢 **实时已连接**（Worker 透传了 WebSocket）

---

## 第六步（强烈建议）：绑自己的域名

`*.workers.dev` 和 `*.vercel.app` 在国内经常被墙或不稳定。买一个域名（¥10–60/年，Cloudflare / Namecheap / 阿里云都行）后：

**A. 把域名接入 Cloudflare**（免费）
控制台 → **Add a site** → 输入域名 → 选 **Free** 计划 → 按提示把域名的 NS 改成 Cloudflare 给的两个地址

**B. 给 Worker 绑子域 `sb.你的域名`**
Worker → **Settings** → **Domains & Routes** → **Add** → **Custom Domain** → 填 `sb.你的域名` → 保存
（Cloudflare 会自动加 DNS 记录 + 证书）

**C. 给 Vercel 绑子域 `app.你的域名`**
Vercel 项目 → **Settings → Domains** → 填 `app.你的域名` → 按提示在 Cloudflare 加一条 CNAME 指向
`cname.vercel-dns.com`，**代理状态先关掉（灰云）**避免双重代理出问题

**D. 改环境变量并重新部署**
Vercel → Settings → Environment Variables → 把 `NEXT_PUBLIC_SUPABASE_URL` 改成 `https://sb.你的域名` → **Redeploy**
Supabase → URL Configuration → Site URL 改成 `https://app.你的域名`

改完再跑一次第五步的验证。

---

## 常见问题

| 现象 | 原因 | 解决 |
|---|---|---|
| 同学打不开 `*.workers.dev` 或 `*.vercel.app` | 国内屏蔽 | 做第 6 步绑域名 |
| 页面能开，但发消息没反应 / 图片裂图 | `NEXT_PUBLIC_SUPABASE_URL` 还是官方地址 | 改成 Worker 域名并 **Redeploy**（改环境变量不会自动生效） |
| 构建失败，日志里有 `127.0.0.1:7897` | 把本地代理变量加到 Vercel 了 | 删掉 `HTTP_PROXY` / `HTTPS_PROXY` / `NODE_USE_ENV_PROXY` |
| 上传大一点的图就失败 | Vercel 请求体上限 4.5MB | 设 `NEXT_PUBLIC_MAX_UPLOAD_BYTES=4194304`（或换 VPS 方案） |
| 连接状态一直是「离线（15s 轮询）」 | Worker 没透传 WebSocket | 确认用的是 `deploy/supabase-proxy-worker.js` 原版脚本（它保留了 `Upgrade` 头） |
| 登录后刷新就掉线 | Supabase 的 Site URL 没改 | 做第四步 |
| `/api/diagnose` 显示 `ENOTFOUND` / `ECONNRESET` | 服务端连不上 Supabase | 检查 `SUPABASE_URL_SERVER` 拼写；Vercel 上不要设代理变量 |

## 成本

| 项目 | 费用 |
|---|---|
| Cloudflare Workers 免费版 | ¥0（10 万请求/天，小圈子完全够） |
| Vercel Hobby | ¥0 |
| Supabase 免费版 | ¥0 |
| 域名（推荐） | ¥10–60/年 |

## 什么时候该换成 VPS 方案

如果出现下面任一情况，就值得换成「香港/新加坡 VPS + nginx」：

- 同学反馈 Cloudflare 线路太慢、经常断
- 你需要传大于 4.5 MB 的文件
- 想要更可控的实时体验

VPS 方案的 nginx 配置里，反代 Supabase 的部分和这个 Worker 逻辑是一样的，
而且 nginx 原生支持 WebSocket，不依赖任何平台限制。
