/**
 * Unified Bridge + MCP Server
 * Runs Bridge (AI + commands) and MCP server in the same process
 */

import type { WSClient } from '@wecom/aibot-node-sdk';
import type { Client as LarkClient } from '@larksuiteoapi/node-sdk';
import type { Telegraf } from 'telegraf';
import type { EventDispatcher } from '@larksuiteoapi/node-sdk';
import type { Message } from './router.js';
import { createLogger } from '../logger.js';
import { router } from './router.js';
import { z } from 'zod';

const log = createLogger('McpBridge');

// Message queue for incoming messages (poll-based approach)
const messageQueue: Message[] = [];
const MAX_QUEUE_SIZE = 100;

export function enqueueMessage(message: Message): void {
  messageQueue.unshift(message);
  if (messageQueue.length > MAX_QUEUE_SIZE) {
    messageQueue.pop();
  }
}

export type Platform = 'wecom' | 'feishu' | 'telegram';

/**
 * Routing table for multi-platform MCP tools
 */
export interface McpRoutingTable {
  wecom?: WSClient;
  feishu?: LarkClient;
  telegram?: Telegraf;
}

/**
 * Create MCP tools that support multiple platforms
 */
export function createMcpBridgeTools(table: McpRoutingTable) {
  const SendMessageSchema = z.object({
    platform: z.enum(['wecom', 'feishu', 'telegram']).describe('Target platform'),
    chatId: z.string().describe('The chat ID to send the message to'),
    content: z.string().describe('The message content (supports markdown where supported)'),
  });

  const GetIncomingMessagesSchema = z.object({
    platform: z.enum(['wecom', 'feishu', 'telegram']).optional().describe('Filter by platform'),
    limit: z.number().optional().default(10).describe('Maximum number of messages to return'),
  });

  const GetChatInfoSchema = z.object({
    platform: z.enum(['wecom', 'feishu', 'telegram']).describe('Platform of the chat'),
    chatId: z.string().describe('The chat ID to get information about'),
  });

  const GetActiveChatsSchema = z.object({
    platform: z.enum(['wecom', 'feishu', 'telegram']).optional().describe('Filter by platform'),
  });

  const sendMessageTool = {
    name: 'send_message' as const,
    description: 'Send a text message to a chat on the specified platform. Use this to proactively send messages to groups or users from CLI.',
    inputSchema: SendMessageSchema,
  };

  const getIncomingMessagesTool = {
    name: 'get_incoming_messages' as const,
    description: 'Get recent messages received from the bot (group @mention or private chat)',
    inputSchema: GetIncomingMessagesSchema,
  };

  const getActiveChatsTool = {
    name: 'get_active_chats' as const,
    description: 'Get list of recently active chats',
    inputSchema: GetActiveChatsSchema,
  };

  const getChatInfoTool = {
    name: 'get_chat_info' as const,
    description: 'Get information about a specific chat',
    inputSchema: GetChatInfoSchema,
  };

  return {
    tools: [sendMessageTool, getIncomingMessagesTool, getActiveChatsTool, getChatInfoTool],
    handlers: {
      send_message: async (args: { platform: Platform; chatId: string; content: string }) => {
        const { platform, chatId, content } = args;
        log.debug(`[MCP] send_message called: platform=${platform}, chatId=${chatId}`);
        try {
          if (platform === 'wecom') {
            if (!table.wecom) throw new Error('WeCom not initialized');
            await table.wecom.sendMessage(chatId, {
              msgtype: 'markdown',
              markdown: { content },
            });
          } else if (platform === 'feishu') {
            if (!table.feishu) throw new Error('Feishu not initialized');
            await table.feishu.im.v1.message.create({
              params: { receive_id_type: 'chat_id' },
              data: {
                receive_id: chatId,
                content: JSON.stringify({ text: content }),
                msg_type: 'text',
              },
            });
          } else if (platform === 'telegram') {
            if (!table.telegram) throw new Error('Telegram not initialized');
            await table.telegram.telegram.sendMessage(chatId, content);
          }
          return {
            content: [
              {
                type: 'text' as const,
                text: `Message sent to ${platform}:${chatId}: ${content.slice(0, 50)}${content.length > 50 ? '...' : ''}`,
              },
            ],
          };
        } catch (err) {
          log.error(`[MCP] send_message failed (${platform}):`, err);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to send message: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            isError: true,
          };
        }
      },

      get_incoming_messages: async (args: { platform?: Platform; limit?: number }) => {
        const { platform, limit = 10 } = args;
        const messages = messageQueue
          .filter(m => !platform || m.platform === platform)
          .slice(0, limit);
        if (messages.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No new messages' }] };
        }
        const text = messages
          .map((m) => {
            const chatType = m.isGroup ? '[Group]' : '[User]';
            return `[${m.platform}] ${chatType} ${m.chatId} from ${m.userId}:\n  ${m.text}\n  (${new Date(m.timestamp).toLocaleString()})`;
          })
          .join('\n\n');
        return { content: [{ type: 'text' as const, text }] };
      },

      get_active_chats: async (args: { platform?: Platform }) => {
        const { platform } = args ?? {};
        const chats = router.getRecentChats(20, platform);
        if (chats.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No active chats' }] };
        }
        const text = chats
          .map((c) => `[${c.platform}] ${c.isGroup ? '[Group]' : '[User]'} ${c.chatId} (${new Date(c.lastMessageTime).toLocaleString()})`)
          .join('\n');
        return { content: [{ type: 'text' as const, text }] };
      },

      get_chat_info: async (args: { platform: Platform; chatId: string }) => {
        const info = router.getChatInfo(args.chatId, args.platform);
        if (!info) {
          return { content: [{ type: 'text' as const, text: `Chat ${args.platform}:${args.chatId} not found in recent history` }] };
        }
        return {
          content: [
            {
              type: 'text' as const,
              text: `Platform: ${info.platform}\nChat: ${info.chatId}\nType: ${info.isGroup ? 'Group' : 'User'}\nLast active: ${new Date(info.lastMessageTime).toLocaleString()}`,
            },
          ],
        };
      },
    },
  };
}

/**
 * Register WeCom message handler to feed MCP queue and router
 */
export function registerWecomMessageHandler(wsClient: WSClient) {
  const handleMessage = (body: Record<string, unknown>, isGroup: boolean, msgId: string, textContent: string, userId: string, chatId: string) => {
    const message: Message = {
      platform: 'wecom',
      msgId,
      chatId,
      userId,
      text: textContent,
      isGroup,
      timestamp: Date.now(),
    };
    router.registerMessage(message);
    enqueueMessage(message);
    log.debug(`[WeCom] Queued message from ${userId} in ${chatId}: ${textContent.slice(0, 50)}...`);
  };

  wsClient.on('message.text', (frame) => {
    if (!frame.body) return;
    const body = frame.body as Record<string, unknown>;
    const from = body.from as Record<string, unknown> | undefined;
    const userId = from?.userid as string ?? '';
    const isGroup = body.chattype === 'group';
    const chatId = isGroup ? ((body.chatid as string) ?? userId) : userId;
    const textBody = body.text as Record<string, unknown> | undefined;
    const textContent = (textBody?.content as string) ?? '';
    const msgId = (body.msgid as string) ?? '';
    if (!textContent) return;
    handleMessage(body, isGroup, msgId, textContent, userId, chatId);
  });

  wsClient.on('message.voice', (frame) => {
    if (!frame.body) return;
    const body = frame.body as Record<string, unknown>;
    const from = body.from as Record<string, unknown> | undefined;
    const userId = from?.userid as string ?? '';
    const isGroup = body.chattype === 'group';
    const chatId = isGroup ? ((body.chatid as string) ?? userId) : userId;
    const voiceBody = body.voice as Record<string, unknown> | undefined;
    const textContent = (voiceBody?.content as string) ?? '';
    const msgId = (body.msgid as string) ?? '';
    if (!textContent) return;
    handleMessage(body, isGroup, msgId, textContent, userId, chatId);
  });

  wsClient.on('message.image', (frame) => {
    if (!frame.body) return;
    const body = frame.body as Record<string, unknown>;
    const from = body.from as Record<string, unknown> | undefined;
    const userId = from?.userid as string ?? '';
    const isGroup = body.chattype === 'group';
    const chatId = isGroup ? ((body.chatid as string) ?? userId) : userId;
    const imageBody = body.image as Record<string, unknown> | undefined;
    const imageUrl = (imageBody?.url as string) ?? '';
    const msgId = (body.msgid as string) ?? '';
    if (!imageUrl) return;
    handleMessage(body, isGroup, msgId, `[用户发送了图片: ${imageUrl}]`, userId, chatId);
  });
}

/**
 * Register Feishu message handler to feed MCP queue and router
 */
export function registerFeishuMessageHandler(
  dispatcher: EventDispatcher,
  enqueue: (msg: Message) => void
) {
  dispatcher.register({
    'im.message.receive_v1': async (data: Record<string, unknown>) => {
      try {
        const header = data.header as Record<string, unknown> | undefined;
        const eventType = header?.event_type as string | undefined;
        if (eventType !== 'im.message.receive_v1') return;

        const message = data.message as Record<string, unknown> | undefined;
        if (!message) return;

        const msgId = (message.message_id as string) ?? '';
        const chatId = (message.chat_id as string) ?? '';
        const sender = message.sender as Record<string, unknown> | undefined;
        const senderId = sender?.id as Record<string, unknown> | undefined;
        const userId = (senderId?.open_id as string) ?? '';
        const msgType = (message.message_type as string) ?? '';
        const content = (message.content as string) ?? '';

        let textContent = '';
        let isGroup = false;

        if (msgType === 'text') {
          try {
            textContent = (JSON.parse(content) as { text?: string })?.text ?? '';
          } catch { /* ignore */ }
        } else if (msgType === 'post') {
          try {
            const parsed = JSON.parse(content) as { zh_cn?: { title?: string; content?: Array<Array<{ tag: string; text?: string }>> } };
            const title = parsed?.zh_cn?.title ?? '';
            const textParts: string[] = [];
            for (const para of (parsed?.zh_cn?.content ?? [])) {
              for (const element of para) {
                if (element.tag === 'text' && element.text) textParts.push(element.text);
              }
            }
            textContent = title ? `${title}\n${textParts.join('')}` : textParts.join('');
          } catch { /* ignore */ }
        } else if (msgType === 'image') {
          try {
            const parsed = JSON.parse(content) as { image_key: string };
            textContent = `[用户发送了图片: ${parsed.image_key}]`;
          } catch { /* ignore */ }
        }

        // Determine if group: Feishu group chats have chat_type === 'group'
        const chatType = (message.chat_type as string) ?? '';
        isGroup = chatType === 'group';

        if (!textContent) return;

        const msg: Message = {
          platform: 'feishu',
          msgId,
          chatId,
          userId,
          text: textContent,
          isGroup,
          timestamp: Date.now(),
        };
        router.registerMessage(msg);
        enqueue(msg);
        log.debug(`[Feishu] Queued message from ${userId} in ${chatId}: ${textContent.slice(0, 50)}...`);
      } catch (err) {
        log.warn('[Feishu] Failed to handle message:', err);
      }
    },
  });
}

/**
 * Register Telegram message handler to feed MCP queue and router
 */
export function registerTelegramMessageHandler(
  bot: Telegraf,
  enqueue: (msg: Message) => void
) {
  bot.on('message', (ctx, next) => {
    const msg = ctx.message;
    if (!msg) return next();

    const chatId = String(ctx.chat.id);
    const userId = String(msg.from?.id ?? '');
    const msgId = String(msg.message_id ?? '');

    let textContent = '';
    let isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';

    if ('text' in msg && typeof msg.text === 'string') {
      textContent = msg.text;
    } else if ('caption' in msg && typeof msg.caption === 'string') {
      textContent = msg.caption;
    } else if ('photo' in msg && msg.photo) {
      textContent = '[用户发送了图片]';
    } else if ('voice' in msg && msg.voice) {
      textContent = '[用户发送了语音消息]';
    } else if ('document' in msg && msg.document) {
      textContent = '[用户发送了文件]';
    } else {
      return next();
    }

    const message: Message = {
      platform: 'telegram',
      msgId,
      chatId,
      userId,
      text: textContent,
      isGroup,
      timestamp: Date.now(),
    };
    router.registerMessage(message);
    enqueue(message);
    log.debug(`[Telegram] Queued message from ${userId} in ${chatId}: ${textContent.slice(0, 50)}...`);

    return next();
  });
}
