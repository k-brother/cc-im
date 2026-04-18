import type { Config, Platform } from '../config.js';

/**
 * 与 CommandHandler 白名单逻辑一致（单一事实来源）。
 * - 未配置 `privileged`：开发模式全放行
 * - 已配置 `privileged`：按平台 `users` 列表限制
 */
export function isUserAllowedForPlatform(config: Config, userId: string, platform: Platform): boolean {
  if (!config.privileged) {
    return true;
  }
  const users = config.privileged.users[platform] ?? [];
  if (users.length > 0) {
    return users.includes(userId);
  }
  return false;
}

/**
 * 各平台事件入口处的访问控制（须传入 platform，与命令层一致）
 */
export class AccessControl {
  constructor(private readonly config: Config) {}

  isAllowed(userId: string, platform: Platform): boolean {
    return isUserAllowedForPlatform(this.config, userId, platform);
  }
}
