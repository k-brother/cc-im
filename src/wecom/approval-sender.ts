import type { WSClient } from './client.js';
import type { ApprovalRequest } from '../access/types.js';
import type { ApprovalSender } from '../access/approval-sender.js';
import { createLogger } from '../logger.js';
import { t, type Language } from '../i18n.js';

const log = createLogger('WecomApprovalSender');

// Read language directly from env to avoid loading full config (which validates Claude CLI)
function getLang(): Language {
  const lang = process.env.SYNAPSE_LANGUAGE?.toLowerCase();
  return (lang === 'en' ? 'en' : 'zh') as Language;
}

/**
 * 企业微信审批通知发送器
 */
export class WecomApprovalSender implements ApprovalSender {
  constructor(private wsClient: WSClient) {}

  async sendApprovalRequest(adminId: string, approval: ApprovalRequest): Promise<void> {
    const locale = t(getLang());
    const text = [
      `${locale.approvalRequestTitle}`,
      ``,
      `${locale.approvalRequestApplicant}: ${approval.requesterId}`,
      `${locale.approvalRequestCommand}: \`${approval.command}${approval.args ? ' ' + approval.args : ''}\``,
      `${locale.approvalRequestSource}: ${approval.requesterChatId}`,
      ``,
      `${locale.approvalRequestAdminCommand}:`,
      `/approve ${approval.id} - ${locale.allowButton}`,
      `/reject ${approval.id} - ${locale.denyButton}`,
    ].join('\n');

    try {
      await this.wsClient.sendMessage(adminId, {
        msgtype: 'markdown',
        markdown: { content: text },
      });
      log.debug(`Approval request sent to admin ${adminId}: ${approval.id}`);
    } catch (err) {
      log.error(`Failed to send approval request to admin ${adminId}:`, err);
      throw err;
    }
  }

  async sendApprovalResult(approval: ApprovalRequest, decision: 'approved' | 'denied' | 'expired'): Promise<void> {
    const locale = t(getLang());
    const text = locale.approvalResult(approval.command, decision);

    try {
      // 结果通知发送到申请人的 userId
      await this.wsClient.sendMessage(approval.requesterId, {
        msgtype: 'markdown',
        markdown: { content: text },
      });
      log.debug(`Approval result sent to requester ${approval.requesterId}: ${approval.id} -> ${decision}`);
    } catch (err) {
      log.error(`Failed to send approval result to requester ${approval.requesterId}:`, err);
      throw err;
    }
  }
}
