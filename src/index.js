#!/usr/bin/env node
/**
 * SkillPulse MCP Server
 *
 * Track your Claude Code skills. See usage patterns, identify unused skills.
 * Analytics stored at: ~/.claude/skills/pulse.jsonl
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Tools } from './handlers.js';

// Create server
const server = new Server(
  {
    name: 'skillpulse',
    version: '1.0.0',
  },
  {
    capabilities: {},
  }
);

// List tools - compound structure, self-documenting
server.setRequestHandler('tools/list', async () => ({
  tools: Tools.map(({ name, description, schema }) => ({
    name,
    description,
    inputSchema: schema,
  })),
}));

// Handle tool calls - delegate to respective handler
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;
  const tool = Tools.find((t) => t.name === name);

  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  // Support both sync and async handlers
  const result = tool.handle(args);
  return result instanceof Promise ? await result : result;
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Claude Skill Analytics MCP Server running');
}

main().catch(console.error);
