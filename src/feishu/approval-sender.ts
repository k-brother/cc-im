import { getClient } from './client.js';
import type { ApprovalRequest } from '../access/types.js';
import type { ApprovalSender } from '../access/approval-sender.js';
import { createLogger } from '../logger.js';
import { t, type Language } from '../i18n.js';
import { loadConfig } from '../config.js';

const log = createLogger('FeishuApprovalSender');

// Lazy-load config to avoid circular dependency
let _config: ReturnType<typeof loadConfig> | null = null;
function getLang(): Language {
  if (!_config) _config = loadConfig();
  return _config.language;
}

/**
 * 飞书审批通知发送器
 */
export class FeishuApprovalSender implements ApprovalSender {
  private get client() {
    return getClient();
  }

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
      await this.client.im.v1.message.create({
        params: { receive_id_type: 'open_id' },
        data: {
          receive_id: adminId,
          msg_type: 'text',
          content: JSON.stringify({ text }),
        },
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
      // 结果通知发送到申请人的 open_id
      await this.client.im.v1.message.create({
        params: { receive_id_type: 'open_id' },
        data: {
          receive_id: approval.requesterId,
          msg_type: 'text',
          content: JSON.stringify({ text }),
        },
      });
      log.debug(`Approval result sent to requester ${approval.requesterId}: ${approval.id} -> ${decision}`);
    } catch (err) {
      log.error(`Failed to send approval result to requester ${approval.requesterId}:`, err);
      throw err;
    }
  }
}
