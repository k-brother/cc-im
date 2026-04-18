#!/usr/bin/env node
/**
 * cc-im Unified Entry Point
 *
 * Starts both Bridge (AI + commands) and MCP server in the same process.
 * - Bridge handles WeCom messages (AI chat + commands)
 * - MCP provides admin tools via stdio for sending messages
 *
 * Usage: cc-im [options]
 *   (no args)    - Start Bridge + MCP (unified mode)
 *   -d, --daemon - Start Bridge as daemon
 *   stop         - Stop running service
 *   mcp          - Start MCP only mode (no Bridge AI)
 */

import { loadConfig, type Config, type StartupNotifyConfig } from './config.js';
import { initFeishu, stopFeishu } from './feishu/client.js';
import { initTelegram, stopTelegram } from './telegram/client.js';
import { createEventDispatcher, type FeishuEventHandlerHandle } from './feishu/event-handler.js';
import { stopCleanupTimer as stopCardKitCleanup } from './feishu/cardkit-manager.js';
import { sendTextReply as feishuSendText } from './feishu/message-sender.js';
import { setupTelegramHandlers, type TelegramEventHandlerHandle } from './telegram/event-handler.js';
import { sendTextReply as telegramSendText } from './telegram/message-sender.js';
import { initWecom, stopWecom, getWSClient } from './wecom/client.js';
import { setupWecomHandlers } from './wecom/event-handler.js';
import type { WecomEventHandlerHandle } from './wecom/client.js';
import { sendTextReply as wecomSendText } from './wecom/message-sender.js';
import { startPermissionServer } from './hook/permission-server.js';
import { ensureHookConfigured } from './hook/ensure-hook.js';
import { SessionManager } from './session/session-manager.js';
import { loadActiveChats, getActiveChatId, flushActiveChats } from './shared/active-chats.js';
import { cleanOldImages } from './shared/utils.js';
import { checkForUpdate } from './shared/update-check.js';
import { initLogger, createLogger, closeLogger } from './logger.js';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerWecomMessageHandler, registerFeishuMessageHandler, registerTelegramMessageHandler, createMcpBridgeTools, enqueueMessage } from './mcp/server.js';
import { getClient as getFeishuClient } from './feishu/client.js';
import { getBot as getTelegramBot } from './telegram/client.js';
import * as Lark from '@larksuiteoapi/node-sdk';

const require = createRequire(import.meta.url);
const { version: APP_VERSION } = require('../package.json');

const log = createLogger('Main');

function getClaudeVersion(cliPath: string): string {
  try { return execFileSync(cliPath, ['--version'], { timeout: 5000 }).toString().trim(); } catch { return '未知'; }
}

function getBotName(platform: 'feishu' | 'telegram' | 'wecom', config: Config): string {
  // Platform-specific name takes precedence
  if (platform === 'wecom' && config.wecomBotName) return config.wecomBotName;
  if (platform === 'feishu' && config.feishuBotName) return config.feishuBotName;
  if (platform === 'telegram' && config.telegramBotName) return config.telegramBotName;
  // Fall back to unified botName
  if (config.botName) return config.botName;
  // Default fallback
  return 'cc-im';
}

const GROUP_GREETING = (botName: string) => `${botName} 已上线
您好！我是您的智能办公助理。

📌 支持功能：
• 文档撰写与润色
• 数据分析与报告
• 智能问答与解答

🔧 常用命令：
/new — 开始新对话
/resume — 继续未完成的对话
/model — 切换 AI 模型
/stop — 停止当前任务
/chatid — 查看当前会话 ID

💬 直接 @机器人 + 问题即可使用

服务时间: 工作日 09:00-18:00`;

const PRIVATE_GREETING = (botName: string, activeBots: string[], config: Config) => {
  const platform = activeBots[0] === 'WeCom' ? '企业微信' : activeBots[0] || '未知';
  return `${botName} 服务已启动
平台: ${platform}
工作目录: ${config.claudeWorkDir}
权限确认: ${config.claudeSkipPermissions ? '已跳过' : '已启用'}
Claude CLI: ${getClaudeVersion(config.claudeCliPath)}
Node: ${process.version}`;
};

async function sendLifecycleNotification(activeBots: string[], config: Config, isShutdown = false, uptime?: { h: number; m: number }) {
  if (!config.startupNotify) {
    log.info('启动通知已禁用（未配置 startupNotify）');
    return;
  }

  const tasks: Promise<void>[] = [];

  for (const bot of activeBots) {
    const platform = bot.toLowerCase() as 'feishu' | 'telegram' | 'wecom';
    const notifyConfig = config.startupNotify?.[platform];
    if (!notifyConfig) continue;

    const botName = getBotName(platform, config);
    const sender = platform === 'feishu' ? feishuSendText : platform === 'wecom' ? wecomSendText : telegramSendText;

    // Send to groups
    for (const chatId of notifyConfig.groups) {
      const message = isShutdown
        ? `🔴 ${botName} 服务正在关闭...\n运行时长: ${uptime!.h > 0 ? `${uptime!.h}h${uptime!.m}m` : `${uptime!.m}m`}`
        : GROUP_GREETING(botName);
      tasks.push(sender(chatId, message).catch((err) => {
        log.debug(`Failed to send group notification to ${chatId}:`, err);
      }));
    }

    // Send to users (private chat)
    for (const chatId of notifyConfig.users) {
      const message = isShutdown
        ? `🔴 ${botName} 服务正在关闭...\n运行时长: ${uptime!.h > 0 ? `${uptime!.h}h${uptime!.m}m` : `${uptime!.m}m`}`
        : PRIVATE_GREETING(botName, activeBots, config);
      tasks.push(sender(chatId, message).catch((err) => {
        log.debug(`Failed to send user notification to ${chatId}:`, err);
      }));
    }
  }

  await Promise.allSettled(tasks);
}

export async function main() {
  const config = loadConfig();
  initLogger(config.logDir, config.logLevel);
  loadActiveChats();
  log.info('Starting cc-im unified mode (Bridge + MCP)...');
  log.info(`Enabled platforms: ${config.enabledPlatforms.join(', ')}`);
  log.info(`Allowed users: ${config.allowedUserIds.length === 0 ? 'ALL (dev mode)' : config.allowedUserIds.length + ' users configured'}`);
  log.info(`Claude CLI: ${config.claudeCliPath}`);
  log.info(`Default work directory: ${config.claudeWorkDir}`);
  log.info(`Skip permissions: ${config.claudeSkipPermissions}`);
  log.info(`Timeout: ${config.claudeTimeoutMs}ms`);

  const sessionManager = new SessionManager(config.claudeWorkDir, config.allowedBaseDirs);

  // Mutable routing table - populated as platforms connect
  const routingTable: { wecom?: typeof import('@wecom/aibot-node-sdk').WSClient.prototype; feishu?: import('@larksuiteoapi/node-sdk').Client; telegram?: import('telegraf').Telegraf } = {};

  // Permission server
  let permissionServer: { port: number; close: () => Promise<void> } | null = null;
  if (!config.claudeSkipPermissions) {
    ensureHookConfigured();
    permissionServer = await startPermissionServer(config.hookPort);
    log.info(`Permission hook server started on port ${permissionServer.port}`);
  }

  // Create MCP tools with live routingTable reference
  const { tools, handlers } = createMcpBridgeTools(routingTable);

  // Start MCP server on stdio (blocks until Claude Code connects)
  log.info('Starting MCP server on stdio...');
  const server = new McpServer(
    { name: 'cc-im', version: APP_VERSION },
    { capabilities: { tools: {} } }
  );

  for (const tool of tools) {
    server.registerTool(tool.name, tool as any, async (args: any) => {
      try {
        const handler = (handlers as any)[tool.name];
        if (handler) {
          return await handler(args);
        }
        return { content: [{ type: 'text', text: `Unknown tool: ${tool.name}` }], isError: true };
      } catch (err) {
        log.error(`[MCP] Tool ${tool.name} error:`, err);
        return {
          content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    });
  }

  try {
    const transport = new StdioServerTransport();
    await server.connect(transport as any);
    log.info('MCP server running on stdio');
  } catch (err) {
    log.error('Failed to connect MCP to stdio:', err);
    closeLogger();
    process.exit(1);
  }

  // Platform handles for shutdown
  let feishuHandle: FeishuEventHandlerHandle | null = null;
  let telegramHandle: TelegramEventHandlerHandle | null = null;
  let wecomHandle: WecomEventHandlerHandle | null = null;
  const activeBots: string[] = [];

  // Initialize platforms sequentially (keep original flow)
  if (config.enabledPlatforms.includes('telegram')) {
    if (!config.telegramBotToken) {
      log.warn('Telegram is in enabledPlatforms but TELEGRAM_BOT_TOKEN not configured. Skipping.');
    } else {
      try {
        await initTelegram(config, (bot) => {
          telegramHandle = setupTelegramHandlers(bot, config, sessionManager);
          registerTelegramMessageHandler(bot, enqueueMessage);
          routingTable.telegram = bot;
        });
        activeBots.push('Telegram');
        log.info('Telegram initialized (Bridge + MCP)');
      } catch (err) {
        log.error('Failed to initialize Telegram bot:', err);
      }
    }
  }

  if (config.enabledPlatforms.includes('feishu')) {
    if (!config.feishuAppId || !config.feishuAppSecret) {
      log.warn('Feishu is in enabledPlatforms but FEISHU_APP_ID / FEISHU_APP_SECRET not configured. Skipping.');
    } else {
      try {
        feishuHandle = createEventDispatcher(config, sessionManager);
        await initFeishu(config, feishuHandle.dispatcher);
        registerFeishuMessageHandler(feishuHandle.dispatcher, enqueueMessage);
        routingTable.feishu = getFeishuClient();
        activeBots.push('Feishu');
        log.info('Feishu initialized (Bridge + MCP)');
      } catch (err) {
        log.error('Failed to initialize Feishu bot:', err);
      }
    }
  }

  if (config.enabledPlatforms.includes('wecom')) {
    if (!config.wecomBotId || !config.wecomBotSecret) {
      log.warn('WeCom is enabled but WECOM_BOT_ID / WECOM_BOT_SECRET not configured. Skipping.');
    } else {
      try {
        const { wsClient } = await initWecom(config, (client) => {
          wecomHandle = setupWecomHandlers(client, config, sessionManager);
          registerWecomMessageHandler(client);
          return wecomHandle;
        });
        routingTable.wecom = wsClient;
        activeBots.push('WeCom');
        log.info('WeCom initialized (Bridge + MCP)');
      } catch (err) {
        log.error('Failed to initialize WeCom bot:', err);
      }
    }
  }

  if (activeBots.length === 0) {
    log.error('No platforms were successfully initialized!');
    process.exit(1);
  }

  log.info(`Service is running with ${activeBots.join(' + ')}. Press Ctrl+C to stop.`);

  const startedAt = Date.now();
  const startupMsg = [
    `🟢 cc-im v${APP_VERSION} 服务已启动`,
    '',
    `平台: ${activeBots.join(' + ')}`,
    `工作目录: ${config.claudeWorkDir}`,
    `权限确认: ${config.claudeSkipPermissions ? '已跳过' : '已启用'}`,
    config.claudeModel ? `模型: ${config.claudeModel}` : '',
    `Claude CLI: ${getClaudeVersion(config.claudeCliPath)}`,
    `Node: ${process.version}`,
  ].filter(Boolean).join('\n');
  sendLifecycleNotification(activeBots, config).catch(() => {});
  checkForUpdate(APP_VERSION).catch(() => {});

  const imageCleanupTimer = setInterval(() => {
    cleanOldImages().then((n) => { if (n > 0) log.info(`Cleaned ${n} old image(s)`); }).catch(() => {});
  }, 10 * 60 * 1000);
  imageCleanupTimer.unref();

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info('Shutting down...');
    clearInterval(imageCleanupTimer);

    const uptimeSec = Math.floor((Date.now() - startedAt) / 1000);
    const h = Math.floor(uptimeSec / 3600);
    const m = Math.floor((uptimeSec % 3600) / 60);
    await sendLifecycleNotification(activeBots, config, true, { h, m }).catch(() => {});

    telegramHandle?.stop();
    if (config.enabledPlatforms.includes('telegram')) stopTelegram();
    feishuHandle?.stop();
    if (config.enabledPlatforms.includes('feishu')) stopFeishu();
    wecomHandle?.stop();
    if (config.enabledPlatforms.includes('wecom')) stopWecom();
    permissionServer?.close();
    sessionManager.destroy();
    flushActiveChats();
    if (config.enabledPlatforms.includes('feishu')) stopCardKitCleanup();

    closeLogger();
    process.exit(0);
  };

  process.on('SIGINT', () => { shutdown().catch(() => process.exit(1)); });
  process.on('SIGTERM', () => { shutdown().catch(() => process.exit(1)); });
}
