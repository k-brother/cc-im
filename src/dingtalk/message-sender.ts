import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { createLogger } from '../logger.js';
import type { ThreadContext } from '../shared/types.js';
import type { DingtalkTokenManager } from './access-token.js';
import { t, type Language } from '../i18n.js';

const log = createLogger('DingTalkSender');

// Read language directly from env to avoid loading full config (which validates Claude CLI)
function getLang(): Language {
  const lang = process.env.SYNAPSE_LANGUAGE?.toLowerCase();
  return (lang === 'en' ? 'en' : 'zh') as Language;
}

/** 不合法的 access_token / token 过期等，刷新后重试一次 */
function isInvalidTokenErrcode(code: number | undefined): boolean {
  return code === 40014 || code === 42001 || code === 40001;
}

export class DingtalkMessageSender {
  constructor(
    private readonly tokens: DingtalkTokenManager,
    private readonly agentId: string,
  ) {}

  /**
   * 发送文本回复
   */
  async sendTextReply(chatId: string, text: string, _threadCtx?: ThreadContext): Promise<void> {
    try {
      await this.sendMessage(chatId, 'text', { content: text });
    } catch (err) {
      log.error(`Failed to send text reply to ${chatId}:`, err);
      throw err;
    }
  }

  /**
   * 发送 Markdown 消息 (DingTalk order: chatId, title, text)
   */
  async sendMarkdown(chatId: string, title: string, text: string): Promise<void> {
    try {
      await this.sendMessage(chatId, 'markdown', { title, text });
    } catch (err) {
      log.error(`Failed to send markdown to ${chatId}:`, err);
      throw err;
    }
  }

  /**
   * 发送图片消息（先上传 media，再发工作通知 image）
   */
  async sendImageReply(chatId: string, imagePath: string): Promise<void> {
    try {
      const buf = await readFile(imagePath);
      if (buf.length > 1024 * 1024) {
        await this.sendTextReply(chatId, `图片超过 1MB 上限，已保存路径：${imagePath}`);
        return;
      }
      const filename = basename(imagePath);
      const doUpload = async (token: string) => {
        const formData = new FormData();
        formData.append('type', 'image');
        formData.append('media', new Blob([buf]), filename);
        const uploadUrl = `https://oapi.dingtalk.com/media/upload?access_token=${encodeURIComponent(token)}`;
        const uploadRes = await fetch(uploadUrl, { method: 'POST', body: formData });
        return uploadRes.json() as Promise<{ errcode?: number; errmsg?: string; media_id?: string }>;
      };
      let token = await this.tokens.getToken();
      let uploadJson = await doUpload(token);
      if (isInvalidTokenErrcode(uploadJson.errcode)) {
        this.tokens.invalidate();
        token = await this.tokens.getToken();
        uploadJson = await doUpload(token);
      }
      if (uploadJson.errcode !== 0 || !uploadJson.media_id) {
        throw new Error(uploadJson.errmsg ?? 'media upload failed');
      }
      await this.sendMessage(chatId, 'image', { media_id: uploadJson.media_id });
    } catch (err) {
      log.error(`Failed to send image reply to ${chatId}:`, err);
      try {
        await this.sendTextReply(chatId, `[图片发送失败，路径：${imagePath}]`);
      } catch {
        /* ignore */
      }
      throw err;
    }
  }

  /**
   * 发送权限确认卡片
   */
  async sendPermissionCard(
    chatId: string,
    requestId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
  ): Promise<string> {
    const locale = t(getLang());
    const text = `${locale.permissionCardTitle}#${requestId}\n\n工具: ${toolName}\n参数: ${JSON.stringify(toolInput).slice(0, 100)}...\n\n请回复 /allow 或 /deny`;
    try {
      await this.sendTextReply(chatId, text);
      return requestId;
    } catch (err) {
      log.error(`Failed to send permission card to ${chatId}:`, err);
      return '';
    }
  }

  /**
   * 更新权限卡片 (DingTalk 使用文本消息替代)
   */
  async updatePermissionCard(params: { messageId: string; chatId: string; toolName: string; decision: 'allow' | 'deny' }): Promise<void> {
    const locale = t(getLang());
    const { chatId, toolName, decision } = params;
    const isAllowed = decision === 'allow';
    try {
      await this.sendTextReply(chatId, `${isAllowed ? locale.permissionAllowedText : locale.permissionDeniedText}: ${toolName}`);
    } catch (err) {
      log.error(`Failed to update permission card in ${chatId}:`, err);
    }
  }

  /**
   * 发送停止按钮卡片
   */
  async sendStopCard(chatId: string, taskKey: string): Promise<string> {
    const locale = t(getLang());
    try {
      await this.sendMessage(chatId, 'actionCard', {
        title: locale.cardStatusProcessing,
        text: locale.taskInProgress,
        btnOrientation: '0',
        singleTitle: locale.stopButton,
        singleURL: `dingtalk://card/callback?action=stop&taskKey=${encodeURIComponent(taskKey)}`,
      });
      return taskKey;
    } catch (err) {
      log.error(`Failed to send stop card to ${chatId}:`, err);
      return '';
    }
  }

  /**
   * 更新停止卡片为已停止状态
   */
  async updateStopCard(chatId: string, taskKey: string): Promise<void> {
    const locale = t(getLang());
    try {
      await this.sendMessage(chatId, 'actionCard', {
        title: locale.cardStatusDone,
        text: locale.taskStoppedByUser,
        btnOrientation: '0',
        singleTitle: locale.stopButton,
        singleURL: 'dingtalk://card/callback?action=stopped',
      });
    } catch (err) {
      log.error(`Failed to update stop card in ${chatId}:`, err);
    }
  }

  /**
   * 发送消息到指定会话
   */
  private async sendMessage(chatId: string, msgtype: string, msgcontent: Record<string, unknown>, allowRetry = true): Promise<void> {
    const token = await this.tokens.getToken();
    const url = 'https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=' + encodeURIComponent(token);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: this.agentId,
        userid_list: chatId,
        msgtype,
        [msgtype]: msgcontent,
      }),
    });
    const result = await response.json() as { errcode?: number; errmsg?: string };
    if (result.errcode !== 0) {
      if (allowRetry && isInvalidTokenErrcode(result.errcode)) {
        log.warn(`DingTalk API token invalid (${result.errcode}), refreshing and retrying once`);
        this.tokens.invalidate();
        await this.sendMessage(chatId, msgtype, msgcontent, false);
        return;
      }
      throw new Error(`Failed to send DingTalk message: ${result.errmsg}`);
    }
    log.debug(`Message sent to ${chatId}: ${msgtype}`);
  }
}
