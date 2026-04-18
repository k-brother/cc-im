import type { Config } from '../config.js';
import type { SessionManager } from '../session/session-manager.js';
import type { ThreadContext, CostRecord } from '../shared/types.js';
import { CommandHandler } from '../commands/handler.js';
import { RequestQueue } from '../queue/request-queue.js';
import { AccessControl } from '../access/access-control.js';
import { ApprovalManager, shouldEnableApprovalManager } from '../access/approval-manager.js';
import { registerPermissionSender } from '../hook/permission-server.js';
import { DingtalkApprovalSender } from './approval-sender.js';
import { DingtalkMessageSender } from './message-sender.js';
import { executeClaudeTask, type DingtalkTaskInfo } from './task-executor.js';
import type { DWClient } from 'dingtalk-stream';
import { TOPIC_CARD } from 'dingtalk-stream';
import type { TaskRunState } from '../shared/claude-task.js';
import { createLogger } from '../logger.js';
import { startTaskCleanup } from '../shared/task-cleanup.js';
import { setActiveChatId } from '../shared/active-chats.js';
import { IMAGE_DIR } from '../constants.js';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { URL, URLSearchParams } from 'node:url';
import { registerDingtalkInboundMessage } from '../mcp/server.js';
import type { DingtalkTokenManager } from './access-token.js';

const log = createLogger('DingTalkEventHandler');

export interface DingtalkEventHandlerHandle {
  stop: () => void;
  getRunningTaskCount: () => number;
}

/**
 * 下载钉钉图片到本地
 */
async function downloadDingtalkImage(tokens: DingtalkTokenManager, mediaId: string, depth = 0): Promise<string> {
  if (depth > 1) {
    throw new Error('DingTalk image download failed after token refresh');
  }
  const accessToken = await tokens.getToken();
  await mkdir(IMAGE_DIR, { recursive: true });
  const safeId = mediaId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const imagePath = join(IMAGE_DIR, `${Date.now()}-${safeId}.png`);

  // 钉钉媒体下载接口
  const base = `https://oapi.dingtalk.com/media/get?access_token=${encodeURIComponent(accessToken)}&media_id=${encodeURIComponent(mediaId)}`;
  log.debug('Downloading DingTalk image (media/get)');
  let response = await fetch(base);
  if (!response.ok) {
    const fallback = `https://oapi.dingtalk.com/media/download?access_token=${encodeURIComponent(accessToken)}&media_id=${encodeURIComponent(mediaId)}`;
    response = await fetch(fallback);
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to download DingTalk image: ${response.status} ${response.statusText} - ${text.slice(0, 200)}`);
  }

  const ct = response.headers.get('content-type') ?? '';
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new Error('Empty image body from DingTalk media API');
  }
  if (ct.includes('application/json') || ct.includes('text/json')) {
    const j = JSON.parse(new TextDecoder().decode(buffer)) as { errcode?: number; errmsg?: string };
    if (j.errcode !== undefined && j.errcode !== 0) {
      if (j.errcode === 40014 || j.errcode === 42001 || j.errcode === 40001) {
        tokens.invalidate();
        return downloadDingtalkImage(tokens, mediaId, depth + 1);
      }
      throw new Error(j.errmsg ?? `DingTalk media error ${j.errcode}`);
    }
  }
  await writeFile(imagePath, Buffer.from(buffer));
  log.debug(`Image saved to ${imagePath}`);
  return imagePath;
}

export function createEventDispatcher(
  config: Config,
  sessionManager: SessionManager,
  client: DWClient,
  tokenManager: DingtalkTokenManager,
): DingtalkEventHandlerHandle {
  const accessControl = new AccessControl(config);
  const requestQueue = new RequestQueue();
  const userCosts = new Map<string, CostRecord>();
  const runningTasks = new Map<string, DingtalkTaskInfo>();
  const stopTaskCleanup = startTaskCleanup(runningTasks as Map<string, TaskRunState>);

  const agentId = config.platforms.dingtalk?.agentId || '';
  const messageSender = new DingtalkMessageSender(tokenManager, agentId);

  // Create approval manager
  const approvalSender = new DingtalkApprovalSender(tokenManager, agentId);
  const approvalManager = config.privileged && shouldEnableApprovalManager(config.privileged)
    ? new ApprovalManager(config.privileged, new Map([['dingtalk', approvalSender]]))
    : undefined;

  // Register permission sender for DingTalk
  registerPermissionSender('dingtalk', {
    sendPermissionCard: (chatId, requestId, toolName, toolInput) =>
      messageSender.sendPermissionCard(chatId, requestId, toolName, toolInput),
    updatePermissionCard: ({ messageId: _messageId, chatId, toolName, decision }) =>
      messageSender.updatePermissionCard({ messageId: _messageId, chatId, toolName, decision }),
  });

  // Create command handler
  const commandHandler = new CommandHandler({
    config,
    sessionManager,
    requestQueue,
    sender: messageSender,
    userCosts,
    getRunningTasksSize: () => runningTasks.size,
    approvalManager,
  });

  function stopRunningTask(taskKey: string): void {
    const taskInfo = runningTasks.get(taskKey);
    if (!taskInfo) return;
    runningTasks.delete(taskKey);
    taskInfo.settle();
    taskInfo.handle.abort();
  }

  // Handle incoming message event
  client.registerCallbackListener('message', async (event) => {
    const body = event.data ? JSON.parse(event.data) as Record<string, unknown> : null;
    if (!body?.conversationId) return { status: 'SUCCESS' };

    const conversationId = String(body.conversationId);
    const msgId =
      typeof body.msgId === 'string'
        ? body.msgId
        : `dt_${typeof body.createAt === 'number' ? body.createAt : Date.now()}`;
    const senderNick = typeof body.senderNick === 'string' ? body.senderNick : '';
    const senderStaffId = typeof body.senderStaffId === 'string' ? body.senderStaffId : '';
    const msgtype = typeof body.msgtype === 'string' ? body.msgtype : '';
    const content = body.content;

    const userId = senderStaffId || senderNick || 'unknown';

    // Access control
    if (!accessControl.isAllowed(userId, 'dingtalk')) {
      await messageSender.sendTextReply(conversationId, '抱歉，您没有访问权限。');
      return { status: 'SUCCESS' };
    }

    setActiveChatId('dingtalk', conversationId);

    let prompt = '';
    let isImageMessage = false;

    if (msgtype === 'text') {
      const fromTextObj =
        body.text && typeof body.text === 'object' && body.text !== null && 'content' in body.text
          ? String((body.text as { content?: string }).content ?? '')
          : '';
      if (fromTextObj) {
        prompt = fromTextObj;
      } else if (typeof content === 'string') {
        prompt = content;
      } else {
        prompt = '';
      }
    } else if (msgtype === 'image') {
      isImageMessage = true;
      try {
        let mediaId: string | undefined;
        if (typeof content === 'string' && content.trim()) {
          try {
            const imgContent = JSON.parse(content) as { mediaId?: string; downloadCode?: string };
            mediaId = imgContent.mediaId || imgContent.downloadCode;
          } catch {
            mediaId = content;
          }
        } else if (content && typeof content === 'object' && content !== null) {
          const c = content as { mediaId?: string; downloadCode?: string };
          mediaId = c.mediaId || c.downloadCode;
        }
        if (!mediaId && body.image && typeof body.image === 'object' && body.image !== null) {
          const im = body.image as { mediaId?: string; downloadCode?: string };
          mediaId = im.mediaId || im.downloadCode;
        }
        if (!mediaId) {
          log.warn('No mediaId found in image message:', body);
          await messageSender.sendTextReply(conversationId, '无法识别图片消息格式。');
          return { status: 'SUCCESS' };
        }
        const imagePath = await downloadDingtalkImage(tokenManager, mediaId);
        prompt = `用户发送了一张图片，已保存到 ${imagePath}。请用 Read 工具查看并分析图片内容。`;
      } catch (err) {
        log.error('Failed to process image message:', err);
        await messageSender.sendTextReply(conversationId, '图片处理失败，请重试。');
        return { status: 'SUCCESS' };
      }
    } else {
      log.debug(`Skipping unsupported message type: ${msgtype}`);
      await messageSender.sendTextReply(conversationId, '目前仅支持文本和图片消息。');
      return { status: 'SUCCESS' };
    }

    // Log user message (sanitized)
    log.info(`User ${userId}${msgtype === 'image' ? ' [image]' : ''}: ${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}`);

    registerDingtalkInboundMessage({
      platform: 'dingtalk',
      msgId,
      chatId: conversationId,
      userId,
      text: prompt.slice(0, 2000),
      isGroup: false,
      timestamp: Date.now(),
    });

    // Handle /stop command (fallback when button not available)
    if (prompt.trim() === '/stop') {
      // Find the latest running task for this user
      let latestTaskKey: string | null = null;
      let latestTime = 0;
      for (const [key, task] of runningTasks) {
        if (key.startsWith(`${userId}:`)) {
          // Extract timestamp from taskKey (format userId:timestamp)
          const parts = key.split(':');
          const timestamp = parseInt(parts[1], 10);
          if (!isNaN(timestamp) && timestamp > latestTime) {
            latestTime = timestamp;
            latestTaskKey = key;
          }
        }
      }
      if (latestTaskKey && runningTasks.has(latestTaskKey)) {
        log.info(`User ${userId} stopped task ${latestTaskKey} via /stop command`);
        stopRunningTask(latestTaskKey);
        await messageSender.updateStopCard(conversationId, latestTaskKey);
        await messageSender.sendTextReply(conversationId, '⏹️ 已停止当前任务');
        return { status: 'SUCCESS' };
      }
      await messageSender.sendTextReply(conversationId, '没有正在运行的任务。');
      return { status: 'SUCCESS' };
    }

    // Route to command handler
    const threadCtx: ThreadContext | undefined = undefined;
    if (
      await commandHandler.dispatch(
        prompt,
        conversationId,
        userId,
        'dingtalk',
        (userId, chatId, prompt, workDir, _convId, threadCtx) =>
          executeClaudeTask(
            { config, sessionManager, userCosts, runningTasks },
            userId,
            chatId,
            prompt,
            workDir,
            undefined,
            threadCtx,
            tokenManager,
          ),
        false,
        threadCtx,
      )
    ) {
      return { status: 'SUCCESS' };
    }

    const workDirSnapshot = sessionManager.getWorkDir(userId);
    const convIdSnapshot = sessionManager.getConvId(userId);
    const enqueueResult = requestQueue.enqueue(userId, convIdSnapshot, prompt, async (p) => {
      await executeClaudeTask(
        { config, sessionManager, userCosts, runningTasks },
        userId,
        conversationId,
        p,
        workDirSnapshot,
        convIdSnapshot,
        threadCtx,
        tokenManager,
      );
    });

    if (enqueueResult === 'rejected') {
      await messageSender.sendTextReply(conversationId, '您的请求队列已满，请等待当前任务完成后再试。');
    } else if (enqueueResult === 'queued') {
      await messageSender.sendTextReply(conversationId, '前面还有任务在处理中，您的请求已排队等待。');
    }

    return { status: 'SUCCESS' };
  });

  // Handle card callback events (stop button)
  client.registerCallbackListener(TOPIC_CARD, async (event) => {
    try {
      const body = event.data ? JSON.parse(event.data) : null;
      if (!body) {
        log.debug('Empty card callback body');
        return { status: 'SUCCESS' };
      }

      log.debug(`Card callback received: ${JSON.stringify(body, null, 2)}`);

      // 钉钉卡片回调数据结构示例（需要根据实际日志调整）：
      // {
      //   "conversationId": "xxx",
      //   "content": "{\"action\":\"stop\",\"taskKey\":\"user:123456\"}",
      //   "cardCallbackUrl": "dingtalk://card/callback?action=stop&taskKey=user%3A123456"
      // }

      let taskKey: string | null = null;
      let action: string | null = null;
      let chatId: string | null = body.conversationId || null;

      // 尝试从 content 字段解析
      if (body.content) {
        try {
          const content = typeof body.content === 'string' ? JSON.parse(body.content) : body.content;
          if (content && typeof content === 'object') {
            taskKey = typeof (content as { taskKey?: string }).taskKey === 'string' ? (content as { taskKey: string }).taskKey : null;
            action = typeof (content as { action?: string }).action === 'string' ? (content as { action: string }).action : null;
          }
        } catch (err) {
          log.debug('Failed to parse content field:', err);
        }
      }

      // 尝试从 cardCallbackUrl 或其他 URL 字段解析
      const urlFields = ['cardCallbackUrl', 'callbackUrl', 'url', 'actionUrl'];
      for (const field of urlFields) {
        if (body[field]) {
          try {
            const url = new URL(String(body[field]));
            const params = new URLSearchParams(url.search);
            taskKey = taskKey || params.get('taskKey') || params.get('taskkey');
            action = action || params.get('action');
            break;
          } catch (err) {
            log.debug(`Failed to parse URL field ${field}:`, err);
          }
        }
      }

      const raw = typeof event.data === 'string' ? event.data : '';
      if (!taskKey) {
        const m = /taskKey=([^&"'\s]+)/.exec(raw);
        if (m) taskKey = decodeURIComponent(m[1]);
      }
      if (!action) {
        const m = /action=([^&"'\s]+)/.exec(raw);
        if (m) action = m[1];
      }

      if (action === 'stop' && taskKey) {
        if (runningTasks.has(taskKey)) {
          log.info(`User stopped task ${taskKey} via stop button`);
          stopRunningTask(taskKey);
          if (chatId) {
            await messageSender.updateStopCard(chatId, taskKey);
            await messageSender.sendTextReply(chatId, '⏹️ 已停止当前任务');
          }
        } else {
          log.warn(`Task ${taskKey} not found in running tasks`);
        }
      } else if (action === 'stopped') {
        // 卡片已更新为停止状态，无需处理
        log.debug('Card already updated to stopped state');
      } else {
        log.debug(`Unknown card action: ${action}, taskKey: ${taskKey}`);
      }
    } catch (err) {
      log.error('Error processing card callback:', err);
    }
    return { status: 'SUCCESS' };
  });

  function stop() {
    stopTaskCleanup();
    client.disconnect();
  }

  function getRunningTaskCount() {
    return runningTasks.size;
  }

  return { stop, getRunningTaskCount };
}
