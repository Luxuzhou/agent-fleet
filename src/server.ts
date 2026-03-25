import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { TaskQueue } from './core/task-queue.js';
import { AgentRegistry } from './core/agent-registry.js';
import { ContextBuilder } from './core/context-builder.js';
import { NotificationManager } from './core/notification.js';
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
  const notificationManager = new NotificationManager();

  const sessions = new Map<string, StreamableHTTPServerTransport>();

  // Wire up task events → notifications
  taskQueue.on('completed', (taskId: string) => {
    const orchSession = agentRegistry.getOrchestratorSession();
    notificationManager.notifyOrchestrator(orchSession, 'task_completed', { taskId });
  });
  taskQueue.on('failed', (taskId: string) => {
    const orchSession = agentRegistry.getOrchestratorSession();
    notificationManager.notifyOrchestrator(orchSession, 'task_failed', { taskId });
  });
  taskQueue.on('progress', (taskId: string, message: string) => {
    const orchSession = agentRegistry.getOrchestratorSession();
    notificationManager.notifyOrchestrator(orchSession, 'task_progress', { taskId, message });
  });

  const agentTimeouts: Record<string, number> = {};

  function createMcpServerForSession(sessionIdGetter: () => string | undefined, role: AgentRole, agentName?: string): McpServer {
    const server = new McpServer({
      name: 'agent-fleet',
      version: '0.1.0',
    });

    if (role === 'orchestrator') {
      registerOrchestratorTools(server, { taskQueue, agentRegistry, contextBuilder, agentTimeouts });
    } else {
      registerWorkerTools(server, { taskQueue, contextBuilder, sessionId: sessionIdGetter, agentRegistry });
    }

    // Register MCP prompts for workers
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
                'Call fleet_poll to receive tasks. When you get a task, call fleet_context for full context.',
                'Execute the task using your full capabilities (read/write files, run commands).',
                'Report progress via fleet_progress. Submit results via fleet_submit.',
                'After submitting, call fleet_poll again for your next task.',
              ].join('\n'),
            },
          }],
        })
      );
    }

    return server;
  }

  // POST /mcp — handles JSON-RPC requests
  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId && sessions.has(sessionId)) {
      const transport = sessions.get(sessionId)!;
      agentRegistry.heartbeat(sessionId);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // New session — must be an initialize request
    if (!isInitializeRequest(req.body)) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID' },
        id: null,
      });
      return;
    }

    // Determine role from client info
    // CLIs don't send metadata.role, so detect by name:
    // 'claude' or 'claude-code' → orchestrator, everything else → worker
    let role: AgentRole = 'worker';
    let agentName = 'unknown';
    const ci = req.body?.params?.clientInfo as any;
    if (ci) {
      agentName = ci.metadata?.agent ?? ci.name ?? 'unknown';
      const isOrchestrator = ci.metadata?.role === 'orchestrator'
        || agentName.toLowerCase().includes('claude');
      role = isOrchestrator ? 'orchestrator' : 'worker';
    }

    // Create transport
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
      },
    });

    // Handle disconnect
    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) {
        agentRegistry.disconnect(sid);
        sessions.delete(sid);
      }
    };

    // Create role-specific MCP server and connect
    const mcpServer = createMcpServerForSession(() => transport.sessionId, role, agentName);
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // GET /mcp — SSE stream
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

  // DELETE /mcp — end session
  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      await sessions.get(sessionId)!.handleRequest(req, res);
    } else {
      res.status(400).send('Invalid or missing session ID');
    }
  });

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      agents: agentRegistry.listConnected().length,
      tasks: taskQueue.listAll().length,
    });
  });

  // Start server
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
    notificationManager,
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
