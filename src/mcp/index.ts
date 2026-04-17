/**
 * MCP Module Index
 */

export { createMcpBridgeTools, registerWecomMessageHandler, registerFeishuMessageHandler, registerTelegramMessageHandler } from './server.js';
export { enqueueMessage } from './server.js';
export { router } from './router.js';
export { router as messageRouter } from './router.js';
export type { McpRoutingTable, Platform } from './server.js';
export type { ChatInfo, Message } from './router.js';
