/**
 * 国际化 (i18n) 模块
 * 支持中英文双语，系统消息根据语言配置输出对应语言
 */

export type Language = 'zh' | 'en';

/**
 * 所有系统消息的接口
 */
export interface LocaleStrings {
  // 通用
  noAccess: string;
  // 权限
  permissionRequest: string;
  allow: string;
  deny: string;
  permissionAllowed: string;
  permissionDenied: string;
  operationAllowed: string;
  operationDenied: string;
  noPendingPermission: string;
  // 审批
  approvalRequest: string;
  approvalRequestTitle: string;
  approvalRequestApplicant: string;
  approvalRequestCommand: string;
  approvalRequestSource: string;
  approvalRequestAdminCommand: string;
  approvalSubmit: string;
  approvalApproved: string;
  approvalDenied: string;
  approvalExpired: string;
  approvalNotConfigured: string;
  approvalResult: (command: string, decision: 'approved' | 'denied' | 'expired') => string;
  usageApprove: string;
  usageReject: string;
  // 启动/关闭
  serviceStarted: string;
  serviceShutdown: string;
  platform: string;
  workingDir: string;
  startupNotificationDisabled: string;
  permissionsEnabled: string;
  permissionsSkipped: string;
  permissionConfirmation: string;
  serviceHours: string;
  // 帮助文本
  helpGroupTitle: string;
  helpPrivateTitle: string;
  helpCompactCmd: string;
  helpL1Direct: string;
  // 默认模型
  defaultModel: string;
  helpL2Approval: string;
  helpL3Admin: string;
  helpPrivateNote: string;
  helpGroupNote: string;
  helpCommandsL1: string;
  helpCommandsL2: string;
  helpCommandsL3: string;
  helpThreadCmd: string;
  helpStopCmd: string;
  helpStartCmd: string;
  // 命令响应
  newSessionStarted: string;
  newSessionNoActive: string;
  currentNoSession: string;
  sessionAlreadyCurrent: string;
  sessionResumed: string;
  invalidSessionIndex: string;
  invalidModelName: string;
  modelChanged: string;
  currentModel: string;
  usageModel: string;
  noHistoryRecord: string;
  noThreads: string;
  threadListTitle: string;
  workingDirectory: string;
  subdirectories: string;
  useCdToSwitch: string;
  invalidIndex: string;
  noProjectRecords: string;
  projectListTitle: string;
  useCdToSwitchPath: string;
  workdirChanged: string;
  sessionReset: string;
  noActiveSession: string;
  queueFull: string;
  compactQueued: string;
  noSessionToCompact: string;
  // 费用统计
  costTitle: string;
  noCostRecord: string;
  requests: string;
  totalCost: string;
  totalDuration: string;
  avgCost: string;
  // 状态
  statusTitle: string;
  version: string;
  sessionId: string;
  skipPermissions: string;
  timeout: string;
  cumulativeCost: string;
  noSession: string;
  unknown: string;
  // 健康检查
  doctorTitle: string;
  cliPath: string;
  allowedDirs: string;
  activeTasks: string;
  // 命令不可用
  terminalOnlyCommand: string;
  inputHelp: string;
  // 管理员
  adminOnly: string;
  approvalSuccess: string;
  approvalFailed: string;
  rejectSuccess: string;
  rejectFailed: string;
  // 启动问候语
  greetingTitle: string;
  greetingFeatures: string;
  greetingCommands: string;
  greetingDirectMention: string;
  // Telegram /start
  telegramStart: string;
  // 卡片状态标题
  cardStatusProcessing: string;
  cardStatusThinking: string;
  cardStatusStreaming: string;
  cardStatusDone: string;
  cardStatusError: string;
  // 权限卡片
  permissionCardTitle: string;
  permissionAllowedStatus: string;
  permissionDeniedStatus: string;
  permissionAllowedText: string;
  permissionDeniedText: string;
  // 按钮
  stopButton: string;
  allowButton: string;
  denyButton: string;
  // 状态消息
  waitPlease: string;
  thinking: string;
  errorPrefix: string;
  // 任务消息
  taskInProgress: string;
  taskStoppedByUser: string;
  taskCompleted: string;
  // 群聊
  groupGreeting: (botName: string) => string;
  privateGreeting: (botName: string, activeBots: string, workDir: string, cliVersion: string, skipPerm: boolean) => string;
  shutdownGreeting: (botName: string, uptime: string) => string;
}

/**
 * 中文字符串
 */
const zh: LocaleStrings = {
  // 通用
  noAccess: '抱歉，您没有访问权限。',

  // 权限
  permissionRequest: '🔐 权限确认 - ',
  allow: '✅ 允许',
  deny: '❌ 拒绝',
  permissionAllowed: '✅ 权限已允许',
  permissionDenied: '❌ 权限已拒绝',
  operationAllowed: '✅ 操作已允许执行。',
  operationDenied: '❌ 操作已被拒绝。',
  noPendingPermission: 'ℹ️ 没有待确认的权限请求',

  // 审批
  approvalRequest: '📋 审批请求',
  approvalRequestTitle: '📋 *审批请求*',
  approvalRequestApplicant: '申请人',
  approvalRequestCommand: '命令',
  approvalRequestSource: '来源',
  approvalRequestAdminCommand: '管理命令',
  approvalSubmit: '⏳ 请求已提交，等待管理员审批。\n审批ID: ',
  approvalApproved: '✅ 审批通过: ',
  approvalDenied: '✅ 已拒绝: ',
  approvalExpired: '⏰ 请求已超时',
  approvalResult: (command, decision) => `您的 ${command} 请求已${decision === 'approved' ? '批准' : decision === 'denied' ? '拒绝' : '超时'}`,
  approvalNotConfigured: '⚠️ 审批系统未配置，请联系管理员。',
  usageApprove: '用法: /approve <审批ID>',
  usageReject: '用法: /reject <审批ID>',
  approvalNotConfiguredShort: '⚠️ 审批系统未配置。',

  // 启动/关闭
  serviceStarted: '服务已启动',
  serviceShutdown: '服务正在关闭',
  platform: '平台',
  workingDir: '工作目录',
  startupNotificationDisabled: '启动通知已禁用（未配置 privileged.startup）',
  permissionsEnabled: '已启用',
  permissionsSkipped: '已跳过',
  permissionConfirmation: '权限确认',
  serviceHours: '服务时间: 工作日 09:00-18:00',

  // 帮助文本
  helpGroupTitle: '📋 可用命令（群聊）：',
  helpPrivateTitle: '📋 可用命令（私聊）：',
  helpCompactCmd: '/compact   - 压缩上下文',
  helpL1Direct: 'L1 直接执行：',
  defaultModel: '默认 (由 Claude Code 决定)',
  helpL2Approval: 'L2 需要审批：',
  helpL3Admin: 'L3 管理命令：',
  helpPrivateNote: '💡 私聊可用完整命令',
  helpGroupNote: '💡 私聊可用完整命令',
  helpCommandsL1: '/help      - 显示此帮助\n/new       - 开始新会话\n/status    - 查看状态\n/cost      - 费用统计\n/doctor    - 健康检查\n/pwd       - 当前目录\n/list      - 工作区列表\n/history   - 历史记录',
  helpCommandsL2: '/cd        - 切换目录\n/model     - 切换模型\n/resume    - 恢复会话',
  helpCommandsL3: '/allow     - 允许权限\n/deny      - 拒绝权限\n/approve   - 审批通过\n/reject    - 审批拒绝',
  helpThreadCmd: '/threads    - 列出话题会话\n',
  helpStopCmd: '/stop       - 停止当前任务\n',
  helpStartCmd: '/start      - 开始对话\n',

  // 命令响应
  newSessionStarted: '✅ 已开始新会话，之前的上下文不会延续。',
  newSessionNoActive: '当前没有活动会话。',
  currentNoSession: '当前话题没有活动会话。',
  sessionAlreadyCurrent: '该会话已是当前会话。',
  sessionResumed: '已恢复会话: ',
  sessionResumedSuffix: '\n后续消息将延续该会话上下文。',
  invalidSessionIndex: '无效的序号',
  invalidModelName: '❌ 无效的模型名称。模型名只能包含字母、数字、点、连字符和斜杠，且长度不超过 100 字符。',
  modelChanged: '模型已切换为: ',
  currentModel: '当前模型:',
  usageModel: '\n\n可选模型: sonnet, opus, haiku 或完整模型名\n用法: /model <模型名>',
  noHistoryRecord: '暂无历史记录。',
  noThreads: '暂无话题会话记录。',
  threadListTitle: '📋 话题会话列表 (',
  threadListSuffix: '\n\n✓ = 有活跃会话 | ✗ = 无会话',
  workingDirectory: '当前工作目录:',
  subdirectories: '📁 子目录:',
  useCdToSwitch: '\n\n使用 /cd <目录名> 切换',
  invalidIndex: '无效的序号',
  noProjectRecords: '未找到 Claude Code 工作区记录。',
  projectListTitle: 'Claude Code 工作区列表:\n',
  useCdToSwitchPath: '\n\n使用 /cd <序号> 或 /cd <路径> 切换',
  workdirChanged: '工作目录已切换到:',
  sessionReset: '\n会话已重置。',
  noActiveSession: '当前没有活动会话，无需压缩。',
  queueFull: '请求队列已满，请等待当前任务完成后再试。',
  compactQueued: '前面还有任务在处理中，压缩请求已排队等待。',

  // 费用统计
  costTitle: '💰 费用统计（本次服务启动后）:',
  noCostRecord: '暂无费用记录（本次服务启动后）。',
  requests: '请求次数',
  totalCost: '总费用',
  totalDuration: '总耗时',
  avgCost: '平均每次',

  // 状态
  statusTitle: '📊 Claude Code 状态:',
  version: '版本',
  sessionId: '会话 ID',
  skipPermissions: '跳过权限',
  timeout: '超时设置',
  cumulativeCost: '累计费用',
  noSession: '（无）',
  unknown: '未知',

  // 健康检查
  doctorTitle: '🏥 Claude Code 健康检查:',
  cliPath: 'CLI 路径',
  allowedDirs: '允许的基础目录',
  activeTasks: '活跃任务数',

  // 命令不可用
  terminalOnlyCommand: '命令仅在终端交互模式下可用。\n\n输入 /help 查看可用命令。',
  inputHelp: '输入 /help 查看可用命令。',

  // 管理员
  adminOnly: '⚠️ 此命令仅管理员可用。',

  // 审批结果
  approvalSuccess: '✅ 审批通过: ',
  approvalFailed: '❌ 审批失败: ',
  rejectSuccess: '✅ 已拒绝: ',
  rejectFailed: '❌ 操作失败: ',
  approvalNotFound: '不存在或已处理',

  // 启动问候语
  greetingTitle: '您好！我是您的智能办公助理。',
  greetingFeatures: '📌 支持功能：\n• 文档撰写与润色\n• 数据分析与报告\n• 智能问答与解答',
  greetingCommands: '🔧 常用命令：\n/new — 开始新对话\n/resume — 继续未完成的对话\n/model — 切换 AI 模型\n/stop — 停止当前任务\n/chatid — 查看当前会话 ID',
  greetingDirectMention: '💬 直接 @机器人 + 问题即可使用',

  // Telegram /start
  telegramStart: '欢迎使用 Claude Code Bot!\n\n发送消息与 Claude Code 交互，输入 /help 查看帮助。',

  // 卡片状态标题
  cardStatusProcessing: 'Claude Code - 处理中...',
  cardStatusThinking: 'Claude Code - 思考中...',
  cardStatusStreaming: 'Claude Code',
  cardStatusDone: 'Claude Code',
  cardStatusError: 'Claude Code - 错误',
  // 权限卡片
  permissionCardTitle: '🔐 权限确认 - ',
  permissionAllowedStatus: '已允许 ✓',
  permissionDeniedStatus: '已拒绝 ✗',
  permissionCardContent: '\n\n点击按钮确认操作：',
  permissionAllowedText: '✅ 操作已允许执行。',
  permissionDeniedText: '❌ 操作已被拒绝。',
  // 按钮
  stopButton: '⏹️ 停止',
  allowButton: '✅ 允许',
  denyButton: '❌ 拒绝',
  // 状态消息
  waitPlease: '请稍候',
  thinking: '正在思考...',
  errorPrefix: '错误',
  // 任务消息
  taskInProgress: '正在执行 Claude 任务，点击按钮可停止任务。',
  taskStoppedByUser: '任务已被用户停止。',
  taskCompleted: '任务已完成',

  // 群聊
  groupGreeting: (botName: string) => `${botName} 已上线\n\n${zh.greetingTitle}\n\n${zh.greetingFeatures}\n\n${zh.greetingCommands}\n\n${zh.greetingDirectMention}\n\n${zh.serviceHours}`,
  privateGreeting: (botName: string, activeBots: string, workDir: string, cliVersion: string, skipPerm: boolean) =>
    `${botName} ${zh.serviceStarted}\n${zh.platform}: ${activeBots}\n${zh.workingDir}: ${workDir}\n权限确认: ${skipPerm ? zh.permissionsSkipped : zh.permissionsEnabled}\nClaude CLI: ${cliVersion}\nNode: ${process.version}`,
  shutdownGreeting: (botName: string, uptime: string) => `🔴 ${botName} ${zh.serviceShutdown}...\n运行时长: ${uptime}`,
};

/**
 * 英文字符串
 */
const en: LocaleStrings = {
  // 通用
  noAccess: 'Sorry, you do not have access permission.',

  // 权限
  permissionRequest: '🔐 Permission Request - ',
  allow: '✅ Allow',
  deny: '❌ Deny',
  permissionAllowed: '✅ Permission allowed',
  permissionDenied: '❌ Permission denied',
  operationAllowed: '✅ Operation allowed.',
  operationDenied: '❌ Operation denied.',
  noPendingPermission: 'ℹ️ No pending permission requests',

  // 审批
  approvalRequest: '📋 Approval Request',
  approvalRequestTitle: '📋 *Approval Request*',
  approvalRequestApplicant: 'Applicant',
  approvalRequestCommand: 'Command',
  approvalRequestSource: 'Source',
  approvalRequestAdminCommand: 'Admin Commands',
  approvalSubmit: '⏳ Request submitted, waiting for admin approval.\nApproval ID: ',
  approvalApproved: '✅ Approved: ',
  approvalDenied: '✅ Rejected: ',
  approvalExpired: '⏰ Request expired',
  approvalResult: (command, decision) => `Your ${command} request has been ${decision === 'approved' ? 'approved' : decision === 'denied' ? 'rejected' : 'expired'}`,
  approvalNotConfigured: '⚠️ Approval system not configured, please contact admin.',
  usageApprove: 'Usage: /approve <approval_id>',
  usageReject: 'Usage: /reject <approval_id>',
  approvalNotConfiguredShort: '⚠️ Approval system not configured.',

  // 启动/关闭
  serviceStarted: 'Service started',
  serviceShutdown: 'Service shutting down',
  platform: 'Platform',
  workingDir: 'Working directory',
  startupNotificationDisabled: 'Startup notification disabled (privileged.startup not configured)',
  permissionsEnabled: 'Enabled',
  permissionsSkipped: 'Skipped',
  permissionConfirmation: 'Permissions',
  serviceHours: 'Service hours: Weekdays 09:00-18:00',

  // 帮助文本
  helpGroupTitle: '📋 Available Commands (Group):',
  helpPrivateTitle: '📋 Available Commands (Private):',
  helpCompactCmd: '/compact   - Compact context',
  helpL1Direct: 'L1 Direct:',
  defaultModel: 'default (decided by Claude Code)',
  helpL2Approval: 'L2 Requires Approval:',
  helpL3Admin: 'L3 Admin:',
  helpPrivateNote: '💡 Full commands available in private chat',
  helpGroupNote: '💡 Full commands available in private chat',
  helpCommandsL1: '/help      - Show this help\n/new       - Start new session\n/status    - View status\n/cost      - Cost statistics\n/doctor    - Health check\n/pwd       - Current directory\n/list      - Workspace list\n/history   - History',
  helpCommandsL2: '/cd        - Change directory\n/model     - Switch model\n/resume    - Resume session',
  helpCommandsL3: '/allow     - Allow permission\n/deny      - Deny permission\n/approve   - Approve request\n/reject    - Reject request',
  helpThreadCmd: '/threads    - List thread sessions\n',
  helpStopCmd: '/stop       - Stop current task\n',
  helpStartCmd: '/start      - Start conversation\n',

  // 命令响应
  newSessionStarted: '✅ New session started, previous context will not continue.',
  newSessionNoActive: 'No active session.',
  currentNoSession: 'No active session in current thread.',
  sessionAlreadyCurrent: 'This session is already current.',
  sessionResumed: 'Session resumed: ',
  sessionResumedSuffix: '\nSubsequent messages will continue this session context.',
  invalidSessionIndex: 'Invalid index',
  invalidModelName: '❌ Invalid model name. Model name can only contain letters, numbers, dots, hyphens, and slashes, with a maximum length of 100 characters.',
  modelChanged: 'Model changed to: ',
  currentModel: 'Current model: ',
  usageModel: '\n\nAvailable models: sonnet, opus, haiku or full model name\nUsage: /model <model_name>',
  noHistoryRecord: 'No history records.',
  noThreads: 'No thread session records.',
  threadListTitle: '📋 Thread Sessions (',
  threadListSuffix: '\n\n✓ = Active session | ✗ = No session',
  workingDirectory: 'Current working directory: ',
  subdirectories: '📁 Subdirectories:',
  useCdToSwitch: '\n\nUse /cd <dir_name> to switch',
  invalidIndex: 'Invalid index',
  noProjectRecords: 'No Claude Code workspace records found.',
  projectListTitle: 'Claude Code Workspace List:\n',
  useCdToSwitchPath: '\n\nUse /cd <index> or /cd <path> to switch',
  workdirChanged: 'Working directory changed to: ',
  sessionReset: '\nSession reset.',
  noActiveSession: 'No active session, no need to compact.',
  queueFull: 'Request queue is full, please wait for current task to complete.',
  compactQueued: 'Tasks are being processed, compact request queued.',

  // 费用统计
  costTitle: '💰 Cost Statistics (Since service started):',
  noCostRecord: 'No cost records (since service started).',
  requests: 'Requests',
  totalCost: 'Total cost',
  totalDuration: 'Total duration',
  avgCost: 'Average per request',

  // 状态
  statusTitle: '📊 Claude Code Status:',
  version: 'Version',
  sessionId: 'Session ID',
  skipPermissions: 'Skip permissions',
  timeout: 'Timeout',
  cumulativeCost: 'Cumulative cost',
  noSession: '（none）',
  unknown: 'Unknown',

  // 健康检查
  doctorTitle: '🏥 Claude Code Health Check:',
  cliPath: 'CLI path',
  allowedDirs: 'Allowed base directories',
  activeTasks: 'Active tasks',

  // 命令不可用
  terminalOnlyCommand: 'This command is only available in terminal mode.\n\nInput /help to see available commands.',
  inputHelp: 'Input /help to see available commands.',

  // 管理员
  adminOnly: '⚠️ This command is only for admins.',

  // 审批结果
  approvalSuccess: '✅ Approved: ',
  approvalFailed: '❌ Approval failed: ',
  rejectSuccess: '✅ Rejected: ',
  rejectFailed: '❌ Operation failed: ',
  approvalNotFound: 'not found or already processed',

  // 启动问候语
  greetingTitle: 'Hello! I am your intelligent office assistant.',
  greetingFeatures: '📌 Supported Features:\n• Document writing and polishing\n• Data analysis and reporting\n• Q&A and problem solving',
  greetingCommands: '🔧 Common Commands:\n/new — Start new conversation\n/resume — Resume unfinished conversation\n/model — Switch AI model\n/stop — Stop current task\n/chatid — View current session ID',
  greetingDirectMention: '💬 Just @bot + your question',

  // Telegram /start
  telegramStart: 'Welcome to Claude Code Bot!\n\nSend a message to interact with Claude Code, input /help for help.',

  // 卡片状态标题
  cardStatusProcessing: 'Claude Code - Processing...',
  cardStatusThinking: 'Claude Code - Thinking...',
  cardStatusStreaming: 'Claude Code',
  cardStatusDone: 'Claude Code',
  cardStatusError: 'Claude Code - Error',
  // 权限卡片
  permissionCardTitle: '🔐 Permission Request - ',
  permissionAllowedStatus: 'Allowed ✓',
  permissionDeniedStatus: 'Denied ✗',
  permissionCardContent: '\n\nClick button to confirm:',
  permissionAllowedText: '✅ Operation allowed.',
  permissionDeniedText: '❌ Operation denied.',
  // 按钮
  stopButton: '⏹️ Stop',
  allowButton: '✅ Allow',
  denyButton: '❌ Deny',
  // 状态消息
  waitPlease: 'Please wait',
  thinking: 'Thinking...',
  errorPrefix: 'Error',
  // 任务消息
  taskInProgress: 'Claude task in progress. Click button to stop.',
  taskStoppedByUser: 'Task stopped by user.',
  taskCompleted: 'Task completed',

  // 群聊
  groupGreeting: (botName: string) => `${botName} is online\n\n${en.greetingTitle}\n\n${en.greetingFeatures}\n\n${en.greetingCommands}\n\n${en.greetingDirectMention}\n\n${en.serviceHours}`,
  privateGreeting: (botName: string, activeBots: string, workDir: string, cliVersion: string, skipPerm: boolean) =>
    `${botName} ${en.serviceStarted}\n${en.platform}: ${activeBots}\n${en.workingDir}: ${workDir}\nPermissions: ${skipPerm ? en.permissionsSkipped : en.permissionsEnabled}\nClaude CLI: ${cliVersion}\nNode: ${process.version}`,
  shutdownGreeting: (botName: string, uptime: string) => `🔴 ${botName} ${en.serviceShutdown}...\nUptime: ${uptime}`,
};

/**
 * 语言映射
 */
export const locales: Record<Language, LocaleStrings> = { zh, en };

/**
 * 获取指定语言的本地化字符串
 */
export function t(lang: Language): LocaleStrings {
  return locales[lang] ?? locales.zh;
}
