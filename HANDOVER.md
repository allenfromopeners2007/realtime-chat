# 交付文档

聊天室地址：**https://app.theopener.top**

---

# 一、给同学的话（可直接复制发群）

> 📋 下面这两段都可以直接整段复制到群里 ✓ 按同学的语言挑一段 ✓
> （UI 标签是中文，所以英文段里把对应的中文按钮名写在括号里 ✓）

## English version

```
Our chat room is live 🎉

URL: https://app.theopener.top
(works on a normal connection — no VPN needed)

How to get in:
1. Ask the admin (group owner) for an invite — send him the email address you want to use
2. You'll get an invitation email
   ⚠️ Can't find it? Check your Spam / Other folder (QQ Mail puts it under "Other")
3. Click the link in the email → set your password
4. Go back to https://app.theopener.top and sign in with your email + that password

(This chat room is invite-only — there is no self sign-up form.)

What you can do:
• Send text, images (just Ctrl+V a screenshot) and files
• Voice messages: tap the 🎤 left of the input box, record (max 2 min), hit Done (完成) to send.
  Others play it right inside the message.
  ⚠️ The first time your browser asks for microphone permission — choose Allow.
     If you denied it by accident, click the icon at the left of the address bar and allow the mic.
• Voice calls: bottom-right purple button → the "Members" (联系人) tab → tap the 📞 next to someone.
  They answer, and you can talk.
  ⚠️ Needs microphone permission too. During a call the top bar shows the timer, mute and hang up.
• Switch rooms: tap the room name at the top, or the purple button at the bottom right
• Search chat history: the search box at the top
• Delete your own message: hover it → trash icon at the top right

Please note:
• You must sign in to read or post messages
• Posting too fast is rate-limited (max 5 messages per 10 seconds)
• No ads or unrelated links — you'll be muted
```

## 中文版

```
我们的聊天室上线了 🎉

地址：https://app.theopener.top
（不需要翻墙，普通网络直接打开）

怎么开始用：
1. 先找群主（管理员）要邀请 —— 把你要用的邮箱发给他
2. 你会收到一封邀请邮件
   ⚠️ 收件箱找不到就翻一下「垃圾邮件 / 其他文件夹」（QQ 邮箱在"其他文件夹"里）
3. 点邮件里的链接 → 设置密码
4. 回 https://app.theopener.top 用邮箱 + 刚才的密码登录，就能用了

（本聊天室是邀请制，页面上没有自助注册入口 ✓）

能做什么：
• 发文字、图片（截图直接 Ctrl+V 粘贴就行）、文件
• **发语音**：点输入框左边的 🎤 录音（最长 2 分钟）→ 录完点「完成」→ 发送后别人点播放器就能听
  ⚠️ 第一次点会弹「是否允许使用麦克风」，要点「允许」；不小心点了拒绝的话，
     点浏览器地址栏左边的小图标把麦克风改成允许即可
• **语音通话**：点右下角紫色按钮 → 「联系人」页签 → 点某个人的 📞 → 对方接听就能说话
  ⚠️ 同样需要麦克风权限；通话中顶部会显示时长，可以静音或挂断
• 切换群组：点右上角群组名，或右下角紫色按钮
• 搜聊天记录：顶部搜索框
• 删自己的消息：鼠标移到消息上 → 右上角垃圾桶图标

注意：
• 必须登录才能看消息和发言
• 连续发太快会被限制（10 秒最多 5 条）
• 别发广告和无关链接，会被禁言
```

---

# 二、日常管理速查（你自己看）

## 账号管理

| 要做的事 | 在哪做 |
|---|---|
| ⭐ **邀请同学加入**（网站的 `/admin` → **邀请** 页签） | 输入他的邮箱 → **发送邀请** ✓（他会收到邀请邮件，点链接设密码）<br>备用：Supabase → **Authentication → Users** → **Add user ▾ → Invite user** |
| **看谁加入了 / 有没有确认邮箱** | Supabase → **Authentication → Users** |
| **给某人手动确认邮箱**（他收不到邮件时） | Users → 那行右侧 `⋮` → **Confirm email** |
| **删账号** | Users → `⋮` → **Delete user** |
| **禁言某人** | `/admin` → 用户 → 找那个人 → **禁言**（他还能登录看消息，但发不出） |
| **解除禁言** | 同上 → **解除禁言** |
| **给某人管理员权限** | `/admin` → 用户 → **设为管理员`<br>`⚠️ 至少会保留一个管理员，系统不允许把最后一个降级 |

> ⭐ **关于邀请制**（2026-10-11 起生效）：
> Supabase 里 **「Allow new users to sign up」已关闭** ✓
> → 陌生人即使拿到网址也**注册不了** ✗（实测注册接口返回 `signup_disabled` ✓）
> → 加人靠**网站的 `/admin` → 邀请页签** ✓（或 Supabase 后台的 Invite user ✓）
> → 这正是"私人工具"和"公开服务"的分界线 ✓
> 💡 **建议分批邀请**（一次几个 ✓）避免触发邮件发送频率限制（每分钟最多 5 个 ✓）
> 💡 页面上「注册」页签还在 ✓ 但会显示邀请制提示 ✓ 不会让人一脸懵 ✓
>
> 🔑 **邀请功能依赖一个环境变量**（没配的话 /admin 的邀请会提示去配置）：
> `SUPABASE_SERVICE_ROLE_KEY` = Supabase → **Settings → API Keys** 里的 `service_role` / `sb_secret_...`
> ⚠️ **绝对不要加 `NEXT_PUBLIC_` 前缀** ✗（加了就会被打进浏览器代码 ✗）
> 它的权限是"绕过所有 RLS" ✓ 所以只在服务端、只被 `/api/admin/invite` 使用 ✓
> 安全自检里有专门两项验证：匿名调用会被拒 ✓ 响应里不会回显密钥 ✓（`npm run audit:security`）

## 聊天内容管理

| 要做的事 | 在哪做 |
|---|---|
| 删任意消息 | `/admin` → **消息** → 搜索 → 删除；或直接在聊天里（管理员可以删任何人的） |
| 清空某个群的消息 | `/admin` → **群组** → 删除群组（会连带删消息，不可恢复 ⚠️） |
| 建群 / 改群名 / 写置顶公告 | 聊天界面右下角紫色按钮 → **群组**；或顶栏 ⚙️ 齿轮 → 群组设置 |
| 清理附件（省空间） | `/admin` → **附件** → 删 |
| 设置置顶公告 | 顶栏 ⚙️ 齿轮 → 填「置顶公告」→ 保存（所有人可见 ✓） |

## 认证设置（Supabase）

| 设置项 | 路径 |
|---|---|
| 开关自助注册 | **Authentication → Sign In / Providers → User Signups → Allow new users to sign up** |
| 邮箱验证开关 | 同上 → **Confirm email** |
| 邮件模板（改文案） | **Authentication → Emails → Confirm sign up** |
| 发信 SMTP（163） | **Authentication → Emails → SMTP Settings** |
| 邮件频率上限 | **Authentication → Rate Limits → Emails per hour** |
| 登录后跳转地址 | **Authentication → URL Configuration → Site URL** |

> ⚠️ 改完 Supabase 的设置记得点页面右下角的 **Save changes**，不点不生效 ✗

## 排障

| 现象 | 怎么查 |
|---|---|
| 打不开 / 很慢 | `curl.exe -s -o NUL -w "%{http_code}\n" https://app.theopener.top/` → 期望 200 |
| 发不出消息 / 图片裂了 | 打开 `https://app.theopener.top/api/diagnose` 看 `verdict` |
| 实时变成「15s 轮询」 | Worker 的问题 → `npm run test:worker` 跑一遍；或 Cloudflare → Workers → supabase-proxy → Logs |
| 同学收不到确认邮件 | ① 让他翻垃圾箱 ② Supabase → **Logs → Auth** 看发信报错 ③ 检查 SMTP 授权码/端口 465 |
| 怀疑有安全问题 | 在项目目录跑 `npm run audit:security`（15 项越权测试应全部拦住） |

## 代码改动后的发布流程

```powershell
cd "C:\Users\18855\Documents\deepseek-harness\default-workspace\realtime-chat"

# 1. 本地验证
npm.cmd run typecheck

# 2. 提交并推送（推送后 Netlify 会自动重新部署，1-3 分钟）
git add -A
git commit -m "说明这次改了什么"
git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 push

# 3. 如果改了 Worker（deploy/supabase-proxy-worker.js）
#    在 Cloudflare → Workers → supabase-proxy → Edit code 里粘贴新代码 → Deploy
#    （或装好 wrangler 后直接 npm run worker:deploy）
```

## 免费额度与注意事项

| 服务 | 免费额度 | 注意 |
|---|---|---|
| **Supabase** | 500MB 数据库 / 1GB 存储 / 5GB 流量 | ⚠️ **连续 7 天无活动会被暂停** → 回来点 Resume 即可，数据不丢<br>💡 **语音消息会占存储**：1 分钟约 0.5MB → 觉得占用大了，去 `/admin` → 附件页清理 |
| **Netlify** | 100GB 带宽/月、300 构建分钟/月 | 够小团体用 |
| **Cloudflare Workers** | 10 万请求/天 | 够 |
| **域名** | — | ¥10-60/年，**2027-10-10 到期**，记得续费 |
| **HTTPS 证书** | Let's Encrypt 自动续期 | 到期前自动续，不用管 |

**每月成本：¥0**（只有域名年费）

## 密钥与安全红线 ⚠️

| 红线 | 原因 |
|---|---|
| **绝不能让 `service_role` / `sb_secret_...` 进入浏览器或前端代码** ⚠️ | 它能绕过所有 RLS，等于全库钥匙。**唯一例外**：`SUPABASE_SERVICE_ROLE_KEY` 放在服务端环境变量里（**不加 `NEXT_PUBLIC_` 前缀**），且只在 `/api/admin/invite` 这一个接口里使用 —— 这是 Supabase 官方发邀请的标准做法 ✓ 换别的密钥时请对照这条规则 ✓ |
| **不要重跑 `supabase/schema.sql`** | 会覆盖加固过的策略（自我提权漏洞会回来）。要重跑就按顺序全跑一遍：`schema → admin-migration → rooms-migration → security-hardening` |
| 不要渲染用户提供的 HTML/Markdown | 现在消息是纯文本，链接只认 http(s)；一旦加富文本渲染，XSS 就会变成真风险 |
| 别往聊天里传证件、合同等敏感文件 | 附件 bucket 是公开可读的（图片要在 `<img>` 里显示） |
| 部署平台的环境变量里只放 `NEXT_PUBLIC_*` | 不要加 `HTTP_PROXY` 之类（那是本地开发用的） |

## 常用的自检命令

```powershell
npm.cmd run typecheck         # TypeScript 类型检查
npm.cmd run test:worker       # Worker 逻辑测试（35 项）
npm.cmd run test:voice        # 语音消息纯函数测试（34 项）
npm.cmd run test:call         # 实时语音通话：信令校验等（52 项）
npm.cmd run audit:security    # 越权攻击测试（15 项，应全部拦住）
npm.cmd run dev:proxy         # 本地开发（带代理，国内必须用这个）
```

> ⚠️ **测语音消息 / 语音通话必须用 Edge / Chrome 打开线上地址** ——
> DeepSeek 内置浏览器会拒绝所有网页权限（包括麦克风），点 🎤 或 📞 会直接报"没有麦克风权限"。
> 你同学用的正常浏览器都能用 ✓
>
> 📞 **测语音通话还需要两个账号 + 两个浏览器**（或一台电脑 + 一部手机）：
> 在 Supabase → **Authentication → Users → Add user** 建一个测试账号（勾 **Auto Confirm User**），
> 然后用 Edge 登录你自己的号、Chrome 登录测试号，互相呼叫 ✓
> 同一台电脑上用两个浏览器时建议**戴耳机**（否则会有回音 ✓）

### 语音通话连不上怎么办（配置 TURN 服务器）

> ✅ **2026-10-11 已配置成功并实测通话打通** —— 下面记录完整流程和踩过的坑 ✓

**背景**：语音通话默认走 **P2P 直连**。国内约 **10-30%** 的网络组合（很多 4G/5G、公司网络、
双方都在运营商大内网）因为 NAT 太复杂而**连不上** ✗ 界面会提示「双方网络无法直连」✗
解决办法是配 **TURN 中继**（音频经它转发，连通率接近 100% ✓）

**Cloudflare TURN 免费额度：1,000 GB / 月** ✓ 超出后才 $0.05/GB
你们的实际用量约 0.1-0.9 GB/月 → **实际花费永远是 $0** ✓
⚠️ 但开通时页面会**要求绑支付方式**（卡或 PayPal）✗ 即使 Total Due 是 $0.00 ✓
本次绕开了它 —— **直接用 API 创建 TURN key，没有绑卡** ✓

**① 创建一个 Cloudflare API Token（用完就删）**

```
Cloudflare → My Profile → API Tokens → Create Token → Create Custom Token
   Token name: 随便，如 turn-key-create-once
   Permissions:  Account  |  Cloudflare Calls  |  Edit      ← 注意是 "Cloudflare Calls"
   Account Resources: Include → 只勾你自己那一个账号（不要选 All accounts）
   TTL: 1 day                                                ← 短有效期更安全
```

**② 用 API 创建 TURN key（PowerShell 里跑，注意引号！）**

```powershell
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$h=@{Authorization="Bearer <刚建的API Token>";"Content-Type"="application/json"}
$r=Invoke-RestMethod -Method Post -Uri "https://api.cloudflare.com/client/v4/accounts/<AccountID>/calls/turn_keys" -Headers $h -Body '{"name":"theopener-chat"}'
$r.result.uid; $r.result.key     # uid = Key ID(32位)，key = secret(64位)
```

⚠️ **三个大坑（都踩过）**：

| 坑 | 现象 | 正确做法 |
|---|---|---|
| **cmd 的引号写法** | `Request body too small` | **PowerShell 里 JSON body 用单引号** ✓ `-d '{"name":"x"}'`（`\"` 在 PowerShell 里不转义 ✗） |
| **把 Account ID 当 Key ID** | Cloudflare 返回 **404** | Account ID 和 TURN Key ID **都是 32 位** ✗ 别搞混 ✓ 认字段名 `uid` ✓ |
| **连续请求被限流** | 返回 **HTML 拦截页**（`Attention Required!`） | 等 5-10 分钟，或改用 `Invoke-RestMethod`（带正常 UA ✓） |

**③ 拿到两个值**

| 值 | 长度 | 填到 Netlify 的变量 |
|---|---|---|
| `uid` | **32 位** | `CLOUDFLARE_TURN_KEY_ID` |
| `key`（控制台里叫 **secret**） | **64 位** | `CLOUDFLARE_TURN_API_TOKEN` |

> ⚠️ **别填错**：以 `cfut_` 开头的是 Cloudflare **API Token**（约 40 位）✗ 不是要填的那个 ✓
> 💡 控制台 Realtime → TURN 里能看到 `secret`，但**可能被截断成 `...`** ✗
>    要么点旁边的复制按钮 ✓ 要么回到 API 返回里取完整值 ✓

**④ 填到 Netlify（⚠️ 这两个变量名前面没有 NEXT_PUBLIC_）**

Netlify → **Site configuration → Environment variables** →
`Add a variable ▾` → **`Import from a .env file`** → 粘贴这两行：

```
CLOUDFLARE_TURN_KEY_ID=<32位的uid>
CLOUDFLARE_TURN_API_TOKEN=<64位的secret>
```

> 🔐 **为什么不带 `NEXT_PUBLIC_`**：这两个是密钥，只能留在服务端 ✓
> 浏览器要用的**短期凭据**（1 小时过期）由 `/api/turn` 现换现发 ✓
> 该接口**必须登录**才能调用 ✓（否则等于给全互联网提供免费中继 ✗）

**⑤ 重新部署 + 验证**

Netlify → **Deploys → Trigger deploy → Deploy project** → 等 Published ✓
然后**在已登录的浏览器**里打开 `https://app.theopener.top/api/turn` ✓

| 返回 | 含义 |
|---|---|
| `{"iceServers":{"urls":["turn:turn.cloudflare.com:3478?transport=udp", ...]},"configured":true}` | ✅ **成功** 去测通话 ✓ |
| `{"iceServers":null,"configured":false}` | ❌ 变量没读到 → 检查名字 + 重新部署 ✓ |
| `Cloudflare 返回 404` | ❌ Key ID 填成了 Account ID ✓ |
| `Cloudflare 返回 401/403` | ❌ 填成了 `cfut_` 开头的 API Token ✓ |

**⑥ 收尾：删掉那个 Cloudflare API Token**

`My Profile → API Tokens → 找到它 → Delete` ✓ 它只用一次 ✓
（多余的 TURN key 也可以在 Realtime → TURN 里删掉，留一个就行 ✓）

**⑦ 如果配了 TURN 还是连不上**

界面提示会区分三种情况（2026-10 起 ✓）：

| 提示 | 说明 |
|---|---|
| 「未配置 TURN 服务器」 | 变量没生效 ✓ |
| 「**TURN 已配置，但没能拿到中继候选**」 | 网络连不上 TURN 服务器 ✗ 换方案（自建 coturn / 声网） |
| 「已拿到 TURN 中继候选，但仍未连通」 | 中继通了但流量被拦 ✗ |

按 **F12 → Console**，`[call]` 开头的日志会列出收到的 ICE 候选类型 ✓
（`host` = 本机 / `srflx` = STUN 打的公网洞 / `relay` = TURN 中继 ✓ 有 relay 才说明 TURN 起作用 ✓）

---

### 想用别的 TURN 服务（可选）

如果你的 TURN 服务商给的是**固定账号密码**（不是短期凭据），可以直接填这三个
`NEXT_PUBLIC_` 变量，代码会自动使用它们：

```
NEXT_PUBLIC_TURN_URL=turn:your-turn-server:3478
NEXT_PUBLIC_TURN_USERNAME=...
NEXT_PUBLIC_TURN_CREDENTIAL=...
```

⚠️ 因为它们会进前端代码，所以**别用长期密钥** ✗ 优先用上面 Cloudflare 的方案 ✓
