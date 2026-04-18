import { DWClient } from 'dingtalk-stream';
import type { Config } from '../config.js';
import { createLogger } from '../logger.js';
import { DingtalkTokenManager } from './access-token.js';

const log = createLogger('DingTalk');

let client: DWClient | null = null;

export function getClient(): DWClient {
  if (!client) throw new Error('DingTalk client not initialized. Call initDingtalk() first.');
  return client;
}

export interface DingtalkEventHandlerHandle {
  stop: () => void;
  getRunningTaskCount: () => number;
}

export async function initDingtalk(
  config: Config,
  setupHandlers: (client: DWClient, tokenManager: DingtalkTokenManager) => DingtalkEventHandlerHandle,
): Promise<{ client: DWClient; handle: DingtalkEventHandlerHandle; tokenManager: DingtalkTokenManager }> {
  const dingtalkConfig = config.platforms.dingtalk;
  if (!dingtalkConfig?.appKey || !dingtalkConfig?.appSecret || !dingtalkConfig?.agentId) {
    throw new Error('DingTalk platform not configured (appKey, appSecret, agentId required)');
  }

  log.info('Initializing DingTalk bot...');

  client = new DWClient({
    clientId: dingtalkConfig.appKey,
    clientSecret: dingtalkConfig.appSecret,
  });

  const initialToken = await client.getAccessToken();
  const tokenManager = new DingtalkTokenManager(client, typeof initialToken === 'string' ? initialToken : undefined);

  // Register lifecycle events
  client.on('connect', () => {
    log.info('DingTalk Stream connected');
  });

  client.on('disconnect', (reason: string) => {
    log.warn(`DingTalk Stream disconnected: ${reason}`);
  });

  client.on('error', (error: Error) => {
    log.error('DingTalk Stream error:', error);
  });

  const handle = setupHandlers(client, tokenManager);

  await client.connect();

  return { client, handle, tokenManager };
}

export function stopDingtalk(): void {
  if (client) {
    client.disconnect();
    client = null;
    log.info('DingTalk bot stopped');
  }
}
