/**
 * MCP Mode CLI Entry Point (standalone)
 * Starts the MCP server with WeCom connection (NO Bridge AI)
 * Use this when you only want MCP tools without the AI chat
 */

import { loadConfig } from '../config.js';
import { initLogger, createLogger, closeLogger } from '../logger.js';
import { initWecom, stopWecom } from '../wecom/client.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpBridgeTools, registerWecomMessageHandler } from './server.js';
import { loadActiveChats } from '../shared/active-chats.js';

const log = createLogger('McpCli');

export async function startMcpMode(): Promise<void> {
  const config = loadConfig();
  initLogger(config.logDir, config.logLevel);
  loadActiveChats();

  log.info('Starting cc-im MCP mode (standalone, no AI)...');

  if (!config.enabledPlatforms.includes('wecom')) {
    log.error('WeCom is not enabled. Please configure WECOM_BOT_ID and WECOM_BOT_SECRET.');
    process.exit(1);
  }

  try {
    const { wsClient } = await initWecom(config, (client) => {
      // Register MCP message handler
      registerWecomMessageHandler(client);
      return {
        stop: () => {},
        getRunningTaskCount: () => 0,
      };
    });

    log.info('WeCom connected successfully');

    // Create MCP tools
    const { tools, handlers } = createMcpBridgeTools({ wecom: wsClient });

    // Start MCP server on stdio
    log.info('Starting MCP server on stdio...');
    const server = new McpServer(
      { name: 'cc-im', version: '1.6.0' },
      { capabilities: { tools: {} } }
    );

    // Register tools
    for (const tool of tools) {
      server.registerTool(
        tool.name,
        { description: tool.description, inputSchema: tool.inputSchema as any },
        async (args: any) => {
        const handler = (handlers as any)[tool.name];
        if (handler) {
          return await handler(args);
        }
        return { content: [{ type: 'text', text: `Unknown tool: ${tool.name}` }], isError: true };
      });
    }

    // Connect MCP to stdio
    const transport = new StdioServerTransport();
    await server.connect(transport as any);
    log.info('MCP server running on stdio');

    process.on('SIGINT', async () => {
      log.info('Shutting down MCP mode...');
      stopWecom();
      closeLogger();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      log.info('Shutting down MCP mode...');
      stopWecom();
      closeLogger();
      process.exit(0);
    });
  } catch (err) {
    log.error('Failed to start MCP mode:', err);
    closeLogger();
    process.exit(1);
  }
}
