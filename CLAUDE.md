# CLAUDE.md

Developer guide for working with Synapse codebase.

## Project Overview

Synapse is a multi-platform bot bridge service with two modes:
- **Bridge Mode**: Receives messages → invokes Claude Code → streams responses back
- **MCP Server Mode**: MCP protocol via stdio for proactive messaging

## Development Commands

```bash
pnpm install    # Install dependencies
pnpm dev        # Development mode (auto-reload)
pnpm build      # Build for production
npm install -g @tk-brother/synapse  # Global install
```
pnpm start      # Production mode (foreground)
Synapse -d       # Daemon mode (background)
Synapse stop      # Stop daemon
pnpm test       # Run tests
pnpm test:watch # Watch mode
```

## Architecture

### Entry Points

- `src/cli.ts` → parses CLI arguments (foreground/daemon/mcp)
- `src/index.ts` → `main()` unified entry (Bridge + MCP mode)
- `src/mcp/cli.ts` → MCP-only mode entry (`Synapse mcp`)

### Platform Modules

Each platform has its own directory under `src/`:
- `feishu/` — CardKit streaming, thread sessions
- `telegram/` — Telegraf polling, editMessage updates
- `wecom/` — WebSocket, replyStream native streaming
- `dingtalk/` — HTTP API, work notifications

### Key Shared Modules

| Module | Location | Purpose |
|--------|----------|---------|
| SessionManager | `src/session/session-manager.ts` | Per-user sessionId, workDir, persistence |
| RequestQueue | `src/queue/request-queue.ts` | Concurrency: serial per convId, parallel across sessions |
| ClaudeTask | `src/shared/claude-task.ts` | Task execution layer: throttling, stats, race protection |
| PermissionServer | `src/hook/permission-server.ts` | PreToolUse Hook interception |
| ApprovalManager | `src/access/approval-manager.ts` | L2/L3 command approval workflow |

### Message Flow

```
Platform → EventHandler → CommandHandler → RequestQueue → ClaudeTask
    ↑                                                           ↓
    └──────────────── MessageSender ────────────────────────────┘
```

## Configuration

Configuration is loaded from (priority high→low):
1. Environment variables
2. `~/.Synapse/config.json`
3. Defaults

Key config interfaces in `src/config.ts`:
- `Config` — full config
- `PlatformsConfig` — per-platform credentials
- `PrivilegedConfig` — users, approval targets

Key type definitions in `src/access/types.ts`:
- `PrivilegedConfig` — users (by platform), approval config
- `ApprovalConfig` — targets (by platform), settings
- `ApprovalSettings` — timeout, etc.

## Adding a New Command

1. Add command handler in `src/commands/handler.ts`
2. Add platform-specific trigger (if needed)
3. Update help text in locale strings (`src/i18n.ts`)
4. Add tests in `tests/unit/commands/handler.test.ts`

## Adding a New Platform

1. Create `src/<platform>/` directory
2. Implement `client.ts` — SDK initialization
3. Implement `event-handler.ts` — message/reaction handling
4. Implement `message-sender.ts` — sendMessage interface
5. Implement `approval-sender.ts` — platform-specific approval sender
6. Register platform in `src/index.ts` and `src/config.ts`

## Testing

```bash
pnpm test                              # All tests
pnpm test -- tests/unit/config.test.ts # Single file
```

Tests use vitest, located in `tests/unit/` mirroring `src/` structure.

## Key Conventions

- **ESM modules**: Always use `.js` extension in imports
- **TypeScript strict mode**: Target ES2023
- **pnpm** as package manager
- **Commit format**: `<type>: <subject>` (Chinese)
- **Stream throttling**: Feishu 80ms, Telegram 200ms, WeCom 200ms
- **Message limits**: Feishu 3800 chars (card), Telegram 4000, WeCom 4000

## i18n

All user-facing strings are in `src/i18n.ts`:
- `Language` type: `'zh' | 'en'`
- `LocaleStrings` interface: all translatable strings
- `t(lang)` function: returns locale strings for language

To add a new string:
1. Add to `LocaleStrings` interface
2. Add to both `zh` and `en` objects
3. Use `t(getLang())` in code

## Privileged Config Structure

```typescript
interface PrivilegedConfig {
  users: Record<Platform, string[]>;  // allowlist by platform
  approval: ApprovalConfig;          // approval targets & settings
}

interface ApprovalConfig {
  targets: Record<Platform, string[]>;  // admin IDs by platform
  settings: ApprovalSettings;
}
```

## Release Process

Use `/release` skill to automatically:
1. Update CHANGELOG.md
2. Bump version in package.json
3. Create git tag and push
