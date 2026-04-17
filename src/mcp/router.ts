/**
 * MCP Message Router
 * Shared message queue for both Bridge AI processing and MCP tools
 */

export interface ChatInfo {
  platform: string;
  chatId: string;
  userId: string;
  isGroup: boolean;
  lastMessageTime: number;
}

export interface Message {
  platform: string;
  msgId: string;
  chatId: string;
  userId: string;
  text: string;
  isGroup: boolean;
  timestamp: number;
}

export class MessageRouter {
  private chats = new Map<string, ChatInfo>();
  private messages: Message[] = [];
  private readonly MAX_MESSAGES = 100;

  registerMessage(message: Message): void {
    const chatKey = `${message.platform}:${message.chatId}`;
    // Update chat info
    this.chats.set(chatKey, {
      platform: message.platform,
      chatId: message.chatId,
      userId: message.userId,
      isGroup: message.isGroup,
      lastMessageTime: message.timestamp,
    });

    // Add to message queue
    this.messages.unshift(message);
    if (this.messages.length > this.MAX_MESSAGES) {
      this.messages.pop();
    }
  }

  getChatInfo(chatId: string, platform?: string): ChatInfo | undefined {
    if (platform) return this.chats.get(`${platform}:${chatId}`);
    // Fallback: search across platforms (legacy compatibility)
    for (const [key, info] of this.chats) {
      if (info.chatId === chatId) return info;
    }
    return undefined;
  }

  getActiveChats(platform?: string): ChatInfo[] {
    let chats = Array.from(this.chats.values());
    if (platform) chats = chats.filter(c => c.platform === platform);
    return chats.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
  }

  getRecentChats(limit = 10, platform?: string): ChatInfo[] {
    return this.getActiveChats(platform).slice(0, limit);
  }

  getRecentMessages(limit = 20, platform?: string): Message[] {
    const msgs = platform ? this.messages.filter(m => m.platform === platform) : this.messages;
    return msgs.slice(0, limit);
  }

  getMessagesForChat(chatId: string, limit = 20, platform?: string): Message[] {
    const filtered = platform
      ? this.messages.filter(m => m.chatId === chatId && m.platform === platform)
      : this.messages.filter(m => m.chatId === chatId);
    return filtered.slice(0, limit);
  }
}

// Global router instance - shared between Bridge and MCP
export const router = new MessageRouter();
