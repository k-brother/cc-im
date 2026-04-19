# Synapse 中文文档

多平台机器人桥接服务，连接飞书、Telegram、企业微信、钉钉与 Claude Code CLI。

---

## 目录

- [项目简介](#项目简介)
- [核心特性](#核心特性)
- [快速开始](#快速开始)
- [平台配置指南](#平台配置指南)
- [命令系统](#命令系统)
- [配置参考](#配置参考)
- [权限与审批系统](#权限与审批系统)
- [MCP Server](#mcp-server)
- [项目结构](#项目结构)

---

## 项目简介

Synapse 是一个多平台机器人桥接服务，同时支持 **Bridge 模式**（接收消息、调用 AI、推送回复）和 **MCP Server 模式**（通过 stdio 与 MCP 客户端集成）。

支持平台：
| 平台 | SDK | 协议 |
|------|-----|------|
| 飞书 | `@larksuiteoapi/node-sdk` | 长连接 |
| Telegram | `telegraf` | 轮询 |
| 企业微信 | `@wecom/aibot-node-sdk` | WebSocket |
| 钉钉 | 内置 HTTP API | 长连接 |

### 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                      Synapse 服务进程                          │
├─────────────────────────────────────────────────────────────┤
│  MCP Server (抢占 stdio)                                     │
│  ├── Bridge Handler (注册到各平台)                           │
│  └── MCP Bridge Tools (send_message 等)                      │
├─────────────────────────────────────────────────────────────┤
│  平台处理器                                                   │
│  ├── 飞书 Handler ── CardKit 流式输出 ── 话题会话             │
│  ├── Telegram Handler ── editMessage 实时更新                 │
│  ├── 企业微信 Handler ── replyStream 原生流式                  │
│  └── 钉钉 Handler ── 工作通知消息                            │
├─────────────────────────────────────────────────────────────┤
│  共享层                                                       │
│  ├── SessionManager (会话持久化)                              │
│  ├── RequestQueue (并发控制)                                 │
│  ├── ClaudeTask (任务执行)                                    │
│  └── PermissionServer (权限审批)                             │
└─────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code CLI                           │
│  ├── PreToolUse Hook (权限拦截)                              │
│  └── stream-json 输出 (实时流式)                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 核心特性

### 多平台支持

- **飞书**：CardKit 卡片流式输出、话题（thread）独立会话、图片/截图自动上传
- **Telegram**：私聊 + 群组（需 @机器人）、Markdown 格式化、rate limit 退火
- **企业微信**：原生 `replyStream` 流式、6 分钟自动续接、模板卡片权限确认
- **钉钉**：工作通知消息、图片上传、Markdown 支持

### MCP 协议集成

通过 MCP Server，Claude Code 可以主动向各平台推送消息：

```bash
# 启动 MCP Server
Synapse mcp

# Claude Code 配置 ~/.claude/.mcp.json
{
  "mcpServers": {
    "synapse": {
      "type": "stdio",
      "command": "synapse",
      "args": ["mcp"],
      "description": "Synapse — Multi-platform AI bridge (Feishu, Telegram, WeCom, DingTalk) with proactive messaging capabilities"
    }
  }
}
```

**可用工具**：

| 工具 | 说明 | 参数 |
|------|------|------|
| `send_message` | 向指定平台发送消息 | `platform`, `chatId`, `content` |
| `get_active_chats` | 获取活跃聊天列表 | `platform` (可选) |
| `get_chat_info` | 获取聊天详情 | `platform`, `chatId` |
| `get_incoming_messages` | 轮询收到的新消息 | `platform` (可选), `limit` |

### 多语言支持

系统 UI 消息支持中英双语，通过 `language` 配置切换：

```bash
# 环境变量
export CC_IM_LANGUAGE=en

# 配置文件 ~/.synapse/config.json
{
  "language": "en"
}
```

用户与 Claude Code 的对话语言与系统语言完全独立。

### 权限与审批系统

**三级风险模型**：

| 等级 | 说明 | 示例命令 |
|------|------|----------|
| L1 | 所有用户直接执行 | `/help`, `/new`, `/status` |
| L2 | 私聊直接执行，群聊需审批 | `/cd`, `/model`, `/resume` |
| L3 | 仅管理员可用 | `/approve`, `/reject` |

### 其他特性

- **流式输出**：各平台实时显示 AI 思考和回复过程
- **思考过程展示**：折叠面板显示 Claude 思考步骤
- **工具调用通知**：实时显示当前工具名称和参数摘要
- **图片消息**：支持发送图片给 AI 分析，截图自动回传
- **会话管理**：每用户独立 sessionId，支持 resume
- **并发控制**：同会话串行，不同会话可并发，最多排队 3 条
- **长消息分片**：超长内容自动拆分
- **停止按钮**：执行中可随时停止任务
- **生命周期通知**：启动/关闭时通知活跃用户，支持自定义问候语（`privileged.startup.customGreeting`）
- **守护进程模式**：`Synapse -d` 后台运行
- **版本更新检查**：启动时自动检测新版本

---

## 快速开始

### 前置要求

- Node.js >= 20
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) 已安装

### 同时运行多个平台

```bash
# 配置环境变量
export FEISHU_APP_ID=xxx
export FEISHU_APP_SECRET=xxx
export TELEGRAM_BOT_TOKEN=xxx
export WECOM_BOT_ID=xxx
export WECOM_BOT_SECRET=xxx
export DINGTALK_AGENT_ID=xxx   # 钉钉
export DINGTALK_APP_KEY=xxx
export DINGTALK_APP_SECRET=xxx

# 启动（自动检测已配置的平台）
npx synapse@latest

# 或从源码运行
pnpm install
pnpm dev
```

### 从源码构建

```bash
git clone https://github.com/k-brother/synapse.git
cd synapse
pnpm install
pnpm build
pnpm start    # 前台运行
Synapse -d     # 后台运行
Synapse stop   # 停止
```

---

## 平台配置指南

### 飞书

1. 在 [飞书开放平台](https://open.feishu.cn) 创建应用
2. 开启机器人能力
3. 添加权限：
   - `im:message:send_as_bot`
   - `im:message`
   - `im:message:patch_as_bot`
   - `im:resource`
   - `cardkit:card:write`
4. 启用长连接模式，订阅事件：
   - `im.message.receive_v1`
   - `im.message.recalled_v1`
   - `card.action.trigger`
5. 发布应用并配置凭证

```bash
export FEISHU_APP_ID=your_app_id
export FEISHU_APP_SECRET=your_app_secret
export CC_IM_LANGUAGE=zh   # 可选，默认中文
```

### Telegram

1. 通过 [@BotFather](https://t.me/BotFather) 创建 Bot
2. 获取 Token 后配置：

```bash
export TELEGRAM_BOT_TOKEN=your_bot_token
```

在 Telegram 中向 Bot 发送 `/start` 开始使用。

### 企业微信

1. 在 [企业微信管理后台](https://work.weixin.qq.com) 创建智能机器人
2. 获取 Bot ID 和 Secret
3. 配置：

```bash
export WECOM_BOT_ID=your_bot_id
export WECOM_BOT_SECRET=your_bot_secret
```

群聊需 @机器人 才会响应。

### 钉钉

1. 在 [钉钉开放平台](https://open.dingtalk.com) 创建应用
2. 添加机器人能力，获取 App Key 和 App Secret
3. 配置 Agent ID（企业内部应用）

```bash
export DINGTALK_AGENT_ID=your_agent_id
export DINGTALK_APP_KEY=your_app_key
export DINGTALK_APP_SECRET=your_app_secret
```

---

## 命令系统

### 通用命令（所有平台）

| 命令 | 说明 | 风险等级 |
|------|------|----------|
| `/help` | 显示帮助信息 | L1 |
| `/new` | 开始新会话 | L1 |
| `/status` | 查看当前会话状态 | L1 |
| `/cost` | 查看 API 用量和费用 | L1 |
| `/doctor` | 运行健康检查 | L1 |
| `/pwd` | 查看当前工作目录 | L1 |
| `/list` | 列出所有项目工作区 | L1 |
| `/compact [topic]` | 压缩上下文 | L1 |
| `/history [page]` | 查看对话历史 | L1 |
| `/chatid` | 查看当前会话 ID | L1 |
| `/allow` 或 `/y` | 允许权限（按钮不可用时） | Fallback |
| `/deny` 或 `/n` | 拒绝权限（按钮不可用时） | Fallback |

### 私聊直接执行，群聊需审批（L2）

| 命令 | 说明 |
|------|------|
| `/cd <path>` | 切换工作目录（同时重置会话） |
| `/model [name]` | 查看或切换模型 |
| `/resume` | 恢复会话 |

### 管理员命令（L3）

| 命令 | 说明 |
|------|------|
| `/approve <id>` | 批准审批请求 |
| `/reject <id>` | 拒绝审批请求 |

### 平台特有命令

| 平台 | 命令 | 说明 |
|------|------|------|
| 飞书 | `/threads` | 列出话题会话 |
| Telegram | `/start` | 显示欢迎信息 |
| 企业微信 | `/stop` | 停止当前任务 |

---

## 配置参考

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `CC_IM_LANGUAGE` | 系统语言 (`zh`/`en`) | `zh` |
| `FEISHU_APP_ID` | 飞书 App ID | - |
| `FEISHU_APP_SECRET` | 飞书 App Secret | - |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token | - |
| `WECOM_BOT_ID` | 企业微信 Bot ID | - |
| `WECOM_BOT_SECRET` | 企业微信 Secret | - |
| `DINGTALK_AGENT_ID` | 钉钉 Agent ID | - |
| `DINGTALK_APP_KEY` | 钉钉 App Key | - |
| `DINGTALK_APP_SECRET` | 钉钉 App Secret | - |
| `CLAUDE_CLI_PATH` | Claude CLI 路径 | `claude` |
| `CLAUDE_WORK_DIR` | 默认工作目录 | 当前目录 |
| `ALLOWED_BASE_DIRS` | 允许 `/cd` 的目录 | 同 `CLAUDE_WORK_DIR` |
| `CLAUDE_SKIP_PERMISSIONS` | 跳过权限确认 | `false` |
| `CLAUDE_TIMEOUT_MS` | 执行超时（毫秒） | `600000` |
| `CLAUDE_MODEL` | 默认模型 | 空（AI 决定） |
| `PROXY_URL` | 代理地址 | - |
| `HOOK_SERVER_PORT` | 权限服务端口 | `18900` |
| `LOG_DIR` | 日志目录 | `~/.synapse/logs` |
| `LOG_LEVEL` | 日志等级 | `DEBUG` |

### 配置文件

`~/.synapse/config.json`：

```json
{
  "language": "zh",
  "platforms": {
    "feishu": {
      "appId": "your_app_id",
      "appSecret": "your_app_secret",
      "botName": "飞书机器人"
    },
    "telegram": {
      "botToken": "your_bot_token",
      "botName": "Telegram机器人"
    },
    "wecom": {
      "botId": "your_bot_id",
      "botSecret": "your_bot_secret",
      "botName": "企业微信机器人"
    },
    "dingtalk": {
      "agentId": "your_agent_id",
      "appKey": "your_app_key",
      "appSecret": "your_app_secret",
      "botName": "钉钉机器人"
    }
  },
  "botName": "synapse",
  "privileged": {
    "users": {
      "feishu": ["ou_xxx"],
      "telegram": ["123456789"],
      "wecom": ["user1"],
      "dingtalk": ["user1"]
    },
    "startup": {
      "feishu": { "groups": [], "users": [] },
      "telegram": { "groups": [], "users": [] },
      "wecom": { "groups": [], "users": [] },
      "dingtalk": { "groups": [], "users": [] },
      "customGreeting": {
        "group": { "zh": "🤖 机器人已上线，有什么可以帮你的？", "en": "🤖 Bot is online, how can I help?" },
        "private": { "zh": "👋 你好！我是你的 AI 助手", "en": "👋 Hello! I'm your AI assistant" }
      }
    },
    "approval": {
      "targets": {
        "feishu": ["admin_open_id"],
        "telegram": ["admin_id"],
        "wecom": ["admin_userid"],
        "dingtalk": ["admin_userid"]
      },
      "settings": {
        "timeoutMs": 300000
      }
    }
  }
}
```

### 应用数据目录

```
~/.synapse/
├── config.json           # 配置文件
├── data/
│   ├── sessions.json     # 会话持久化
│   └── active-chats.json # 活跃聊天（生命周期通知）
└── logs/
    ├── 2026-04-18.log
    └── daemon.log        # 守护进程日志
```

---

## 权限与审批系统

### 三级风险模型

Synapse 将命令分为三个风险等级：

| 等级 | 私聊 | 群聊 | 说明 |
|------|------|------|------|
| L1 低风险 | 直接执行 | 直接执行 | 所有用户可用 |
| L2 中风险 | 直接执行 | 需审批 | 敏感操作需管理员批准 |
| L3 高风险 | 需审批 | 需审批 | 仅管理员可用 |

### 权限确认机制

对于 L2/L3 命令，系统通过 PreToolUse Hook 拦截敏感工具调用：

```
用户发送命令 → Claude 执行 → Hook 拦截 → 发送权限卡片
     ↑                                              ↓
     └─────────────── 用户点击允许/拒绝 ←───────────┘
```

**自动放行的只读工具**：`Read`、`Glob`、`Grep`、`WebFetch`、`WebSearch`、`Task`、`TodoRead`

### 审批系统

L2 命令在群聊中执行时，系统创建审批请求并通知管理员：

```
用户执行 /cd /project
    ↓
系统发送审批请求给管理员
    ↓
管理员 /approve <审批ID> 或 /reject <审批ID>
    ↓
用户收到结果通知
```

### 配置审批目标

```json
{
  "privileged": {
    "approval": {
      "targets": {
        "wecom": ["admin_userid1", "admin_userid2"]
      }
    }
  }
}
```

### Claude CLI Hook 配置

编辑 `~/.claude/settings.json`：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/synapse/dist/hook/hook-script.js"
          }
        ]
      }
    ]
  }
}
```

赋予执行权限：`chmod +x dist/hook/hook-script.js`

修改后需完全退出 Claude Code 会话并重新启动。

---

## MCP Server

MCP Server 模式让 Claude Code 可以通过 stdio 主动向各平台发送消息。

### 启动 MCP Server

```bash
# 环境变量配置平台凭证
export WECOM_BOT_ID=xxx
export WECOM_BOT_SECRET=xxx
Synapse mcp
```

### Claude Code 配置

```json
// ~/.claude/.mcp.json
{
  "mcpServers": {
    "synapse": {
      "type": "stdio",
      "command": "synapse",
      "args": ["mcp"],
      "description": "Synapse — Multi-platform AI bridge (Feishu, Telegram, WeCom, DingTalk) with proactive messaging capabilities"
    }
  }
}
```

### MCP 工具

| 工具 | 说明 | 必需参数 |
|------|------|----------|
| `send_message` | 向指定平台发送消息 | `platform`, `chatId`, `content` |
| `get_active_chats` | 获取活跃聊天列表 | `platform` (可选) |
| `get_chat_info` | 获取聊天详情 | `platform`, `chatId` |
| `get_incoming_messages` | 轮询新消息 | `platform` (可选), `limit` (可选) |

### 使用示例

```javascript
// 发送消息
await mcp__synapse__send_message({
  platform: "wecom",
  chatId: "群ID或用户ID",
  content: "Hello from Claude!"
});

// 获取活跃聊天
const chats = await mcp__synapse__get_active_chats({ platform: "wecom" });
```

---

## 项目结构

```
Synapse/
├── src/
│   ├── index.ts              # Bridge + MCP 统一入口
│   ├── cli.ts                # CLI 解析（前台/守护/MCP）
│   ├── config.ts             # 配置加载
│   ├── constants.ts         # 系统常量
│   ├── logger.ts             # 日志系统（自动脱敏）
│   ├── i18n.ts               # 国际化（zh/en）
│   │
│   ├── access/               # 访问控制与审批
│   │   ├── types.ts          # PrivilegedConfig, ApprovalConfig
│   │   ├── access-control.ts # 白名单检查
│   │   ├── approval-manager.ts
│   │   └── approval-sender.ts # 审批发送器接口
│   │
│   ├── claude/               # Claude CLI 集成
│   │   ├── cli-runner.ts     # 子进程管理
│   │   └── stream-parser.ts  # stream-json 解析
│   │
│   ├── commands/              # 命令处理器
│   │   └── handler.ts        # 平台无关命令处理
│   │
│   ├── feishu/               # 飞书平台
│   │   ├── client.ts         # SDK 初始化
│   │   ├── event-handler.ts  # 事件处理
│   │   ├── message-sender.ts # 消息发送
│   │   ├── card-builder.ts   # CardKit JSON 构建
│   │   ├── cardkit-manager.ts # 卡片生命周期
│   │   ├── permission-handler.ts
│   │   └── approval-sender.ts
│   │
│   ├── telegram/             # Telegram 平台
│   │   ├── client.ts
│   │   ├── event-handler.ts
│   │   ├── message-sender.ts
│   │   └── approval-sender.ts
│   │
│   ├── wecom/                # 企业微信平台
│   │   ├── client.ts        # WSClient 初始化
│   │   ├── event-handler.ts
│   │   ├── message-sender.ts
│   │   └── approval-sender.ts
│   │
│   ├── dingtalk/            # 钉钉平台
│   │   ├── client.ts
│   │   ├── event-handler.ts
│   │   ├── message-sender.ts
│   │   └── approval-sender.ts
│   │
│   ├── hook/                 # 权限 Hook
│   │   ├── permission-server.ts
│   │   └── hook-script.ts
│   │
│   ├── mcp/                  # MCP 协议
│   │   ├── index.ts
│   │   ├── cli.ts           # MCP 模式入口
│   │   ├── server.ts        # Bridge Server
│   │   ├── router.ts        # 消息路由
│   │   └── tools.ts         # MCP 工具定义
│   │
│   ├── shared/               # 共享模块
│   │   ├── active-chats.ts
│   │   ├── claude-task.ts   # 任务执行层
│   │   ├── history.ts
│   │   ├── message-dedup.ts
│   │   ├── retry.ts
│   │   ├── task-cleanup.ts
│   │   ├── types.ts
│   │   ├── update-check.ts
│   │   └── utils.ts
│   │
│   ├── session/              # 会话管理
│   │   └── session-manager.ts
│   │
│   └── queue/                 # 请求队列
│       └── request-queue.ts
│
├── tests/                    # 单元测试 (vitest)
├── CHANGELOG.md
├── README.md                 # 英文首页
├── README_zh.md              # 中文文档
├── README_en.md              # 英文完整文档
└── CLAUDE.md                 # 开发指南
```

---

## 致谢

本项目诞生于 [congqiu/cc-im](https://github.com/congqiu/cc-im) 的坚实基础。

## License

MIT
