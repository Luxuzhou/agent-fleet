#!/usr/bin/env node
/**
 * Channel Bridge — stdio MCP server for Claude Code with Channel push support.
 *
 * This runs as a Claude Code MCP subprocess (stdio transport).
 * It declares the `claude/channel` experimental capability so that
 * notifications/claude/channel messages appear directly in Claude's conversation.
 *
 * Internally connects to the fleet HTTP server to relay orchestrator tools
 * and receive task events for Channel push.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as http from 'node:http';

const FLEET_URL = process.env.FLEET_URL || 'http://127.0.0.1:4600/mcp';
const url = new URL(FLEET_URL);

let fleetSessionId: string | null = null;

// === HTTP client (bypasses proxy) ===

function httpPost(body: string, sessionId?: string | null): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Content-Length': Buffer.byteLength(body).toString(),
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function fleetRequest(method: string, params: Record<string, unknown> = {}, id?: number): Promise<any> {
  const body: any = { jsonrpc: '2.0', method, params };
  if (id !== undefined) body.id = id;

  const res = await httpPost(JSON.stringify(body), fleetSessionId);
  const newSession = res.headers['mcp-session-id'];
  if (newSession) {
    fleetSessionId = Array.isArray(newSession) ? newSession[0] : newSession;
  }

  if (res.body.trim()) {
    try { return JSON.parse(res.body); } catch { return null; }
  }
  return null;
}

async function callFleetTool(toolName: string, args: Record<string, unknown>): Promise<any> {
  const res = await fleetRequest('tools/call', { name: toolName, arguments: args }, Date.now());
  return res?.result;
}

// === MCP Server with Channel capability ===

const server = new Server(
  { name: 'agent-fleet-channel', version: '0.1.0' },
  {
    capabilities: {
      experimental: { 'claude/channel': {} },
      tools: {},
    },
    instructions: [
      'You are the architect and orchestrator of an agent-fleet team.',
      'Use fleet_delegate to assign tasks to your team (gemini for design, codex for code).',
      'Use fleet_agents to see connected agents, fleet_status to check progress.',
      'Task updates from workers will appear as <channel> notifications — respond to them naturally.',
      'When a worker completes a task, you can review the result and delegate follow-up work.',
    ].join('\n'),
  }
);

// === Expose fleet orchestrator tools ===

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'fleet_delegate',
      description: 'Delegate a task to a worker agent (gemini, codex, etc.)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          agent: { type: 'string', description: 'Target agent name (e.g. "gemini", "codex-mcp-client")' },
          task: { type: 'string', description: 'Task description' },
          references: { type: 'array', items: { type: 'string' }, description: 'File paths for context' },
          constraints: { type: 'string', description: 'Additional constraints' },
          deliverables: { type: 'array', items: { type: 'string' }, description: 'Expected output files' },
        },
        required: ['agent', 'task'],
      },
    },
    {
      name: 'fleet_status',
      description: 'Check task status. Omit task_id for all tasks.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          task_id: { type: 'string', description: 'Specific task ID, or omit for all' },
        },
      },
    },
    {
      name: 'fleet_result',
      description: 'Get completed task result.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          task_id: { type: 'string', description: 'Task ID' },
        },
        required: ['task_id'],
      },
    },
    {
      name: 'fleet_agents',
      description: 'List all connected agents and their roles.',
      inputSchema: { type: 'object' as const, properties: {} },
    },
    {
      name: 'fleet_cancel',
      description: 'Cancel a pending or running task.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          task_id: { type: 'string', description: 'Task ID to cancel' },
        },
        required: ['task_id'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    const result = await callFleetTool(name, (args ?? {}) as Record<string, unknown>);
    return result ?? { content: [{ type: 'text', text: '{}' }] };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
      isError: true,
    };
  }
});

// === Poll fleet server for task events and push via Channel ===

let lastTaskStates = new Map<string, string>();

async function pollAndPush(): Promise<void> {
  try {
    const statusResult = await callFleetTool('fleet_status', {});
    if (!statusResult?.content?.[0]?.text) return;

    const data = JSON.parse(statusResult.content[0].text);
    const tasks = data.tasks ?? [];

    for (const task of tasks) {
      const prevState = lastTaskStates.get(task.id);

      if (prevState !== task.status) {
        // State changed — push Channel notification
        let message = '';
        if (task.status === 'completed') {
          // Fetch result
          const resultData = await callFleetTool('fleet_result', { task_id: task.id });
          const resultText = resultData?.content?.[0]?.text ?? '';
          message = `[${task.agent}] Task ${task.id} completed: ${resultText.slice(0, 500)}`;
        } else if (task.status === 'failed') {
          message = `[${task.agent}] Task ${task.id} failed: ${task.progress ?? 'unknown'}`;
        } else if (task.status === 'running' && prevState === 'pending') {
          message = `[${task.agent}] Task ${task.id} started: ${task.description}`;
        }

        if (message) {
          process.stderr.write(`[channel-bridge] Pushing: ${message.slice(0, 100)}\n`);
          await server.notification({
            method: 'notifications/claude/channel',
            params: { content: message },
          });
        }
      }

      lastTaskStates.set(task.id, task.status);
    }
  } catch (err: any) {
    process.stderr.write(`[channel-bridge] Poll error: ${err.message}\n`);
  }
}

// === Initialize and start ===

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Initialize fleet session (as orchestrator)
  await fleetRequest('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: {
      name: 'claude-code',
      version: '1.0.0',
      metadata: { role: 'orchestrator', agent: 'claude-code' },
    },
  }, 1);
  await fleetRequest('notifications/initialized');

  // Start polling for task state changes → Channel push
  setInterval(pollAndPush, 2000);
}

main().catch((err) => {
  process.stderr.write(`[channel-bridge] Fatal: ${err.message}\n`);
  process.exit(1);
});
