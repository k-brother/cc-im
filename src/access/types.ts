import type { Platform } from '../config.js';
import type { ThreadContext } from '../shared/types.js';

/**
 * 命令风险等级
 */
export enum RiskLevel {
  L1 = 'low',      // 低风险：所有用户可直接执行
  L2 = 'medium',   // 中风险：群聊需审批
  L3 = 'high',     // 高风险：仅管理员可用
}

/**
 * 审批请求状态
 */
export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';

/**
 * 审批请求
 */
export interface ApprovalRequest {
  id: string;                      // apr_<timestamp>_<random>
  requesterId: string;            // 申请人 userId
  requesterChatId: string;        // 来源 chatId（群）
  platform: Platform;             // 平台
  command: string;                // 命令，如 "/cd"
  args: string;                   // 参数，如 "/project"
  riskLevel: RiskLevel;
  status: ApprovalStatus;
  threadCtx?: ThreadContext;      // 话题上下文
  createdAt: number;
  expiresAt: number;
  resolvedAt?: number;           // 审批时间
}

/**
 * 审批设置
 */
export interface ApprovalSettings {
  enabled: boolean;
  groupRequired: boolean;
  timeoutMs: number;
  mode: 'any';
}

/**
 * 启动/关闭通知目标（按平台：群 + 私聊会话 ID）
 */
export interface PlatformNotifyConfig {
  groups: string[];
  users: string[];
}

export interface StartupNotifyConfig {
  wecom?: PlatformNotifyConfig;
  feishu?: PlatformNotifyConfig;
  telegram?: PlatformNotifyConfig;
  dingtalk?: PlatformNotifyConfig;
  /** 自定义启动问候语 */
  customGreeting?: {
    group?: { zh?: string; en?: string };
    private?: { zh?: string; en?: string };
  };
}

/**
 * 审批配置
 */
export interface ApprovalConfig {
  targets: Record<Platform, string[]>;
  settings: ApprovalSettings;
}

/**
 * 高权限配置（访问控制、审批等均放在此对象下，避免根级字段与多平台 ID 混淆）
 */
export interface PrivilegedConfig {
  /** 用户 ID 白名单（按平台区分） */
  users: Record<Platform, string[]>;
  /** 启动/关闭通知 */
  startup?: StartupNotifyConfig;
  approval: ApprovalConfig;
}
