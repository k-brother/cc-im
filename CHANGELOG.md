# Changelog

All notable changes to Synapse will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.2-alpha] - 2026-04-19

### 其他 (Other)

- 优化群聊/私聊启动问候语样式，支持自定义问候语配置

## [1.0.1] - 2026-04-19

### 其他 (Other)

- 新增 `npm install -g @tk-brother/synapse` 全局安装命令到文档

## [1.0.0] - 2026-04-18

### 新功能 (New Features)

- **多平台扩展**：新增钉钉（DingTalk）平台支持，成为首个支持 4 大平台（飞书、Telegram、企业微信、钉钉）的版本
- **MCP Server**：内置 MCP (Model Context Protocol) Server，支持通过 stdio 与 Claude Code 等 MCP 客户端集成，实现 AI 主动向办公平台推送消息
- **多语言支持 (i18n)**：系统 UI 消息支持中文和英文双语，通过 `SYNAPSE_LANGUAGE` 环境变量或 `language` 配置项切换
- **审批系统**：完整的 L2/L3 命令审批工作流，支持按平台配置审批目标管理员
- **三级权限模型**：L1（所有用户直接执行）、L2（私聊直接，群聊需审批）、L3（仅管理员可用）

### 重构 (Refactoring)

- **配置结构重组**：`PrivilegedConfig` 结构优化，`approval` 配置归入 `approval` 子对象，`users` 按平台区分
- **审批发送器抽象**：提取 `ApprovalSender` 接口，四大平台统一实现
- **i18n 模块化**：所有 UI 字符串提取到 `src/i18n.ts`，支持中英双语

### 文档 (Documentation)

- 新增 `README_zh.md`（中文完整文档）和 `README_en.md`（英文完整文档）
- 重构 `CLAUDE.md`（开发者指南）
- 简化 `README.md`（首页快速导航）

### 其他 (Other)

- 数据目录优先使用 `~/.synapse/`，自动兼容已有 `~/.cc-im/` 目录的老用户
