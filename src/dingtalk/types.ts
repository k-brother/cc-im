/**
 * 钉钉消息类型定义
 */

// 钉钉消息类型
export type DingTalkMsgType = 'text' | 'markdown' | 'actionCard' | 'oa';

export interface DingTalkTextMessage {
  msgtype: 'text';
  text: { content: string };
}

export interface DingTalkMarkdownMessage {
  msgtype: 'markdown';
  markdown: { title: string; text: string };
}

export interface DingTalkActionCard {
  msgtype: 'actionCard';
  actionCard: {
    title: string;
    text: string;
    btnOrientation?: '0' | '1';
    singleTitle?: string;
    singleURL?: string;
  };
}

export interface DingTalkOAMessage {
  msgtype: 'oa';
  oa: {
    head?: { bgcolor?: string; text?: { content?: string } };
    body?: { content?: string };
  };
}

export type DingTalkMessage = DingTalkTextMessage | DingTalkMarkdownMessage | DingTalkActionCard;

// 钉钉 Stream 事件类型
export interface DingTalkEventHeader {
  eventType: string;
  eventId: string;
  createAt: string;
  token: string;
  appKey: string;
  corpId?: string;
}

export interface DingTalkEventBody {
  header: DingTalkEventHeader;
  events?: Array<{
    conversationId: string;
    chatbotCorpId?: string;
    chatbotUserId?: string;
    userId?: string;
    senderNick?: string;
    isAdmin?: boolean;
    sessionWebhook?: string;
    sessionWebhookExpireAt?: number;
    createAt: number;
    senderStaffId?: string;
    content?: string;
    msgtype?: string;
  }>;
}

export interface DingTalkMessageContent {
  content: string;
}

// 钉钉卡片回调
export interface DingTalkCardAction {
  btnJson?: string;
  choiceIndexes?: string;
}
