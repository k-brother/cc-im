import type { Config } from '../config.js';
import type { SessionManager } from '../session/session-manager.js';
import type { ThreadContext } from '../shared/types.js';
import { runClaudeTask, type TaskRunState } from '../shared/claude-task.js';
import type { CostRecord } from '../shared/types.js';
import { createLogger } from '../logger.js';
import { DingtalkMessageSender } from './message-sender.js';
import type { DingtalkTokenManager } from './access-token.js';

const log = createLogger('DingTalkTaskExecutor');

const THROTTLE_MS = 200;
const MAX_MESSAGE_LENGTH = 4000;

export type DingtalkTaskInfo = TaskRunState;

interface TaskExecutorDeps {
  config: Config;
  sessionManager: SessionManager;
  userCosts: Map<string, CostRecord>;
  runningTasks: Map<string, DingtalkTaskInfo>;
}

export async function executeClaudeTask(
  deps: TaskExecutorDeps,
  userId: string,
  chatId: string,
  prompt: string,
  workDir: string,
  convId: string | undefined,
  threadCtx: ThreadContext | undefined,
  tokenManager: DingtalkTokenManager,
): Promise<void> {
  const { config, sessionManager, userCosts, runningTasks } = deps;

  const agentId = config.platforms.dingtalk?.agentId || '';
  const messageSender = new DingtalkMessageSender(tokenManager, agentId);

  const sessionId = threadCtx?.threadId
    ? sessionManager.getSessionIdForThread(userId, threadCtx.threadId)
    : convId
      ? sessionManager.getSessionIdForConv(userId, convId)
      : undefined;

  log.info(`Running Claude for user ${userId}, workDir=${workDir}, sessionId=${sessionId ?? 'new'}`);

  // Send initial thinking message
  await messageSender.sendTextReply(chatId, '💭 正在思考...');

  const taskKey = `${userId}:${Date.now()}`;
  let lastContent = '';
  /** 与企微一致：用于 stall 检测的最近一次完整流式内容 */
  let lastSeenContent = '';
  let firstContentReceived = false;
  let waitingTimer: ReturnType<typeof setInterval> | null = null;

  try {
    await runClaudeTask(
      { config, sessionManager, userCosts },
      {
        userId,
        chatId,
        workDir,
        sessionId,
        convId,
        threadId: threadCtx?.threadId,
        threadRootMsgId: threadCtx?.rootMessageId,
        platform: 'dingtalk',
        taskKey,
      },
      prompt,
      {
        throttleMs: THROTTLE_MS,
        onTaskReady: async (state) => {
          const taskInfo = { ...state } as DingtalkTaskInfo;
          runningTasks.set(taskKey, taskInfo);
          try {
            await messageSender.sendStopCard(chatId, taskKey);
          } catch (err) {
            log.warn('Failed to send stop card:', err);
          }

          const startTime = Date.now();
          let stallChecks = 0;
          waitingTimer = setInterval(() => {
            const currentTask = runningTasks.get(taskKey);
            if (!currentTask) {
              if (waitingTimer) { clearInterval(waitingTimer); waitingTimer = null; }
              return;
            }
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const latest = currentTask.latestContent;

            if (!firstContentReceived) {
              messageSender.sendTextReply(chatId, `⏳ 等待 Claude 响应... (${elapsed}s)`).catch(() => {});
              return;
            }

            // 思考阶段：不做 stall 检测（与企微一致）
            if (latest.startsWith('💭')) {
              return;
            }

            if (latest === lastSeenContent) {
              stallChecks++;
              if (stallChecks >= 2) {
                messageSender.sendTextReply(chatId, `⏳ 工具执行中... (${elapsed}s)`).catch(() => {});
              }
            } else {
              stallChecks = 0;
              lastSeenContent = latest;
            }
          }, 3000);
          (waitingTimer as NodeJS.Timeout).unref();
        },
        onFirstContent: () => {
          firstContentReceived = true;
        },
        onThinkingToText: (content) => {
          lastContent = content;
          lastSeenContent = content;
        },
        extraCleanup: () => {
          if (waitingTimer) { clearInterval(waitingTimer); waitingTimer = null; }
          runningTasks.delete(taskKey);
        },
        sendImage: (imagePath) => messageSender.sendImageReply(chatId, imagePath),
        streamUpdate: async (content) => {
          lastSeenContent = content;
          const delta = content.slice(lastContent.length);
          if (delta) {
            const truncated = delta.slice(-MAX_MESSAGE_LENGTH);
            await messageSender.sendTextReply(chatId, truncated);
          }
          lastContent = content;
        },
        sendComplete: async (content, note) => {
          // Send final result
          const truncated = content.slice(-MAX_MESSAGE_LENGTH);
          await messageSender.sendMarkdown(chatId, 'Claude Code', truncated + '\n\n' + note);
        },
        sendError: async (errorMsg) => {
          const truncated = errorMsg.slice(-MAX_MESSAGE_LENGTH);
          await messageSender.sendTextReply(chatId, `❌ 错误: ${truncated}`);
        },
      },
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error(`Task execution failed for ${userId}:`, err);
    await messageSender.sendTextReply(chatId, `❌ 执行失败: ${errorMsg}`);
  }
}
