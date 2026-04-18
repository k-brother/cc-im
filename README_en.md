# Synapse English Documentation

Multi-platform bot bridge service connecting Feishu, Telegram, WeCom, DingTalk, and Claude Code CLI.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Quick Start](#quick-start)
- [Platform Setup](#platform-setup)
- [Commands](#commands)
- [Configuration Reference](#configuration-reference)
- [Permission & Approval System](#permission--approval-system)
- [MCP Server](#mcp-server)
- [Project Structure](#project-structure)

---

## Overview

Synapse is a multi-platform bot bridge service with two operating modes:

- **Bridge Mode**: Receives messages, invokes Claude Code AI, streams responses back to chat
- **MCP Server Mode**: Integrates with MCP clients (like Claude Code) via stdio

**Supported Platforms**:

| Platform | SDK | Protocol |
|----------|-----|----------|
| Feishu | `@larksuiteoapi/node-sdk` | Long Connection |
| Telegram | `telegraf` | Polling |
| WeCom | `@wecom/aibot-node-sdk` | WebSocket |
| DingTalk | Built-in HTTP API | Long Connection |

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Synapse Process                          │
├─────────────────────────────────────────────────────────────┤
│  MCP Server (stdio)                                         │
│  ├── Bridge Handler (registered to each platform)           │
│  └── MCP Bridge Tools (send_message, etc.)                  │
├─────────────────────────────────────────────────────────────┤
│  Platform Handlers                                          │
│  ├── Feishu ── CardKit Streaming ── Thread Sessions         │
│  ├── Telegram ── editMessage Real-time Updates              │
│  ├── WeCom ── replyStream Native Streaming                  │
│  └── DingTalk ── Work Notification Messages                 │
├─────────────────────────────────────────────────────────────┤
│  Shared Layer                                               │
│  ├── SessionManager (persistence)                           │
│  ├── RequestQueue (concurrency control)                     │
│  ├── ClaudeTask (task execution)                            │
│  └── PermissionServer (permission approval)                  │
└─────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code CLI                           │
│  ├── PreToolUse Hook (permission interception)              │
│  └── stream-json output (real-time streaming)               │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Features

### Multi-Platform Support

- **Feishu**: CardKit streaming cards, thread-based sessions, image/screenshot auto-upload
- **Telegram**: Private chat + groups (@bot required), Markdown formatting, rate limit cooldown
- **WeCom**: Native `replyStream` streaming, 6-min auto-renewal, template card permissions
- **DingTalk**: Work notification messages, image upload, Markdown support

### MCP Protocol Integration

Through MCP Server, Claude Code can proactively send messages to platforms:

```bash
# Start MCP Server
Synapse mcp

# Claude Code config ~/.claude/.mcp.json
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

**Available Tools**:

| Tool | Description | Parameters |
|------|-------------|------------|
| `send_message` | Send message to specified platform | `platform`, `chatId`, `content` |
| `get_active_chats` | Get list of active chats | `platform` (optional) |
| `get_chat_info` | Get chat details | `platform`, `chatId` |
| `get_incoming_messages` | Poll incoming messages | `platform` (optional), `limit` |

### Multi-Language Support (i18n)

System UI messages support Chinese and English, controlled via `language` config:

```bash
# Environment variable
export CC_IM_LANGUAGE=en

# Config file ~/.synapse/config.json
{
  "language": "en"
}
```

User's conversation language with Claude Code is completely independent of system language.

### Permission & Approval System

**Three-Tier Risk Model**:

| Level | Description | Example Commands |
|-------|-------------|------------------|
| L1 | Direct execution for all | `/help`, `/new`, `/status` |
| L2 | Direct in private, approval required in groups | `/cd`, `/model`, `/resume` |
| L3 | Admin only | `/approve`, `/reject` |

### Other Features

- **Streaming Output**: Real-time display of AI thinking and responses
- **Thinking Process Display**: Collapsible panel showing Claude's reasoning steps
- **Tool Call Notifications**: Real-time display of current tool name and parameter summary
- **Image Messages**: Send images for AI analysis, screenshots auto-uploaded back
- **Session Management**: Independent sessionId per user, support for resume
- **Concurrency Control**: Serial execution for same session, parallel for different sessions, max 3 queued
- **Long Message Splitting**: Automatic split for oversized content
- **Stop Button**: Stop tasks at any time during execution
- **Lifecycle Notifications**: Notify active users on startup/shutdown
- **Daemon Mode**: `Synapse -d` for background operation
- **Version Update Check**: Automatic new version detection on startup

---

## Quick Start

### Prerequisites

- Node.js >= 20
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed

### Running Multiple Platforms Simultaneously

```bash
# Configure environment variables
export FEISHU_APP_ID=xxx
export FEISHU_APP_SECRET=xxx
export TELEGRAM_BOT_TOKEN=xxx
export WECOM_BOT_ID=xxx
export WECOM_BOT_SECRET=xxx
export DINGTALK_AGENT_ID=xxx
export DINGTALK_APP_KEY=xxx
export DINGTALK_APP_SECRET=xxx

# Start (auto-detects configured platforms)
npx synapse@latest

# Or run from source
pnpm install
pnpm dev
```

### Build from Source

```bash
git clone https://github.com/k-brother/synapse.git
cd synapse
pnpm install
pnpm build
pnpm start    # Foreground
Synapse -d     # Background
Synapse stop   # Stop
```

---

## Platform Setup

### Feishu

1. Create an app at [Feishu Open Platform](https://open.feishu.cn)
2. Enable Bot capability
3. Add permissions:
   - `im:message:send_as_bot`
   - `im:message`
   - `im:message:patch_as_bot`
   - `im:resource`
   - `cardkit:card:write`
4. Enable long connection mode, subscribe to events:
   - `im.message.receive_v1`
   - `im.message.recalled_v1`
   - `card.action.trigger`
5. Publish app and configure credentials

```bash
export FEISHU_APP_ID=your_app_id
export FEISHU_APP_SECRET=your_app_secret
export CC_IM_LANGUAGE=zh   # Optional, defaults to Chinese
```

### Telegram

1. Create a Bot via [@BotFather](https://t.me/BotFather)
2. Get Token and configure:

```bash
export TELEGRAM_BOT_TOKEN=your_bot_token
```

Send `/start` to the Bot to begin.

### WeCom (Enterprise WeChat)

1. Create an Intelligent Bot in [WeCom Admin Console](https://work.weixin.qq.com)
2. Get Bot ID and Secret
3. Configure:

```bash
export WECOM_BOT_ID=your_bot_id
export WECOM_BOT_SECRET=your_bot_secret
```

Group chats require @mentioning the bot.

### DingTalk

1. Create an app at [DingTalk Open Platform](https://open.dingtalk.com)
2. Add Bot capability, get App Key and App Secret
3. Configure Agent ID (for internal enterprise apps)

```bash
export DINGTALK_AGENT_ID=your_agent_id
export DINGTALK_APP_KEY=your_app_key
export DINGTALK_APP_SECRET=your_app_secret
```

---

## Commands

### Universal Commands (All Platforms)

| Command | Description | Risk Level |
|---------|-------------|------------|
| `/help` | Show help | L1 |
| `/new` | Start new session | L1 |
| `/status` | View current session status | L1 |
| `/cost` | View API usage and cost | L1 |
| `/doctor` | Run health check | L1 |
| `/pwd` | View current working directory | L1 |
| `/list` | List all project workspaces | L1 |
| `/compact [topic]` | Compact context | L1 |
| `/history [page]` | View conversation history | L1 |
| `/chatid` | View current session ID | L1 |
| `/allow` or `/y` | Allow permission (fallback when button unavailable) | Fallback |
| `/deny` or `/n` | Deny permission (fallback when button unavailable) | Fallback |

### Direct in Private, Approval Required in Groups (L2)

| Command | Description |
|---------|-------------|
| `/cd <path>` | Change working directory (resets session) |
| `/model [name]` | View or switch model |
| `/resume` | Resume session |

### Admin Commands (L3)

| Command | Description |
|---------|-------------|
| `/approve <id>` | Approve request |
| `/reject <id>` | Reject request |

### Platform-Specific Commands

| Platform | Command | Description |
|----------|---------|-------------|
| Feishu | `/threads` | List thread sessions |
| Telegram | `/start` | Show welcome message |
| WeCom | `/stop` | Stop current task |

---

## Configuration Reference

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CC_IM_LANGUAGE` | System language (`zh`/`en`) | `zh` |
| `FEISHU_APP_ID` | Feishu App ID | - |
| `FEISHU_APP_SECRET` | Feishu App Secret | - |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token | - |
| `WECOM_BOT_ID` | WeCom Bot ID | - |
| `WECOM_BOT_SECRET` | WeCom Bot Secret | - |
| `DINGTALK_AGENT_ID` | DingTalk Agent ID | - |
| `DINGTALK_APP_KEY` | DingTalk App Key | - |
| `DINGTALK_APP_SECRET` | DingTalk App Secret | - |
| `CLAUDE_CLI_PATH` | Claude CLI path | `claude` |
| `CLAUDE_WORK_DIR` | Default working directory | Current dir |
| `ALLOWED_BASE_DIRS` | Allowed dirs for `/cd` | Same as `CLAUDE_WORK_DIR` |
| `CLAUDE_SKIP_PERMISSIONS` | Skip permission confirmation | `false` |
| `CLAUDE_TIMEOUT_MS` | Execution timeout (ms) | `600000` |
| `CLAUDE_MODEL` | Default model | (AI decides) |
| `PROXY_URL` | Proxy URL | - |
| `HOOK_SERVER_PORT` | Permission server port | `18900` |
| `LOG_DIR` | Log directory | `~/.synapse/logs` |
| `LOG_LEVEL` | Log level | `DEBUG` |

### Configuration File

`~/.synapse/config.json`:

```json
{
  "language": "zh",
  "platforms": {
    "feishu": {
      "appId": "your_app_id",
      "appSecret": "your_app_secret",
      "botName": "Feishu Bot"
    },
    "telegram": {
      "botToken": "your_bot_token",
      "botName": "Telegram Bot"
    },
    "wecom": {
      "botId": "your_bot_id",
      "botSecret": "your_bot_secret",
      "botName": "WeCom Bot"
    },
    "dingtalk": {
      "agentId": "your_agent_id",
      "appKey": "your_app_key",
      "appSecret": "your_app_secret",
      "botName": "DingTalk Bot"
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
      "dingtalk": { "groups": [], "users": [] }
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

### Application Data Directory

```
~/.synapse/
├── config.json           # Configuration
├── data/
│   ├── sessions.json     # Session persistence
│   └── active-chats.json # Active chats (lifecycle notifications)
└── logs/
    ├── 2026-04-18.log
    └── daemon.log        # Daemon log
```

---

## Permission & Approval System

### Three-Tier Risk Model

Synapse classifies commands into three risk levels:

| Level | Private Chat | Group Chat | Description |
|-------|--------------|------------|-------------|
| L1 Low Risk | Direct | Direct | Available to all users |
| L2 Medium Risk | Direct | Requires Approval | Sensitive ops need admin approval |
| L3 High Risk | Requires Approval | Requires Approval | Admin only |

### Permission Confirmation Mechanism

For L2/L3 commands, the system intercepts sensitive tool calls via PreToolUse Hook:

```
User sends command → Claude executes → Hook intercepts → Send permission card
     ↑                                                             ↓
     └─────────────── User clicks Allow/Deny ←────────────────────┘
```

**Auto-allowed read-only tools**: `Read`, `Glob`, `Grep`, `WebFetch`, `WebSearch`, `Task`, `TodoRead`

### Approval System

When L2 commands are executed in group chats, the system creates an approval request and notifies admins:

```
User executes /cd /project
    ↓
System sends approval request to admin
    ↓
Admin /approve <approvalID> or /reject <approvalID>
    ↓
User receives result notification
```

### Configure Approval Targets

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

### Claude CLI Hook Configuration

Edit `~/.claude/settings.json`:

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

Make executable: `chmod +x dist/hook/hook-script.js`

Full Claude Code session exit and restart required after changes.

---

## MCP Server

MCP Server mode allows Claude Code to proactively send messages to platforms via stdio.

### Start MCP Server

```bash
# Configure platform credentials via env vars
export WECOM_BOT_ID=xxx
export WECOM_BOT_SECRET=xxx
Synapse mcp
```

### Claude Code Configuration

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

### MCP Tools

| Tool | Description | Required Parameters |
|------|-------------|---------------------|
| `send_message` | Send message to platform | `platform`, `chatId`, `content` |
| `get_active_chats` | Get active chat list | `platform` (optional) |
| `get_chat_info` | Get chat details | `platform`, `chatId` |
| `get_incoming_messages` | Poll new messages | `platform` (optional), `limit` (optional) |

### Usage Examples

```javascript
// Send message
await mcp__synapse__send_message({
  platform: "wecom",
  chatId: "group_id or user_id",
  content: "Hello from Claude!"
});

// Get active chats
const chats = await mcp__synapse__get_active_chats({ platform: "wecom" });
```

---

## Project Structure

```
Synapse/
├── src/
│   ├── index.ts              # Bridge + MCP unified entry
│   ├── cli.ts                # CLI parsing (foreground/daemon/MCP)
│   ├── config.ts             # Configuration loading
│   ├── constants.ts          # System constants
│   ├── logger.ts             # Logging (auto-sanitization)
│   ├── i18n.ts               # Internationalization (zh/en)
│   │
│   ├── access/               # Access control & approval
│   │   ├── types.ts          # PrivilegedConfig, ApprovalConfig
│   │   ├── access-control.ts # Allowlist checks
│   │   ├── approval-manager.ts
│   │   └── approval-sender.ts # Approval sender interface
│   │
│   ├── claude/               # Claude CLI integration
│   │   ├── cli-runner.ts     # Subprocess management
│   │   └── stream-parser.ts  # stream-json parsing
│   │
│   ├── commands/              # Command handler
│   │   └── handler.ts        # Platform-agnostic command processing
│   │
│   ├── feishu/               # Feishu platform
│   │   ├── client.ts         # SDK initialization
│   │   ├── event-handler.ts  # Event handling
│   │   ├── message-sender.ts # Message sending
│   │   ├── card-builder.ts   # CardKit JSON building
│   │   ├── cardkit-manager.ts # Card lifecycle
│   │   ├── permission-handler.ts
│   │   └── approval-sender.ts
│   │
│   ├── telegram/             # Telegram platform
│   │   ├── client.ts
│   │   ├── event-handler.ts
│   │   ├── message-sender.ts
│   │   └── approval-sender.ts
│   │
│   ├── wecom/                # WeCom platform
│   │   ├── client.ts        # WSClient initialization
│   │   ├── event-handler.ts
│   │   ├── message-sender.ts
│   │   └── approval-sender.ts
│   │
│   ├── dingtalk/            # DingTalk platform
│   │   ├── client.ts
│   │   ├── event-handler.ts
│   │   ├── message-sender.ts
│   │   └── approval-sender.ts
│   │
│   ├── hook/                 # Permission hook
│   │   ├── permission-server.ts
│   │   └── hook-script.ts
│   │
│   ├── mcp/                  # MCP protocol
│   │   ├── index.ts
│   │   ├── cli.ts           # MCP mode entry
│   │   ├── server.ts        # Bridge Server
│   │   ├── router.ts        # Message routing
│   │   └── tools.ts         # MCP tool definitions
│   │
│   ├── shared/               # Shared modules
│   │   ├── active-chats.ts
│   │   ├── claude-task.ts   # Task execution layer
│   │   ├── history.ts
│   │   ├── message-dedup.ts
│   │   ├── retry.ts
│   │   ├── task-cleanup.ts
│   │   ├── types.ts
│   │   ├── update-check.ts
│   │   └── utils.ts
│   │
│   ├── session/              # Session management
│   │   └── session-manager.ts
│   │
│   └── queue/                 # Request queue
│       └── request-queue.ts
│
├── tests/                    # Unit tests (vitest)
├── CHANGELOG.md
├── README.md                 # English landing page
├── README_zh.md              # Chinese documentation
├── README_en.md              # English full documentation
└── CLAUDE.md                 # Developer guide
```

---

## Acknowledgments

This project stands on the solid foundation built by [congqiu/cc-im](https://github.com/congqiu/cc-im).

## License

MIT
