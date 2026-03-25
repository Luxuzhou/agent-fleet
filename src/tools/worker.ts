import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TaskQueue } from '../core/task-queue.js';
import type { ContextBuilder } from '../core/context-builder.js';
import type { AgentRegistry } from '../core/agent-registry.js';

export interface WorkerDeps {
  taskQueue: TaskQueue;
  contextBuilder: ContextBuilder;
  sessionId: string;
  agentRegistry: AgentRegistry;
}

export function registerWorkerTools(_server: McpServer, _deps: WorkerDeps): void {
  // Stub — implemented in Task 7
}
