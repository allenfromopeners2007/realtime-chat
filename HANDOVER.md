# 交付文档

聊天室地址：**https://app.theopener.top**

---

# 一、给同学的话（可直接复制发群）

> 📋 下面这段可以直接整段复制到群里

```
我们的聊天室上线了 🎉

地址：https://app.theopener.top
（不需要翻墙，普通网络直接打开）

怎么开始用：
1. 打开链接 → 点右上角「登录 / 注册」→ 切到「注册」
2. 填邮箱、昵称、密码（至少 6 位）
3. 去邮箱收一封确认邮件
   标题是「请确认你的邮箱 —— 聊天室注册」
   ⚠️ 收件箱找不到就翻一下「垃圾邮件 / 其他文件夹」（QQ 邮箱在"其他文件夹"里）
4. 点邮件里的确认按钮 → 回来登录就能用了

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
| **看谁注册了 / 有没有确认邮箱** | Supabase → **Authentication → Users** |
| **给某人手动确认邮箱**（他收不到邮件时） | Users → 那行右侧 `⋮` → **Confirm email** |
| **手动创建账号**（不想让人自助注册时） | Users → **Add user** → 填邮箱密码 → 勾 **Auto Confirm User** |
| **删账号** | Users → `⋮` → **Delete user** |
| **禁言某人** | `/admin` → 用户 → 找那个人 → **禁言**（他还能登录看消息，但发不出） |
| **解除禁言** | 同上 → **解除禁言** |
| **给某人管理员权限** | `/admin` → 用户 → **设为管理员`<br>`⚠️ 至少会保留一个管理员，系统不允许把最后一个降级 |

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
| **永远不要把 `service_role` / `sb_secret_...` 放进代码或环境变量** | 它能绕过所有 RLS，等于全库无防护 |
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

语音通话默认走 **P2P 直连**。国内大约 **10-30%** 的网络组合（很多 4G/5G、公司网络、
以及两边都在运营商大内网的情况）因为 NAT 太复杂而**连不上** ✗
界面会提示：**「连接失败：双方网络无法直连（需要配置 TURN 服务器）」**

解决办法是配一个 **TURN 中继**（音频经它转发）。用 Cloudflare（你已有账号）：

**① 在 Cloudflare 创建 TURN 应用**

```
Cloudflare 控制台 → 左侧 Build 分组里的「Realtime」→ TURN → 创建
   ↓
拿到两个值：Key ID  和  API Token（Token 只显示一次，立刻复制）
```

> 找不到入口就把左侧菜单截图发给 AI 助手，让它指位置 ✓

**② 填到 Netlify（⚠️ 注意这两个变量名前面没有 NEXT_PUBLIC_）**

Netlify → **Site configuration → Environment variables** → 添加：

| 变量名 | 值 |
|---|---|
| `CLOUDFLARE_TURN_KEY_ID` | 刚才的 Key ID |
| `CLOUDFLARE_TURN_API_TOKEN` | 刚才的 API Token |

> 🔐 **为什么不带 `NEXT_PUBLIC_`**：这两个是密钥，只能留在服务端 ✓
> 浏览器要用的短期凭据由 `/api/turn` 这个接口现换现发（已限制必须登录才能调用 ✓）

**③ 重新部署**

Netlify → **Deploys → Trigger deploy → Deploy site**

**④ 重新测通话** → 应该就能听见了 ✓

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
