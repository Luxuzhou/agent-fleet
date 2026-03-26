import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskQueue } from '../core/task-queue.js';
import type { ContextBuilder } from '../core/context-builder.js';
import type { AgentRegistry } from '../core/agent-registry.js';

export interface WorkerDeps {
  taskQueue: TaskQueue;
  contextBuilder: ContextBuilder;
  sessionId: string | (() => string | undefined);
  agentRegistry: AgentRegistry;
}

export function registerWorkerTools(server: McpServer, deps: WorkerDeps): void {
  const { taskQueue, contextBuilder, agentRegistry } = deps;
  const getSessionId = typeof deps.sessionId === 'function' ? deps.sessionId : () => deps.sessionId as string;

  server.tool(
    'fleet_poll',
    'Check for pending tasks. BLOCKS up to 30s waiting for a task. Always call this again after completing a task.',
    {},
    async () => {
      const agent = agentRegistry.getBySession(getSessionId() ?? '');
      if (!agent) {
        return { content: [{ type: 'text' as const, text: 'Error: agent not registered. Reconnect and try again.' }], isError: true };
      }

      // Long-polling: wait up to 30 seconds for a task
      const task = await new Promise<ReturnType<typeof taskQueue.getForAgent>>((resolve) => {
        // Check immediately first
        const immediate = taskQueue.getForAgent(agent.name);
        if (immediate) { resolve(immediate); return; }

        // Set up listener for new tasks
        const timeout = setTimeout(() => {
          taskQueue.removeListener('created', onCreated);
          resolve(null);
        }, 30000);

        const onCreated = (taskId: string) => {
          const t = taskQueue.get(taskId);
          if (t && t.agent === agent.name && t.status === 'pending') {
            clearTimeout(timeout);
            taskQueue.removeListener('created', onCreated);
            resolve(t);
          }
        };

        taskQueue.on('created', onCreated);
      });

      if (!task) {
        return { content: [{ type: 'text' as const, text: 'No task yet. Call fleet_poll again to keep listening.' }] };
      }

      // Auto-start the task
      taskQueue.start(task.id);

      return {
        content: [{ type: 'text' as const, text: `New task assigned!\n\nTask ID: ${task.id}\nDescription: ${task.description}${task.constraints ? '\nConstraints: ' + task.constraints : ''}${task.deliverables?.length ? '\nDeliverables: ' + task.deliverables.join(', ') : ''}\n\nExecute this task now. When done, call fleet_submit with task_id "${task.id}" and your result.` }],
      };
    }
  );

  server.tool(
    'fleet_context',
    'Get full context for a task: referenced files, upstream results, constraints.',
    { task_id: z.string().describe('Task ID') },
    async (params) => {
      const task = taskQueue.get(params.task_id);
      if (!task) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Task not found' }) }], isError: true };
      }

      const ctx = await contextBuilder.build({
        references: task.references,
        constraints: task.constraints,
        upstream: task.upstream,
      });

      return { content: [{ type: 'text' as const, text: JSON.stringify(ctx) }] };
    }
  );

  server.tool(
    'fleet_progress',
    'Report progress on your current task.',
    {
      task_id: z.string().describe('Task ID'),
      message: z.string().describe('Progress message'),
    },
    async (params) => {
      try {
        taskQueue.updateProgress(params.task_id, params.message);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ acknowledged: true }) }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ acknowledged: false, error: e.message }) }], isError: true };
      }
    }
  );

  server.tool(
    'fleet_submit',
    'Submit your completed task result. After submitting, call fleet_poll for your next task.',
    {
      task_id: z.string().describe('Task ID'),
      result: z.string().describe('Task result summary'),
      files_changed: z.array(z.string()).optional().describe('List of files created or modified'),
    },
    async (params) => {
      if (!params.result.trim()) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ acknowledged: false, error: 'Result cannot be empty' }) }], isError: true };
      }

      try {
        taskQueue.complete(params.task_id, {
          result: params.result,
          filesChanged: params.files_changed,
        });
        return {
          content: [{ type: 'text' as const, text: 'Task submitted successfully. Now call fleet_poll immediately to wait for your next task.' }],
        };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ acknowledged: false, error: e.message }) }], isError: true };
      }
    }
  );
}
