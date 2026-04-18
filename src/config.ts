try { await import('dotenv/config'); } catch {}
import { readFileSync, accessSync, constants } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, isAbsolute } from 'node:path';
import { createLogger } from './logger.js';
import type { LogLevel } from './logger.js';
import { APP_HOME } from './constants.js';
import type { ApprovalSettings, PrivilegedConfig, StartupNotifyConfig } from './access/types.js';
import type { Language } from './i18n.js';

const logger = createLogger('Config');

export type Platform = 'feishu' | 'telegram' | 'wecom' | 'dingtalk';

/**
 * 各平台配置结构
 * 每个平台有通用的 botName 和平台特定的凭证
 */
export interface PlatformConfig {
  botName?: string;
  // 飞书专用
  appId?: string;
  appSecret?: string;
  // Telegram 专用
  botToken?: string;
  // 企业微信专用
  botId?: string;
  botSecret?: string;
  // 钉钉专用
  appKey?: string;
  agentId?: string;
}

export interface PlatformsConfig {
  feishu?: PlatformConfig;
  telegram?: PlatformConfig;
  wecom?: PlatformConfig;
  dingtalk?: PlatformConfig;
}

export interface Config {
  platforms: PlatformsConfig;
  // 检测到的已配置平台（从 platforms 自动计算）
  enabledPlatforms: Platform[];
  claudeCliPath: string;
  claudeWorkDir: string;
  allowedBaseDirs: string[];
  claudeSkipPermissions: boolean;
  claudeTimeoutMs: number;
  claudeModel?: string;
  proxyUrl?: string;
  hookPort: number;
  logDir: string;
  logLevel: LogLevel;
  // 全局机器人名称（各平台无 botName 时的后备值）
  botName?: string;
  // 高权限配置（白名单、启动通知、审批等）
  privileged?: PrivilegedConfig;
  // 系统语言（中英文）
  language: Language;
}

export type { Language } from './i18n.js';

export type { ApprovalConfig, PlatformNotifyConfig, StartupNotifyConfig } from './access/types.js';

interface FileConfig {
  platforms?: PlatformsConfig;
  claudeCliPath?: string;
  claudeWorkDir?: string;
  allowedBaseDirs?: string[];
  claudeSkipPermissions?: boolean;
  claudeTimeoutMs?: number;
  claudeModel?: string;
  proxyUrl?: string;
  hookPort?: number;
  logDir?: string;
  logLevel?: LogLevel;
  botName?: string;
  // 向后兼容旧版平铺配置
  feishuAppId?: string;
  feishuAppSecret?: string;
  telegramBotToken?: string;
  wecomBotId?: string;
  wecomBotSecret?: string;
  wecomBotName?: string;
  feishuBotName?: string;
  telegramBotName?: string;
  dingtalkAppKey?: string;
  dingtalkAppSecret?: string;
  dingtalkAgentId?: string;
  privileged?: PrivilegedConfig;
  // 系统语言（中英文）
  language?: Language;
}

function emptyPlatformRecord(): Record<Platform, string[]> {
  return { feishu: [], telegram: [], wecom: [], dingtalk: [] };
}

function defaultApprovalSettings(): ApprovalSettings {
  return {
    enabled: false,
    groupRequired: false,
    timeoutMs: 300_000,
    mode: 'any',
  };
}

/**
 * 合并 `privileged` 配置。
 */
function mergePrivilegedConfig(file: FileConfig): PrivilegedConfig | undefined {
  if (!file.privileged) {
    return undefined;
  }

  const p = file.privileged;
  return {
    users: { ...emptyPlatformRecord(), ...p.users },
    startup: p.startup,
    approval: {
      targets: { ...emptyPlatformRecord(), ...p.approval?.targets },
      settings: { ...defaultApprovalSettings(), ...p.approval?.settings },
    },
  };
}

function loadFileConfig(): FileConfig {
  const configPath = join(APP_HOME, 'config.json');
  try {
    const content = readFileSync(configPath, 'utf-8');
    logger.debug(`Loaded configuration from ${configPath}`);
    return JSON.parse(content);
  } catch (err: unknown) {
    if (err instanceof SyntaxError) {
      logger.warn(`警告: 配置文件 ${configPath} 格式错误，将使用环境变量`);
      logger.warn(`错误详情: ${err.message}`);
    } else {
      const error = err as NodeJS.ErrnoException;
      if (error.code !== 'ENOENT') {
        logger.warn(`警告: 无法读取配置文件 ${configPath}: ${error.message}`);
      }
    }
    return {};
  }
}

function parseCommaSeparated(value: string): string[] {
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

function detectPlatforms(file: FileConfig): Platform[] {
  const platforms: Platform[] = [];

  // 从文件配置或环境变量检测各平台
  // 优先使用新结构 platforms，其次兼容旧版平铺字段

  // Telegram
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN
    ?? file.platforms?.telegram?.botToken
    ?? file.telegramBotToken;
  if (telegramToken) {
    platforms.push('telegram');
  }

  // 飞书
  const feishuAppId = process.env.FEISHU_APP_ID
    ?? file.platforms?.feishu?.appId
    ?? file.feishuAppId;
  const feishuAppSecret = process.env.FEISHU_APP_SECRET
    ?? file.platforms?.feishu?.appSecret
    ?? file.feishuAppSecret;
  if (feishuAppId && feishuAppSecret) {
    platforms.push('feishu');
  }

  // 企业微信
  const wecomBotId = process.env.WECOM_BOT_ID
    ?? file.platforms?.wecom?.botId
    ?? file.wecomBotId;
  const wecomBotSecret = process.env.WECOM_BOT_SECRET
    ?? file.platforms?.wecom?.botSecret
    ?? file.wecomBotSecret;
  if (wecomBotId && wecomBotSecret) {
    platforms.push('wecom');
  }

  // 钉钉
  const dingtalkAppKey = process.env.DINGTALK_APP_KEY
    ?? file.platforms?.dingtalk?.appKey
    ?? file.dingtalkAppKey;
  const dingtalkAppSecret = process.env.DINGTALK_APP_SECRET
    ?? file.platforms?.dingtalk?.appSecret
    ?? file.dingtalkAppSecret;
  const dingtalkAgentId = process.env.DINGTALK_AGENT_ID
    ?? file.platforms?.dingtalk?.agentId
    ?? file.dingtalkAgentId;
  if (dingtalkAppKey && dingtalkAppSecret && dingtalkAgentId) {
    platforms.push('dingtalk');
  }

  // 如果都没配置，抛出错误
  if (platforms.length === 0) {
    throw new Error(
      '至少需要配置一个平台：\n' +
      '  Telegram: 设置 TELEGRAM_BOT_TOKEN\n' +
      '  飞书: 设置 FEISHU_APP_ID 和 FEISHU_APP_SECRET\n' +
      '  企业微信: 设置 WECOM_BOT_ID 和 WECOM_BOT_SECRET\n' +
      '  钉钉: 设置 DINGTALK_APP_KEY、DINGTALK_APP_SECRET 和 DINGTALK_AGENT_ID'
    );
  }

  return platforms;
}

export function loadConfig(): Config {
  const file = loadFileConfig();

  // 构建 platforms 配置（合并环境变量、旧版字段、platforms 对象）
  const platforms: PlatformsConfig = {};

  // 飞书
  const feishuAppId = process.env.FEISHU_APP_ID ?? file.platforms?.feishu?.appId ?? file.feishuAppId;
  const feishuAppSecret = process.env.FEISHU_APP_SECRET ?? file.platforms?.feishu?.appSecret ?? file.feishuAppSecret;
  if (feishuAppId || feishuAppSecret) {
    platforms.feishu = {
      appId: feishuAppId,
      appSecret: feishuAppSecret,
      botName: file.platforms?.feishu?.botName ?? file.feishuBotName,
    };
  }

  // Telegram
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN ?? file.platforms?.telegram?.botToken ?? file.telegramBotToken;
  if (telegramBotToken) {
    platforms.telegram = {
      botToken: telegramBotToken,
      botName: file.platforms?.telegram?.botName ?? file.telegramBotName,
    };
  }

  // 企业微信
  const wecomBotId = process.env.WECOM_BOT_ID ?? file.platforms?.wecom?.botId ?? file.wecomBotId;
  const wecomBotSecret = process.env.WECOM_BOT_SECRET ?? file.platforms?.wecom?.botSecret ?? file.wecomBotSecret;
  if (wecomBotId || wecomBotSecret) {
    platforms.wecom = {
      botId: wecomBotId,
      botSecret: wecomBotSecret,
      botName: file.platforms?.wecom?.botName ?? file.wecomBotName,
    };
  }

  // 钉钉
  const dingtalkAppKey = process.env.DINGTALK_APP_KEY ?? file.platforms?.dingtalk?.appKey ?? file.dingtalkAppKey;
  const dingtalkAppSecret = process.env.DINGTALK_APP_SECRET ?? file.platforms?.dingtalk?.appSecret ?? file.dingtalkAppSecret;
  const dingtalkAgentId = process.env.DINGTALK_AGENT_ID ?? file.platforms?.dingtalk?.agentId ?? file.dingtalkAgentId;
  if (dingtalkAppKey && dingtalkAppSecret && dingtalkAgentId) {
    platforms.dingtalk = {
      appKey: dingtalkAppKey,
      appSecret: dingtalkAppSecret,
      agentId: dingtalkAgentId,
      botName: file.platforms?.dingtalk?.botName,
    };
  }

  const claudeCliPath = process.env.CLAUDE_CLI_PATH ?? file.claudeCliPath ?? 'claude';
  const claudeWorkDir = process.env.CLAUDE_WORK_DIR ?? file.claudeWorkDir ?? process.cwd();

  const allowedBaseDirs =
    process.env.ALLOWED_BASE_DIRS !== undefined
      ? parseCommaSeparated(process.env.ALLOWED_BASE_DIRS)
      : file.allowedBaseDirs ?? [];
  if (allowedBaseDirs.length === 0) {
    allowedBaseDirs.push(claudeWorkDir);
  }

  const claudeSkipPermissions =
    process.env.CLAUDE_SKIP_PERMISSIONS !== undefined
      ? process.env.CLAUDE_SKIP_PERMISSIONS === 'true'
      : file.claudeSkipPermissions ?? false;

  const claudeTimeoutMs =
    process.env.CLAUDE_TIMEOUT_MS !== undefined
      ? parseInt(process.env.CLAUDE_TIMEOUT_MS, 10) || 600000
      : file.claudeTimeoutMs ?? 600000;

  // 验证 Claude CLI 路径
  if (isAbsolute(claudeCliPath) || claudeCliPath.includes('/')) {
    // 绝对路径或包含目录分隔符：直接用 accessSync 验证
    try {
      accessSync(claudeCliPath, constants.F_OK | constants.X_OK);
    } catch (err) {
      throw new Error(
        `Claude CLI 不可访问或不可执行: ${claudeCliPath}\n` +
        `请检查：\n` +
        `  1. 文件是否存在\n` +
        `  2. 是否有执行权限\n` +
        `  3. CLAUDE_CLI_PATH 环境变量或 ${APP_HOME} 配置是否正确`
      );
    }
  } else {
    // 裸命令名（如 "claude"）：在 PATH 中查找
    try {
      execFileSync('which', [claudeCliPath], { stdio: 'pipe' });
    } catch (err) {
      throw new Error(
        `Claude CLI 在 PATH 中未找到: ${claudeCliPath}\n` +
        `请检查：\n` +
        `  1. 是否已安装 Claude CLI\n` +
        `  2. 命令是否在 PATH 环境变量中\n` +
        `  3. 或通过 CLAUDE_CLI_PATH 指定完整路径`
      );
    }
  }

  const hookPort =
    process.env.HOOK_SERVER_PORT !== undefined
      ? parseInt(process.env.HOOK_SERVER_PORT, 10) || 18900
      : file.hookPort ?? 18900;

  const proxyUrl = process.env.PROXY_URL ?? file.proxyUrl;

  const logDir = process.env.LOG_DIR ?? file.logDir ?? join(APP_HOME, 'logs');
  const logLevel = (process.env.LOG_LEVEL?.toUpperCase() ?? file.logLevel ?? 'DEBUG') as LogLevel;

  const language = (process.env.SYNAPSE_LANGUAGE?.toLowerCase() ?? file.language ?? 'zh') as Language;

  return {
    platforms,
    enabledPlatforms: detectPlatforms(file),
    claudeCliPath,
    claudeWorkDir,
    allowedBaseDirs,
    claudeSkipPermissions,
    claudeTimeoutMs,
    claudeModel: process.env.CLAUDE_MODEL ?? file.claudeModel,
    proxyUrl,
    hookPort,
    logDir,
    logLevel,
    botName: file.botName,
    privileged: mergePrivilegedConfig(file),
    language,
  };
}
