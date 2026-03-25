import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { TaskQueue } from './core/task-queue.js';
import { AgentRegistry } from './core/agent-registry.js';
import { ContextBuilder } from './core/context-builder.js';
import { registerOrchestratorTools } from './tools/orchestrator.js';
import { registerWorkerTools } from './tools/worker.js';
import type { AgentRole } from './types.js';

interface ServerOptions {
  port: number;
  heartbeatInterval?: number;
  projectDir?: string;
}

export async function createFleetServer(options: ServerOptions) {
  const app = express();
  app.use(express.json());

  const taskQueue = new TaskQueue();
  const agentRegistry = new AgentRegistry(options.heartbeatInterval ?? 15);
  const contextBuilder = new ContextBuilder(options.projectDir ?? process.cwd());

  const sessions = new Map<string, StreamableHTTPServerTransport>();
  const agentTimeouts: Record<string, number> = {};

  // === Channel Push: send real-time notifications via transport.send() ===

  function pushToSession(sessionId: string, method: string, params: Record<string, unknown>): void {
    const transport = sessions.get(sessionId);
    if (!transport) return;
    try {
      transport.send({
        jsonrpc: '2.0',
        method,
        params,
      });
    } catch (err: any) {
      console.log(`[fleet] Push failed to session ${sessionId}: ${err.message}`);
    }
  }

  function pushToOrchestrator(method: string, params: Record<string, unknown>): void {
    const orchSession = agentRegistry.getOrchestratorSession();
    if (!orchSession) return;
    pushToSession(orchSession, method, params);
  }

  function pushToWorker(agentName: string, method: string, params: Record<string, unknown>): void {
    const agent = agentRegistry.get(agentName);
    if (!agent) return;
    pushToSession(agent.sessionId, method, params);
  }

  // Channel notification for Claude Code — appears directly in conversation
  function pushChannelToOrchestrator(message: string): void {
    pushToOrchestrator('notifications/claude/channel', {
      channel: 'agent-fleet',
      message,
    });
    console.log(`[fleet] Channel → orchestrator: ${message}`);
  }

  // === Wire task events to Channel push ===

  taskQueue.on('created', (taskId: string) => {
    const task = taskQueue.get(taskId);
    if (!task) return;
    // Push to assigned worker: new task available
    pushToWorker(task.agent, 'notifications/fleet/task_assigned', {
      taskId,
      description: task.description,
    });
    console.log(`[fleet] Push → ${task.agent}: task ${taskId} assigned`);
  });

  taskQueue.on('completed', (taskId: string) => {
    const task = taskQueue.get(taskId);
    if (!task) return;
    const result = task.result?.result ?? '';
    const files = task.result?.filesChanged ?? [];
    pushChannelToOrchestrator(
      `[${task.agent}] Task ${taskId} completed: ${result.slice(0, 200)}${files.length ? ` (files: ${files.join(', ')})` : ''}`
    );
  });

  taskQueue.on('failed', (taskId: string) => {
    const task = taskQueue.get(taskId);
    if (!task) return;
    pushChannelToOrchestrator(
      `[${task.agent}] Task ${taskId} failed: ${task.progress ?? 'unknown reason'}`
    );
  });

  taskQueue.on('progress', (taskId: string, message: string) => {
    const task = taskQueue.get(taskId);
    if (!task) return;
    pushChannelToOrchestrator(
      `[${task.agent}] Progress on ${taskId}: ${message}`
    );
  });

  agentRegistry.on('connected', (agentName: string) => {
    const agent = agentRegistry.get(agentName);
    if (!agent) return;
    pushChannelToOrchestrator(
      `Agent "${agentName}" connected as ${agent.workerRole ?? agent.role}`
    );
  });

  agentRegistry.on('disconnected', (agentName: string) => {
    pushChannelToOrchestrator(`Agent "${agentName}" disconnected`);
  });

  // === MCP Server factory ===

  function createMcpServerForSession(sessionIdGetter: () => string | undefined, role: AgentRole, _agentName?: string): McpServer {
    const server = new McpServer({
      name: 'agent-fleet',
      version: '0.1.0',
    });

    if (role === 'orchestrator') {
      registerOrchestratorTools(server, { taskQueue, agentRegistry, contextBuilder, agentTimeouts });
    } else {
      registerWorkerTools(server, { taskQueue, contextBuilder, sessionId: sessionIdGetter, agentRegistry });
    }

    if (role === 'worker') {
      server.prompt(
        'fleet-worker-role',
        'Your role instructions as a fleet worker agent',
        async () => ({
          messages: [{
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: [
                'You are a worker in an agent-fleet team.',
                'You will receive task notifications automatically via Channel push.',
                'When notified of a task, call fleet_poll to accept it, then fleet_context for details.',
                'Execute the task, report progress via fleet_progress, submit via fleet_submit.',
              ].join('\n'),
            },
          }],
        })
      );
    }

    return server;
  }

  // === HTTP endpoints ===

  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId && sessions.has(sessionId)) {
      const transport = sessions.get(sessionId)!;
      agentRegistry.heartbeat(sessionId);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (!isInitializeRequest(req.body)) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID' },
        id: null,
      });
      return;
    }

    let role: AgentRole = 'worker';
    let agentName = 'unknown';
    const ci = req.body?.params?.clientInfo as any;
    if (ci) {
      agentName = ci.metadata?.agent ?? ci.name ?? 'unknown';
      const isOrchestrator = ci.metadata?.role === 'orchestrator'
        || agentName.toLowerCase().includes('claude');
      role = isOrchestrator ? 'orchestrator' : 'worker';
    }

    console.log(`[fleet] New connection: agent=${agentName}, role=${role}`);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (newSessionId: string) => {
        sessions.set(newSessionId, transport);
        agentRegistry.register({
          name: agentName,
          role,
          workerRole: role === 'worker' ? agentName : undefined,
          sessionId: newSessionId,
        });
        console.log(`[fleet] Session ready: agent=${agentName}, session=${newSessionId}`);
      },
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) {
        agentRegistry.disconnect(sid);
        sessions.delete(sid);
        console.log(`[fleet] Disconnected: agent=${agentName}`);
      }
    };

    const mcpServer = createMcpServerForSession(() => transport.sessionId, role, agentName);
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    const transport = sessions.get(sessionId)!;
    agentRegistry.heartbeat(sessionId);
    await transport.handleRequest(req, res);
  });

  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      await sessions.get(sessionId)!.handleRequest(req, res);
    } else {
      res.status(400).send('Invalid or missing session ID');
    }
  });

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      agents: agentRegistry.listConnected().length,
      tasks: taskQueue.listAll().length,
    });
  });

  const httpServer: HttpServer = await new Promise((resolve, reject) => {
    const s = app.listen(options.port, () => resolve(s));
    s.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${options.port} is already in use. Kill the existing process or change the port in fleet.yaml.`));
      } else {
        reject(err);
      }
    });
  });

  const actualPort = (httpServer.address() as { port: number }).port;

  return {
    port: actualPort,
    httpServer,
    taskQueue,
    agentRegistry,
    async close() {
      taskQueue.dispose();
      agentRegistry.dispose();
      for (const transport of sessions.values()) {
        await transport.close?.();
      }
      sessions.clear();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
