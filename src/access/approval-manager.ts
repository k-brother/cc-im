import { createLogger } from '../logger.js';
import type { Platform } from '../config.js';
import type { ApprovalRequest, PrivilegedConfig, RiskLevel } from './types.js';
import type { ApprovalSender } from './approval-sender.js';
import type { ThreadContext } from '../shared/types.js';

/** 仅在存在审批能力（开启或配置了管理员）时创建 ApprovalManager，避免仅白名单占位时误建 */
export function shouldEnableApprovalManager(config: PrivilegedConfig): boolean {
  if (config.approval.settings.enabled) return true;
  return Object.values(config.approval.targets).some((ids) => ids.length > 0);
}

const log = createLogger('ApprovalManager');

/**
 * 审批管理器
 * 负责管理审批请求的创建、查询、决策
 */
export class ApprovalManager {
  private approvals = new Map<string, ApprovalRequest>();
  private chatIdIndex = new Map<string, Set<string>>();   // chatId → approvalIds
  private userIdIndex = new Map<string, Set<string>>();   // userId → approvalIds

  constructor(
    private config: PrivilegedConfig,
    private senders: Map<Platform, ApprovalSender>,
  ) {}

  /**
   * 创建审批请求
   */
  async createApproval(params: {
    requesterId: string;
    requesterChatId: string;
    platform: Platform;
    command: string;
    args: string;
    riskLevel: RiskLevel;
    threadCtx?: ThreadContext;
  }): Promise<ApprovalRequest> {
    const id = `apr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const approval: ApprovalRequest = {
      id,
      ...params,
      status: 'pending',
      createdAt: now,
      expiresAt: now + this.config.approval.settings.timeoutMs,
    };

    this.approvals.set(id, approval);
    this.addToIndex(this.chatIdIndex, params.requesterChatId, id);
    this.addToIndex(this.userIdIndex, params.requesterId, id);

    // 通知所有管理员
    await this.notifyAdmins(approval);

    // 启动过期检查
    this.scheduleExpiry(id);

    log.info(`Approval request created: ${id} for ${params.command}`);
    return approval;
  }

  /**
   * 审批决策
   */
  async resolve(approvalId: string, decision: 'approved' | 'denied' | 'expired'): Promise<boolean> {
    const approval = this.approvals.get(approvalId);
    if (!approval || approval.status !== 'pending') {
      log.warn(`Approval ${approvalId} not found or already resolved`);
      return false;
    }

    approval.status = decision;
    approval.resolvedAt = Date.now();

    // 清理索引
    this.removeFromIndex(this.chatIdIndex, approval.requesterChatId, approvalId);
    this.removeFromIndex(this.userIdIndex, approval.requesterId, approvalId);

    // 通知申请人
    await this.notifyRequester(approval, decision);

    log.info(`Approval ${approvalId} resolved: ${decision}`);
    return true;
  }

  /**
   * 获取审批请求
   */
  getApproval(approvalId: string): ApprovalRequest | undefined {
    return this.approvals.get(approvalId);
  }

  /**
   * 获取用户在某聊天中的待审批请求
   */
  getPendingForChat(chatId: string): ApprovalRequest[] {
    const ids = this.chatIdIndex.get(chatId);
    if (!ids) return [];
    return Array.from(ids)
      .map(id => this.approvals.get(id))
      .filter((a): a is ApprovalRequest => a !== undefined && a.status === 'pending');
  }

  /**
   * 判断用户是否为某平台的管理员
   */
  isAdmin(userId: string, platform: Platform): boolean {
    const admins = this.config.approval.targets[platform] ?? [];
    return admins.includes(userId);
  }

  /**
   * 获取某平台的所有管理员
   */
  getAdmins(platform: Platform): string[] {
    return this.config.approval.targets[platform] ?? [];
  }

  /**
   * 判断是否为白名单用户
   */
  isAllowedUser(userId: string, platform: Platform): boolean {
    const users = this.config.users[platform] ?? [];
    return users.includes(userId);
  }

  /**
   * 审批设置
   */
  get settings() {
    return this.config.approval.settings;
  }

  // === 私有方法 ===

  private async notifyAdmins(approval: ApprovalRequest): Promise<void> {
    const admins = this.getAdmins(approval.platform);
    const sender = this.senders.get(approval.platform);

    if (!sender) {
      log.error(`No approval sender for platform: ${approval.platform}`);
      return;
    }

    for (const adminId of admins) {
      try {
        await sender.sendApprovalRequest(adminId, approval);
      } catch (err) {
        log.error(`Failed to notify admin ${adminId}:`, err);
      }
    }
  }

  private async notifyRequester(approval: ApprovalRequest, decision: string): Promise<void> {
    const sender = this.senders.get(approval.platform);

    if (!sender) {
      log.error(`No approval sender for platform: ${approval.platform}`);
      return;
    }

    try {
      await sender.sendApprovalResult(
        approval,
        decision as 'approved' | 'denied' | 'expired',
      );
    } catch (err) {
      log.error(`Failed to notify requester ${approval.requesterId}:`, err);
    }
  }

  private scheduleExpiry(id: string): void {
    const approval = this.approvals.get(id);
    if (!approval) return;

    const delay = approval.expiresAt - Date.now();
    if (delay <= 0) return;

    setTimeout(() => {
      if (this.approvals.get(id)?.status === 'pending') {
        this.resolve(id, 'expired').catch((err) => {
          log.error(`Failed to expire approval ${id}:`, err);
        });
      }
    }, delay);
  }

  private addToIndex(index: Map<string, Set<string>>, key: string, id: string): void {
    let set = index.get(key);
    if (!set) {
      set = new Set();
      index.set(key, set);
    }
    set.add(id);
  }

  private removeFromIndex(index: Map<string, Set<string>>, key: string, id: string): void {
    const set = index.get(key);
    if (set) {
      set.delete(id);
      if (set.size === 0) {
        index.delete(key);
      }
    }
  }
}
