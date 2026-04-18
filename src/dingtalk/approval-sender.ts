import type { ApprovalRequest } from '../access/types.js';
import type { ApprovalSender } from '../access/approval-sender.js';
import { createLogger } from '../logger.js';
import type { DingtalkTokenManager } from './access-token.js';
import { t, type Language } from '../i18n.js';
import { loadConfig } from '../config.js';

const log = createLogger('DingTalkApprovalSender');

// Lazy-load config to avoid circular dependency
let _config: ReturnType<typeof loadConfig> | null = null;
function getLang(): Language {
  if (!_config) _config = loadConfig();
  return _config.language;
}

function isInvalidTokenErrcode(code: number | undefined): boolean {
  return code === 40014 || code === 42001 || code === 40001;
}

/**
 * 钉钉审批通知发送器
 */
export class DingtalkApprovalSender implements ApprovalSender {
  constructor(
    private readonly tokens: DingtalkTokenManager,
    private readonly agentId: string,
  ) {}

  async sendApprovalRequest(adminId: string, approval: ApprovalRequest): Promise<void> {
    const locale = t(getLang());
    const text = [
      `${locale.approvalRequestTitle}`,
      ``,
      `${locale.approvalRequestApplicant}: ${approval.requesterId}`,
      `${locale.approvalRequestCommand}: ${approval.command}${approval.args ? ' ' + approval.args : ''}`,
      `${locale.approvalRequestSource}: ${approval.requesterChatId}`,
      ``,
      `${locale.approvalRequestAdminCommand}:`,
      `/approve ${approval.id} - ${locale.allowButton}`,
      `/reject ${approval.id} - ${locale.denyButton}`,
    ].join('\n');

    try {
      await this.sendMessage(adminId, 'markdown', { title: '审批请求', text });
      log.debug(`Approval request sent to admin ${adminId}: ${approval.id}`);
    } catch (err) {
      log.error(`Failed to send approval request to admin ${adminId}:`, err);
      throw err;
    }
  }

  async sendApprovalResult(approval: ApprovalRequest, decision: 'approved' | 'denied' | 'expired'): Promise<void> {
    const locale = t(getLang());
    const content = locale.approvalResult(approval.command, decision);

    try {
      await this.sendMessage(approval.requesterId, 'text', { content });
      log.debug(`Approval result sent to requester ${approval.requesterId}: ${approval.id} -> ${decision}`);
    } catch (err) {
      log.error(`Failed to send approval result to requester ${approval.requesterId}:`, err);
      throw err;
    }
  }

  private async sendMessage(userId: string, msgtype: string, msgcontent: object, allowRetry = true): Promise<void> {
    const token = await this.tokens.getToken();
    const url = 'https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=' + encodeURIComponent(token);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: this.agentId,
        userid_list: userId,
        msgtype,
        [msgtype]: msgcontent,
      }),
    });
    const result = await response.json() as { errcode?: number; errmsg?: string };
    if (result.errcode !== 0) {
      if (allowRetry && isInvalidTokenErrcode(result.errcode)) {
        log.warn(`DingTalk API token invalid (${result.errcode}), refreshing and retrying once`);
        this.tokens.invalidate();
        await this.sendMessage(userId, msgtype, msgcontent, false);
        return;
      }
      throw new Error(`Failed to send DingTalk message: ${result.errmsg}`);
    }
  }
}
