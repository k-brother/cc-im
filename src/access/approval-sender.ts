import type { ApprovalRequest } from './types.js';

/**
 * 审批通知发送接口
 * 各平台实现此接口以发送审批请求和结果通知
 */
export interface ApprovalSender {
  /**
   * 发送审批请求给管理员
   */
  sendApprovalRequest(adminId: string, approval: ApprovalRequest): Promise<void>;

  /**
   * 发送审批结果给申请人
   */
  sendApprovalResult(approval: ApprovalRequest, decision: 'approved' | 'denied' | 'expired'): Promise<void>;
}
