import { describe, it, expect } from 'vitest';
import { AccessControl, isUserAllowedForPlatform } from '../../../src/access/access-control.js';
import type { Config } from '../../../src/config.js';
import type { PrivilegedConfig } from '../../../src/access/types.js';

function baseConfig(overrides: Partial<Config> = {}): Config {
  return {
    platforms: {},
    enabledPlatforms: [],
    claudeCliPath: 'claude',
    claudeWorkDir: '/',
    allowedBaseDirs: ['/'],
    claudeSkipPermissions: false,
    claudeTimeoutMs: 600000,
    hookPort: 18900,
    logDir: '/tmp',
    logLevel: 'DEBUG',
    ...overrides,
  };
}

function privilegedUsers(partial: Partial<Record<'feishu' | 'telegram' | 'wecom' | 'dingtalk', string[]>>): PrivilegedConfig {
  const empty = { feishu: [] as string[], telegram: [] as string[], wecom: [] as string[], dingtalk: [] as string[] };
  return {
    users: { ...empty, ...partial },
    approval: {
      targets: empty,
      settings: { enabled: true, groupRequired: false, timeoutMs: 300_000, mode: 'any' },
    },
  };
}

describe('isUserAllowedForPlatform / AccessControl', () => {
  describe('未配置 privileged', () => {
    it('开发模式允许所有用户', () => {
      const c = baseConfig();
      expect(isUserAllowedForPlatform(c, 'any', 'telegram')).toBe(true);
      const ac = new AccessControl(c);
      expect(ac.isAllowed('u1', 'feishu')).toBe(true);
    });
  });

  describe('已配置 privileged.users', () => {
    it('按平台 users 限制', () => {
      const c = baseConfig({
        privileged: {
          ...privilegedUsers({ feishu: ['f1'], telegram: ['t1'] }),
        },
      });
      expect(isUserAllowedForPlatform(c, 'f1', 'feishu')).toBe(true);
      expect(isUserAllowedForPlatform(c, 'f2', 'feishu')).toBe(false);
      expect(isUserAllowedForPlatform(c, 't1', 'telegram')).toBe(true);
      expect(isUserAllowedForPlatform(c, 't2', 'telegram')).toBe(false);
    });
  });
});
