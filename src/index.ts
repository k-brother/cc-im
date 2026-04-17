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

import { loadConfig } from './config.js';
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

async function sendLifecycleNotification(activeBots: string[], message: string) {
  const tasks: Promise<void>[] = [];
  for (const bot of activeBots) {
    const platform = bot.toLowerCase() as 'feishu' | 'telegram' | 'wecom';
    const chatId = getActiveChatId(platform);
    if (!chatId) {
      log.info(`${bot} 启动通知跳过：尚无活跃聊天记录，向机器人发送一条消息后下次启动即可收到通知`);
      continue;
    }
    const sender = platform === 'feishu' ? feishuSendText : platform === 'wecom' ? wecomSendText : telegramSendText;
    tasks.push(sender(chatId, message).catch((err) => {
      log.debug(`Failed to send ${bot} lifecycle notification:`, err);
    }));
  }
  await Promise.allSettled(tasks);
}

/**
 * Start unified Bridge + MCP mode
 * Initializes all enabled platforms and shares MCP tools across them
 */
async function startUnifiedMode(): Promise<void> {
  const config = loadConfig();
  initLogger(config.logDir, config.logLevel);
  loadActiveChats();
  log.info('Starting cc-im unified mode (Bridge + MCP)...');

  // Permission server for Bridge
  let permissionServer: { port: number; close: () => Promise<void> } | null = null;
  if (!config.claudeSkipPermissions) {
    ensureHookConfigured();
    permissionServer = await startPermissionServer(config.hookPort);
    log.info(`Permission hook server started on port ${permissionServer.port}`);
  }

  // Session manager for Bridge
  const sessionManager = new SessionManager(config.claudeWorkDir, config.allowedBaseDirs);

  // Routing table for MCP tools
  const routingTable: { wecom?: typeof import('@wecom/aibot-node-sdk').WSClient.prototype; feishu?: import('@larksuiteoapi/node-sdk').Client; telegram?: import('telegraf').Telegraf } = {};

  // Platform handles for shutdown
  let wecomHandle: WecomEventHandlerHandle | null = null;
  let feishuHandle: FeishuEventHandlerHandle | null = null;
  let telegramBot: ReturnType<typeof getTelegramBot> | null = null;

  // Initialize WeCom with Bridge event handlers
  if (config.enabledPlatforms.includes('wecom')) {
    if (!config.wecomBotId || !config.wecomBotSecret) {
      log.error('WeCom is enabled but WECOM_BOT_ID / WECOM_BOT_SECRET not configured. Please configure them or remove wecom from enabledPlatforms.');
      process.exit(1);
    }
    const { wsClient } = await initWecom(config, (client) => {
      wecomHandle = setupWecomHandlers(client, config, sessionManager);
      registerWecomMessageHandler(client);
      return wecomHandle;
    });
    routingTable.wecom = wsClient;
    log.info('WeCom initialized (Bridge + MCP)');
  }

  // Initialize Feishu with Bridge event handlers
  if (config.enabledPlatforms.includes('feishu')) {
    if (!config.feishuAppId || !config.feishuAppSecret) {
      log.warn('Feishu is in enabledPlatforms but FEISHU_APP_ID / FEISHU_APP_SECRET not configured. Skipping Feishu.');
    } else {
      feishuHandle = createEventDispatcher(config, sessionManager);
      await initFeishu(config, feishuHandle.dispatcher);
      registerFeishuMessageHandler(feishuHandle.dispatcher, enqueueMessage);
      routingTable.feishu = getFeishuClient();
      log.info('Feishu initialized (Bridge + MCP)');
    }
  }

  // Initialize Telegram with Bridge event handlers
  if (config.enabledPlatforms.includes('telegram')) {
    if (!config.telegramBotToken) {
      log.warn('Telegram is in enabledPlatforms but TELEGRAM_BOT_TOKEN not configured. Skipping Telegram.');
    } else {
      await initTelegram(config, (bot) => {
        setupTelegramHandlers(bot, config, sessionManager);
      });
      telegramBot = getTelegramBot();
      registerTelegramMessageHandler(telegramBot, enqueueMessage);
      routingTable.telegram = telegramBot;
      log.info('Telegram initialized (Bridge + MCP)');
    }
  }

  if (Object.keys(routingTable).length === 0) {
    log.error('No platforms were successfully initialized. Check your configuration.');
    process.exit(1);
  }

  log.info(`Enabled platforms: ${Object.keys(routingTable).join(', ')}`);

  // Create MCP tools
  const { tools, handlers } = createMcpBridgeTools(routingTable);

  // Start MCP server on stdio
  log.info('Starting MCP server on stdio...');
  const server = new McpServer(
    { name: 'cc-im', version: APP_VERSION },
    { capabilities: { tools: {} } }
  );

  // Register tools
  for (const tool of tools) {
    server.registerTool(tool.name, tool as any, async (args: any) => {
      const handler = (handlers as any)[tool.name];
      if (handler) {
        return await handler(args);
      }
      return { content: [{ type: 'text', text: `Unknown tool: ${tool.name}` }], isError: true };
    });
  }

  // Connect MCP to stdio - this takes over stdin/stdout
  const transport = new StdioServerTransport();
  await server.connect(transport as any);
  log.info('MCP server running on stdio');

  // Keep process alive (MCP takes over)
  process.on('SIGINT', async () => {
    log.info('Shutting down...');
    wecomHandle?.stop();
    stopWecom();
    feishuHandle?.stop();
    stopFeishu();
    stopTelegram();
    stopCardKitCleanup();
    permissionServer?.close();
    sessionManager.destroy();
    flushActiveChats();
    closeLogger();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    log.info('Shutting down...');
    wecomHandle?.stop();
    stopWecom();
    feishuHandle?.stop();
    stopFeishu();
    stopTelegram();
    stopCardKitCleanup();
    permissionServer?.close();
    sessionManager.destroy();
    flushActiveChats();
    closeLogger();
    process.exit(0);
  });
}

/**
 * Original Bridge mode (full AI + commands)
 * Logs output to file instead of taking over stdio
 */
export async function main() {
  const config = loadConfig();
  initLogger(config.logDir, config.logLevel);
  loadActiveChats();
  log.info('Starting cc-im bridge service...');
  log.info(`Enabled platforms: ${config.enabledPlatforms.join(', ')}`);
  log.info(`Allowed users: ${config.allowedUserIds.length === 0 ? 'ALL (dev mode)' : config.allowedUserIds.length + ' users configured'}`);
  log.info(`Claude CLI: ${config.claudeCliPath}`);
  log.info(`Default work directory: ${config.claudeWorkDir}`);
  log.info(`Skip permissions: ${config.claudeSkipPermissions}`);
  log.info(`Timeout: ${config.claudeTimeoutMs}ms`);

  let permissionServer: { port: number; close: () => Promise<void> } | null = null;
  if (!config.claudeSkipPermissions) {
    ensureHookConfigured();
    permissionServer = await startPermissionServer(config.hookPort);
    log.info(`Permission hook server started on port ${permissionServer.port}`);
  }

  const sessionManager = new SessionManager(config.claudeWorkDir, config.allowedBaseDirs);

  const activeBots: string[] = [];
  const initTasks: Promise<{ platform: string; success: boolean }>[] = [];

  let feishuHandle: FeishuEventHandlerHandle | null = null;
  let telegramHandle: TelegramEventHandlerHandle | null = null;
  let wecomHandle: WecomEventHandlerHandle | null = null;

  if (config.enabledPlatforms.includes('telegram')) {
    initTasks.push(
      initTelegram(config, (bot) => {
        telegramHandle = setupTelegramHandlers(bot, config, sessionManager);
      })
        .then(() => ({ platform: 'Telegram', success: true }))
        .catch((err) => {
          log.error('Failed to initialize Telegram bot:', err);
          return { platform: 'Telegram', success: false };
        })
    );
  }

  if (config.enabledPlatforms.includes('feishu')) {
    initTasks.push(
      Promise.resolve().then(async () => {
        feishuHandle = createEventDispatcher(config, sessionManager);
        await initFeishu(config, feishuHandle.dispatcher);
        return { platform: 'Feishu', success: true };
      }).catch((err) => {
        log.error('Failed to initialize Feishu bot:', err);
        return { platform: 'Feishu', success: false };
      })
    );
  }

  if (config.enabledPlatforms.includes('wecom')) {
    initTasks.push(
      initWecom(config, (wsClient) => {
        wecomHandle = setupWecomHandlers(wsClient, config, sessionManager);
        return wecomHandle;
      })
        .then(() => ({ platform: 'WeCom', success: true }))
        .catch((err) => {
          log.error('Failed to initialize WeCom bot:', err);
          return { platform: 'WeCom', success: false };
        })
    );
  }

  const results = await Promise.all(initTasks);
  for (const result of results) {
    if (result.success) activeBots.push(result.platform);
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
  sendLifecycleNotification(activeBots, startupMsg).catch(() => {});
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
    await sendLifecycleNotification(activeBots, `🔴 cc-im 服务正在关闭...\n运行时长: ${h > 0 ? `${h}h${m}m` : `${m}m`}`).catch(() => {});

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

// Run directly
const isDirectRun = process.argv[1]?.endsWith('/index.js') || process.argv[1]?.endsWith('/index.ts');
if (isDirectRun) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    closeLogger();
    process.exit(1);
  });
}

export { startUnifiedMode };
