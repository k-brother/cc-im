import type { DWClient } from 'dingtalk-stream';
import { createLogger } from '../logger.js';

const log = createLogger('DingTalkToken');

/** 钉钉 gettoken 默认有效期（秒） */
const DEFAULT_EXPIRES_SEC = 7200;
/** 提前刷新：在到期前 5 分钟即认为需换新 token */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * 钉钉 access_token 缓存与刷新。
 * 启动时 SDK 已拉取的首 token 可传入，避免立刻二次请求。
 *
 * 其他平台：飞书 / 企业微信由官方 SDK 在 HTTP / 长连接内维护凭证；
 * Telegram Bot Token 长期有效，无需此类逻辑。
 */
export class DingtalkTokenManager {
  private cached: string | null = null;
  /** 绝对过期时间（epoch ms），超过后必须 refresh */
  private expiresAt = 0;
  private inflight: Promise<string> | null = null;

  constructor(
    private readonly client: DWClient,
    /** initDingtalk 里已 await getAccessToken() 时可传入，减少一次刷新 */
    initialToken?: string,
  ) {
    if (initialToken) {
      this.cached = initialToken;
      this.expiresAt = Date.now() + DEFAULT_EXPIRES_SEC * 1000;
    }
  }

  /** 使缓存失效，下次 getToken 会强制拉新（用于 API 返回 token 过期时） */
  invalidate(): void {
    this.cached = null;
    this.expiresAt = 0;
  }

  async getToken(): Promise<string> {
    const now = Date.now();
    if (this.cached && now < this.expiresAt - REFRESH_BUFFER_MS) {
      return this.cached;
    }
    if (this.inflight) return this.inflight;
    this.inflight = this.refresh().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async refresh(): Promise<string> {
    const token = await this.client.getAccessToken();
    if (typeof token !== 'string') {
      throw new Error('DingTalk getAccessToken did not return a string');
    }
    this.cached = token;
    this.expiresAt = Date.now() + DEFAULT_EXPIRES_SEC * 1000;
    log.debug('DingTalk access_token refreshed');
    return token;
  }
}
