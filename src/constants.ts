import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { RiskLevel } from './access/types.js';

/**
 * 系统级常量定义
 */

/**
 * 命令风险等级映射
 * L1 低风险：所有用户可直接执行
 * L2 中风险：群聊中需审批，私聊直接执行
 * L3 高风险：仅管理员可用
 */
export const COMMAND_RISK_LEVELS: Record<string, RiskLevel> = {
  // === L1 低风险：所有用户可直接执行 ===
  '/help': RiskLevel.L1,
  '/new': RiskLevel.L1,
  '/status': RiskLevel.L1,
  '/cost': RiskLevel.L1,
  '/doctor': RiskLevel.L1,
  '/pwd': RiskLevel.L1,
  '/list': RiskLevel.L1,
  '/history': RiskLevel.L1,
  '/compact': RiskLevel.L1,
  '/threads': RiskLevel.L1,
  '/start': RiskLevel.L1,
  '/stop': RiskLevel.L1,
  '/chatid': RiskLevel.L1,

  // === L2 中风险：群聊需审批，私聊直接执行 ===
  '/cd': RiskLevel.L2,
  '/model': RiskLevel.L2,
  '/resume': RiskLevel.L2,

  // === L3 高风险：仅管理员可用 ===
  '/allow': RiskLevel.L3,
  '/y': RiskLevel.L3,
  '/deny': RiskLevel.L3,
  '/n': RiskLevel.L3,
  '/approve': RiskLevel.L3,
  '/reject': RiskLevel.L3,
};

/**
 * Synapse 应用数据根目录
 * 优先使用 ~/.cc-im（已存在则兼容），否则使用 ~/.synapse
 */
export const APP_HOME = (() => {
  const ccImDir = join(homedir(), '.cc-im');
  const synapseDir = join(homedir(), '.synapse');
  return existsSync(ccImDir) ? ccImDir : synapseDir;
})();

export const IMAGE_DIR = join(tmpdir(), 'synapse-images');

/**
 * 只读工具列表 - 这些工具不需要权限确认
 * 用于 Hook Script 中判断是否需要请求用户授权
 */
export const READ_ONLY_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'Task',
  'TodoRead',
];

/**
 * 仅终端可用的命令集合
 * 这些命令只能在 Claude Code CLI 终端交互模式下使用
 * 在飞书/Telegram 等消息平台中不可用
 */
export const TERMINAL_ONLY_COMMANDS = new Set([
  '/context',
  '/rewind',
  '/copy',
  '/export',
  '/config',
  '/init',
  '/memory',
  '/permissions',
  '/theme',
  '/vim',
  '/statusline',
  '/terminal-setup',
  '/debug',
  '/tasks',
  '/mcp',
  '/teleport',
  '/add-dir',
]);

/**
 * 消息去重 TTL（毫秒）
 * 用于防止重复处理同一消息
 */
export const DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * 消息更新节流时间（毫秒）
 * Telegram 使用 editMessageText，限频较严
 */
export const THROTTLE_MS = 200;

/**
 * CardKit 流式更新节流时间（毫秒）
 * cardElement.content 专为流式设计，支持更高频率
 */
export const CARDKIT_THROTTLE_MS = 80;

/**
 * 飞书卡片最大内容长度（JSON 1.0 / im.v1.message.patch）
 */
export const MAX_CARD_CONTENT_LENGTH = 3800;

/**
 * CardKit 流式内容最大长度（CardKit 卡片上限 30KB，留余量）
 */
export const MAX_STREAMING_CONTENT_LENGTH = 25000;

/**
 * Telegram 消息最大长度
 */
export const MAX_TELEGRAM_MESSAGE_LENGTH = 4000; // Telegram 限制 4096，留一些余地

/**
 * 权限请求超时时间（毫秒）
 */
export const PERMISSION_REQUEST_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * 权限请求体最大大小（字节）
 */
export const MAX_BODY_SIZE = 1024 * 1024; // 1MB

/**
 * Hook Script 退出码
 */
export const HOOK_EXIT_CODES = {
  /** 成功（允许或自动放行） */
  SUCCESS: 0,
  /** 一般错误 */
  ERROR: 1,
  /** 权限服务器不可达 */
  PERMISSION_SERVER_ERROR: 2,
} as const;

/**
 * 企业微信流式更新节流时间（毫秒）
 */
export const WECOM_THROTTLE_MS = 200;

/**
 * 企业微信流式消息续接阈值（毫秒）
 * 企业微信流式消息有 6 分钟硬超时，设 5 分 30 秒触发续接
 */
export const WECOM_STREAM_TIMEOUT_MS = 330_000;

/**
 * 企业微信消息最大长度
 * replyStream 的 content 最长不超过 20480 字节（utf-8）
 * 为安全起见，以字符计限制在 4000
 */
export const MAX_WECOM_MESSAGE_LENGTH = 4000;
