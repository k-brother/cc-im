#!/usr/bin/env node
/**
 * Synapse — Multi-Platform AI Bridge
 *
 * Starts both Bridge (AI + commands) and MCP server in the same process.
 * - Bridge handles messages from Feishu/Telegram/WeCom/DingTalk
 * - MCP provides admin tools via stdio for proactive messaging
 *
 * Usage: synapse [options]
 *   (no args)    - Start Bridge + MCP (unified mode)
 *   -d, --daemon - Start Bridge as daemon
 *   stop         - Stop running service
 *   mcp          - Start MCP only mode (no Bridge AI)
 */

import { loadConfig, type Config } from './config.js';
import { initFeishu, stopFeishu } from './feishu/client.js';
import { initTelegram, stopTelegram } from './telegram/client.js';
import { createEventDispatcher as createFeishuDispatcher, type FeishuEventHandlerHandle } from './feishu/event-handler.js';
import { stopCleanupTimer as stopCardKitCleanup } from './feishu/cardkit-manager.js';
import { sendTextReply as feishuSendText } from './feishu/message-sender.js';
import { setupTelegramHandlers, type TelegramEventHandlerHandle } from './telegram/event-handler.js';
import { sendTextReply as telegramSendText } from './telegram/message-sender.js';
import { initWecom, stopWecom, getWSClient } from './wecom/client.js';
import { setupWecomHandlers } from './wecom/event-handler.js';
import type { WecomEventHandlerHandle } from './wecom/client.js';
import { sendTextReply as wecomSendText } from './wecom/message-sender.js';
import { initDingtalk, stopDingtalk, type DingtalkEventHandlerHandle } from './dingtalk/client.js';
import { createEventDispatcher as createDingtalkDispatcher } from './dingtalk/event-handler.js';
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
import {
  registerWecomMessageHandler,
  registerFeishuMessageHandler,
  registerTelegramMessageHandler,
  createMcpBridgeTools,
  enqueueMessage,
  type McpRoutingTable,
} from './mcp/server.js';
import { getClient as getFeishuClient } from './feishu/client.js';
import { getBot as getTelegramBot } from './telegram/client.js';
import * as Lark from '@larksuiteoapi/node-sdk';
import { t, type Language } from './i18n.js';

const require = createRequire(import.meta.url);
const { version: APP_VERSION } = require('../package.json');

const log = createLogger('Main');

// Lazy-load config to avoid circular dependency
let _config: ReturnType<typeof loadConfig> | null = null;
function getLang(): Language {
  if (!_config) _config = loadConfig();
  return _config.language;
}

function getClaudeVersion(cliPath: string): string {
  try { return execFileSync(cliPath, ['--version'], { timeout: 5000 }).toString().trim(); } catch { return t(getLang()).unknown; }
}

function getBotName(platform: 'feishu' | 'telegram' | 'wecom' | 'dingtalk', config: Config): string {
  const platformConfig = config.platforms[platform];
  // Platform-specific name takes precedence
  if (platformConfig?.botName) return platformConfig.botName;
  // Fall back to unified botName
  if (config.botName) return config.botName;
  // Default fallback
  return 'Synapse';
}

const GROUP_GREETING = (botName: string, config: Config) => {
  const lang = getLang();
  const custom = config.privileged?.startup?.customGreeting?.group?.[lang];
  if (custom) return custom;
  return t(lang).groupGreeting(botName);
};

const PLATFORM_LABEL: Record<string, string> = {
  WeCom: '企业微信',
  Feishu: '飞书',
  Telegram: 'Telegram',
  DingTalk: '钉钉',
};

function formatAllowedUsersLog(config: Config): string {
  if (!config.privileged) return 'ALL (dev mode)';
  const perPlatform = (['feishu', 'telegram', 'wecom', 'dingtalk'] as const).reduce(
    (n, p) => n + (config.privileged!.users[p]?.length ?? 0),
    0,
  );
  if (perPlatform === 0) return 'ALL (dev mode)';
  return 'per-platform allowlists';
}

const PRIVATE_GREETING = (botName: string, activeBots: string[], config: Config) => {
  const lang = getLang();
  const custom = config.privileged?.startup?.customGreeting?.private?.[lang];
  if (custom) return custom;

  const locale = t(lang);
  const platform = activeBots.map((b) => PLATFORM_LABEL[b] ?? b).join(' + ') || locale.noActiveSession;
  return locale.privateGreeting(
    botName,
    platform,
    config.claudeWorkDir,
    getClaudeVersion(config.claudeCliPath),
    config.claudeSkipPermissions,
  );
};

async function sendLifecycleNotification(
  activeBots: string[],
  config: Config,
  isShutdown = false,
  uptime?: { h: number; m: number },
  dingtalkCtx?: { tokenManager: import('./dingtalk/access-token.js').DingtalkTokenManager; agentId: string },
) {
  if (!config.privileged?.startup) {
    log.info(t(config.language).startupNotificationDisabled);
    return;
  }

  const tasks: Promise<void>[] = [];
  const startup = config.privileged.startup;

  for (const bot of activeBots) {
    const platform = bot.toLowerCase() as 'feishu' | 'telegram' | 'wecom' | 'dingtalk';
    const notifyConfig = startup[platform];
    if (!notifyConfig) continue;

    const botName = getBotName(platform, config);
    const sender =
      platform === 'feishu'
        ? feishuSendText
        : platform === 'wecom'
          ? wecomSendText
          : platform === 'telegram'
            ? telegramSendText
            : null;

    if (platform === 'dingtalk') {
      if (!dingtalkCtx) continue;
      const { DingtalkMessageSender } = await import('./dingtalk/message-sender.js');
      const dtSender = new DingtalkMessageSender(dingtalkCtx.tokenManager, dingtalkCtx.agentId);
      for (const chatId of notifyConfig.groups) {
        const message = isShutdown
          ? t(getLang()).shutdownGreeting(botName, uptime!.h > 0 ? `${uptime!.h}h${uptime!.m}m` : `${uptime!.m}m`)
          : GROUP_GREETING(botName, config);
        tasks.push(dtSender.sendTextReply(chatId, message).catch((err) => {
          log.debug(`Failed to send group notification to ${chatId}:`, err);
        }));
      }
      for (const chatId of notifyConfig.users) {
        const message = isShutdown
          ? t(getLang()).shutdownGreeting(botName, uptime!.h > 0 ? `${uptime!.h}h${uptime!.m}m` : `${uptime!.m}m`)
          : PRIVATE_GREETING(botName, activeBots, config);
        tasks.push(dtSender.sendTextReply(chatId, message).catch((err) => {
          log.debug(`Failed to send user notification to ${chatId}:`, err);
        }));
      }
      continue;
    }

    if (!sender) continue;

    // Send to groups
    for (const chatId of notifyConfig.groups) {
      const message = isShutdown
        ? t(getLang()).shutdownGreeting(botName, uptime!.h > 0 ? `${uptime!.h}h${uptime!.m}m` : `${uptime!.m}m`)
        : GROUP_GREETING(botName, config);
      tasks.push(sender(chatId, message).catch((err) => {
        log.debug(`Failed to send group notification to ${chatId}:`, err);
      }));
    }

    // Send to users (private chat)
    for (const chatId of notifyConfig.users) {
      const message = isShutdown
        ? t(getLang()).shutdownGreeting(botName, uptime!.h > 0 ? `${uptime!.h}h${uptime!.m}m` : `${uptime!.m}m`)
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
  log.info('Starting Synapse unified mode (Bridge + MCP)...');
  log.info(`Enabled platforms: ${config.enabledPlatforms.join(', ')}`);
  log.info(`Allowed users: ${formatAllowedUsersLog(config)}`);
  log.info(`Claude CLI: ${config.claudeCliPath}`);
  log.info(`Default work directory: ${config.claudeWorkDir}`);
  log.info(`Skip permissions: ${config.claudeSkipPermissions}`);
  log.info(`Timeout: ${config.claudeTimeoutMs}ms`);

  const sessionManager = new SessionManager(config.claudeWorkDir, config.allowedBaseDirs);

  // Mutable routing table - populated as platforms connect
  const routingTable: McpRoutingTable = {};

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
    { name: 'synapse', version: APP_VERSION },
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
    if (!config.platforms.telegram?.botToken) {
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
    if (!config.platforms.feishu?.appId || !config.platforms.feishu?.appSecret) {
      log.warn('Feishu is in enabledPlatforms but FEISHU_APP_ID / FEISHU_APP_SECRET not configured. Skipping.');
    } else {
      try {
        feishuHandle = createFeishuDispatcher(config, sessionManager);
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
    if (!config.platforms.wecom?.botId || !config.platforms.wecom?.botSecret) {
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

  let dingtalkHandle: DingtalkEventHandlerHandle | undefined;
  let dingtalkNotifyCtx:
    | { tokenManager: import('./dingtalk/access-token.js').DingtalkTokenManager; agentId: string }
    | undefined;
  if (config.enabledPlatforms.includes('dingtalk')) {
    if (!config.platforms.dingtalk?.appKey || !config.platforms.dingtalk?.appSecret || !config.platforms.dingtalk?.agentId) {
      log.warn('DingTalk is enabled but DINGTALK_APP_KEY / DINGTALK_APP_SECRET / DINGTALK_AGENT_ID not configured. Skipping.');
    } else {
      try {
        const dtResult = await initDingtalk(config, (client, tokenManager) => {
          dingtalkHandle = createDingtalkDispatcher(config, sessionManager, client, tokenManager);
          return dingtalkHandle;
        });
        const agentId = config.platforms.dingtalk.agentId;
        dingtalkNotifyCtx = { tokenManager: dtResult.tokenManager, agentId };
        routingTable.dingtalk = { tokenManager: dtResult.tokenManager, agentId };
        activeBots.push('DingTalk');
        log.info('DingTalk initialized (Bridge + MCP)');
      } catch (err) {
        log.error('Failed to initialize DingTalk bot:', err);
      }
    }
  }

  if (activeBots.length === 0) {
    log.error('No platforms were successfully initialized!');
    process.exit(1);
  }

  log.info(`Service is running with ${activeBots.join(' + ')}. Press Ctrl+C to stop.`);

  const startedAt = Date.now();
  const locale = t(getLang());
  const startupMsg = [
    `🟢 Synapse v${APP_VERSION} ${locale.serviceStarted}`,
    '',
    `${locale.platform}: ${activeBots.join(' + ')}`,
    `${locale.workingDir}: ${config.claudeWorkDir}`,
    `${locale.permissionConfirmation}: ${config.claudeSkipPermissions ? locale.permissionsSkipped : locale.permissionsEnabled}`,
    config.claudeModel ? `模型: ${config.claudeModel}` : '',
    `Claude CLI: ${getClaudeVersion(config.claudeCliPath)}`,
    `Node: ${process.version}`,
  ].filter(Boolean).join('\n');
  sendLifecycleNotification(activeBots, config, false, undefined, dingtalkNotifyCtx).catch(() => {});
  checkForUpdate(APP_VERSION).catch(() => {});

  const imageCleanupTimer = setInterval(() => {
    cleanOldImages()
      .then((n) => { if (n > 0) log.info(`Cleaned ${n} old image(s)`); })
      .catch((err) => { log.error('Image cleanup failed:', err); });
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
    await sendLifecycleNotification(activeBots, config, true, { h, m }, dingtalkNotifyCtx).catch(() => {});

    telegramHandle?.stop();
    if (config.enabledPlatforms.includes('telegram')) stopTelegram();
    feishuHandle?.stop();
    if (config.enabledPlatforms.includes('feishu')) stopFeishu();
    wecomHandle?.stop();
    if (config.enabledPlatforms.includes('wecom')) stopWecom();
    dingtalkHandle?.stop();
    if (config.enabledPlatforms.includes('dingtalk')) stopDingtalk();
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
