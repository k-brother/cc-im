# Synapse

Multi-platform bot bridge connecting Feishu, Telegram, WeCom, DingTalk with Claude Code CLI.

[![Node.js >= 20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-strict-blue)](https://www.typescriptlang.org/)
[![MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## Quick Links

| Language | Documentation |
|----------|--------------|
| English | [README_en.md](README_en.md) |
| 中文 | [README_zh.md](README_zh.md) |
| 开发者指南 | [CLAUDE.md](CLAUDE.md) |

## At a Glance

- **4 Platforms**: Feishu, Telegram, WeCom, DingTalk
- **MCP Server**: Proactive messaging via stdio
- **i18n**: Chinese and English UI
- **Permission System**: Three-tier risk model with approval workflow
- **Streaming**: Real-time AI responses with thinking process display

## Quick Start

```bash
# Configure at least one platform
export TELEGRAM_BOT_TOKEN=your_token
export SYNAPSE_LANGUAGE=en   # Optional, defaults to Chinese

# Run
npx synapse@latest
```

## Features

- Real-time streaming responses
- Thinking process display (collapsible panel)
- Tool call notifications
- Session management with resume support
- Concurrency control (serial per session, parallel across sessions)
- Image messages and screenshots
- Stop button for long-running tasks
- Lifecycle notifications (startup/shutdown)
- Daemon mode (`Synapse -d`)

## Documentation

- **[English Guide](README_en.md)** — Complete documentation in English
- **[中文文档](README_zh.md)** — 完整中文文档
- **[Developer Guide](CLAUDE.md)** — Architecture, APIs, and development tasks

## License

MIT
