import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TaskQueue } from '../core/task-queue.js';
import type { AgentRegistry } from '../core/agent-registry.js';
import type { ContextBuilder } from '../core/context-builder.js';

export interface OrchestratorDeps {
  taskQueue: TaskQueue;
  agentRegistry: AgentRegistry;
  contextBuilder: ContextBuilder;
  agentTimeouts?: Record<string, number>;
}

export function registerOrchestratorTools(_server: McpServer, _deps: OrchestratorDeps): void {
  // Stub — implemented in Task 6
}
