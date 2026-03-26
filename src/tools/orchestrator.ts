import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskQueue } from '../core/task-queue.js';
import type { AgentRegistry } from '../core/agent-registry.js';
import type { ContextBuilder } from '../core/context-builder.js';

export interface OrchestratorDeps {
  taskQueue: TaskQueue;
  agentRegistry: AgentRegistry;
  contextBuilder: ContextBuilder;
  agentTimeouts?: Record<string, number>;
}

export function registerOrchestratorTools(server: McpServer, deps: OrchestratorDeps): void {
  const { taskQueue, agentRegistry } = deps;

  server.tool(
    'fleet_delegate',
    'Delegate a task to a worker agent (Gemini, Codex, etc.)',
    {
      agent: z.string().describe('Target agent name (e.g. "gemini", "codex")'),
      task: z.string().describe('Task description'),
      references: z.array(z.string()).optional().describe('File paths to include as context'),
      constraints: z.string().optional().describe('Additional constraints'),
      deliverables: z.array(z.string()).optional().describe('Expected output files'),
      upstream: z.record(z.string()).optional().describe('Results from prior tasks'),
    },
    async (params) => {
      const agent = agentRegistry.get(params.agent);
      if (!agent || agent.status !== 'connected') {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `Agent "${params.agent}" is not connected` }) }],
          isError: true,
        };
      }

      const timeout = deps.agentTimeouts?.[params.agent] ?? 300;

      const task = taskQueue.create({
        agent: params.agent,
        description: params.task,
        timeout,
        references: params.references,
        constraints: params.constraints,
        deliverables: params.deliverables,
        upstream: params.upstream,
      });

      // Block until task completes or fails — return clean natural language
      const result = await new Promise<string>((resolve) => {
        const checkDone = () => {
          const t = taskQueue.get(task.id);
          if (!t) { resolve('Error: task disappeared'); return; }
          if (t.status === 'completed') {
            const files = t.result?.filesChanged?.length
              ? `\nFiles changed: ${t.result.filesChanged.join(', ')}`
              : '';
            resolve(`${t.agent} completed the task.\n\nResult:\n${t.result?.result ?? '(no output)'}${files}`);
          } else if (t.status === 'failed' || t.status === 'cancelled') {
            resolve(`${t.agent} failed: ${t.progress ?? 'unknown error'}`);
          } else {
            // Still running — check again in 1s
            setTimeout(checkDone, 1000);
          }
        };
        checkDone();
      });

      return {
        content: [{ type: 'text' as const, text: result }],
      };
    }
  );

  server.tool(
    'fleet_status',
    'Query status of tasks. Omit task_id to get all tasks.',
    {
      task_id: z.string().optional().describe('Specific task ID, or omit for all tasks'),
    },
    async (params) => {
      if (params.task_id) {
        const task = taskQueue.get(params.task_id);
        if (!task) {
          return { content: [{ type: 'text' as const, text: 'Task not found.' }], isError: true };
        }
        return {
          content: [{ type: 'text' as const, text: `Task ${task.id} (${task.agent}): ${task.status}${task.progress ? ' — ' + task.progress : ''}` }],
        };
      }
      const tasks = taskQueue.listAll();
      if (tasks.length === 0) return { content: [{ type: 'text' as const, text: 'No tasks yet.' }] };
      const lines = tasks.map(t => `• ${t.id} → ${t.agent}: ${t.status}${t.progress ? ' — ' + t.progress : ''}`);
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'fleet_result',
    'Get the result of a completed task.',
    { task_id: z.string().describe('Task ID') },
    async (params) => {
      const task = taskQueue.get(params.task_id);
      if (!task) {
        return { content: [{ type: 'text' as const, text: 'Task not found.' }], isError: true };
      }
      if (task.status !== 'completed') {
        return { content: [{ type: 'text' as const, text: `Task is ${task.status}, not completed yet.` }], isError: true };
      }
      const files = task.result?.filesChanged?.length ? `\nFiles: ${task.result.filesChanged.join(', ')}` : '';
      return {
        content: [{ type: 'text' as const, text: `${task.result?.result ?? '(no output)'}${files}` }],
      };
    }
  );

  server.tool(
    'fleet_agents',
    'List all agents and their roles.',
    {},
    async () => {
      const agents = agentRegistry.listAll();
      if (agents.length === 0) return { content: [{ type: 'text' as const, text: 'No agents connected.' }] };
      const lines = agents.map(a => `• ${a.name} (${a.workerRole ?? a.role}) — ${a.status}`);
      return { content: [{ type: 'text' as const, text: `Your team:\n${lines.join('\n')}` }] };
    }
  );

  server.tool(
    'fleet_cancel',
    'Cancel a pending or running task.',
    { task_id: z.string().describe('Task ID to cancel') },
    async (params) => {
      try {
        taskQueue.cancel(params.task_id);
        return { content: [{ type: 'text' as const, text: 'Task cancelled.' }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Failed to cancel: ${e.message}` }], isError: true };
      }
    }
  );
}
