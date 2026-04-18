/**
 * MCP Tools for Synapse - Multi-platform AI bridge
 * Provides send_message, get_active_chats, get_chat_info, get_incoming_messages
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WSClient } from '@wecom/aibot-node-sdk';
import { router, type ChatInfo, type Message } from './router.js';
import { createLogger } from '../logger.js';
import { z } from 'zod';

const log = createLogger('McpTools');

// Message queue for incoming messages (poll-based approach)
const messageQueue: Message[] = [];
const MAX_QUEUE_SIZE = 100;

/**
 * Enqueue a message for polling
 */
export function enqueueMessage(message: Message): void {
  messageQueue.unshift(message);
  if (messageQueue.length > MAX_QUEUE_SIZE) {
    messageQueue.pop();
  }
}

/**
 * Get the global router instance
 */
export function getRouter() {
  return router;
}

// Schema definitions
const SendMessageSchema = z.object({
  chatId: z.string().describe('The chat ID to send the message to'),
  content: z.string().describe('The message content to send (supports markdown, @mentions)'),
});

const GetChatInfoSchema = z.object({
  chatId: z.string().describe('The chat ID to get information about'),
});

const GetIncomingMessagesSchema = z.object({
  limit: z.number().optional().default(10).describe('Maximum number of messages to return'),
});

/**
 * Create and register MCP tools
 */
export function registerMcpTools(server: McpServer, wsClient: WSClient) {
  // send_message tool
  server.registerTool(
    'send_message',
    {
      description: 'Send a text message to a WeCom chat (group or user)',
      inputSchema: SendMessageSchema,
    },
    async ({ chatId, content }: { chatId: string; content: string }) => {
      try {
        await wsClient.sendMessage(chatId, {
          msgtype: 'markdown',
          markdown: { content },
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: `Message sent to ${chatId}: ${content.slice(0, 50)}${content.length > 50 ? '...' : ''}`,
            },
          ],
        };
      } catch (err) {
        log.error('Failed to send message:', err);
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
    }
  );

  // get_active_chats tool
  server.registerTool(
    'get_active_chats',
    {
      description: 'Get list of recently active WeCom chats',
      inputSchema: z.object({}),
    },
    async () => {
      const chats = router.getRecentChats(20);
      const text =
        chats.length === 0
          ? 'No active chats'
          : chats.map((c: ChatInfo) => `- ${c.isGroup ? '[Group]' : '[User]'} ${c.chatId} (${new Date(c.lastMessageTime).toLocaleString()})`).join('\n');
      return {
        content: [{ type: 'text' as const, text }],
      };
    }
  );

  // get_chat_info tool
  server.registerTool(
    'get_chat_info',
    {
      description: 'Get information about a specific WeCom chat',
      inputSchema: GetChatInfoSchema,
    },
    async ({ chatId }: { chatId: string }) => {
      const info = router.getChatInfo(chatId);
      if (!info) {
        return {
          content: [{ type: 'text' as const, text: `Chat ${chatId} not found in recent history` }],
        };
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: `Chat: ${info.chatId}\nType: ${info.isGroup ? 'Group' : 'User'}\nLast active: ${new Date(info.lastMessageTime).toLocaleString()}`,
          },
        ],
      };
    }
  );

  // get_incoming_messages tool
  server.registerTool(
    'get_incoming_messages',
    {
      description: 'Get recent messages received from WeCom (polling mechanism)',
      inputSchema: GetIncomingMessagesSchema,
    },
    async ({ limit }: { limit?: number } = {}) => {
      const msgLimit = limit ?? 10;
      const messages = messageQueue.splice(0, Math.min(msgLimit, MAX_QUEUE_SIZE));
      if (messages.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No new messages' }],
        };
      }
      const text = messages
        .map((m: Message) => {
          const chatType = m.isGroup ? '[Group]' : '[User]';
          return `${chatType} ${m.chatId} from ${m.userId}:\n  ${m.text}\n  (${new Date(m.timestamp).toLocaleString()})`;
        })
        .join('\n\n');
      return {
        content: [{ type: 'text' as const, text }],
      };
    }
  );
}
