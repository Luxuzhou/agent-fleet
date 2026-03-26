/**
 * Codex Worker — connects to codex app-server via WebSocket.
 * Protocol: initialize → thread/start → turn/start(input) → stream deltas → turn/completed
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';

interface CodexWorkerOptions {
  port?: number;
  cwd?: string;
}

export class CodexWorker extends EventEmitter {
  private ws: WebSocket | null = null;
  private appServer: ChildProcess | null = null;
  private port: number;
  private cwd: string;
  private threadId: string | null = null;
  private ready = false;

  constructor(options: CodexWorkerOptions = {}) {
    super();
    this.port = options.port ?? 4500;
    this.cwd = options.cwd ?? process.cwd();
  }

  async start(): Promise<void> {
    const wsUrl = `ws://127.0.0.1:${this.port}`;

    // Start codex app-server
    this.appServer = spawn('codex', ['app-server', '--listen', wsUrl], {
      cwd: this.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });

    this.appServer.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) this.emit('log', `[codex-server] ${msg}`);
    });

    // Wait for server to be ready
    await this.waitForServer(wsUrl);

    // Connect and initialize
    this.ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WebSocket connect timeout')), 10000);
      this.ws!.on('open', () => {
        clearTimeout(timeout);
        resolve();
      });
      this.ws!.on('error', (err) => { clearTimeout(timeout); reject(err); });
    });

    // Step 1: Initialize
    const initResult = await this.rpcCall('initialize', {
      clientInfo: { name: 'agent-fleet', version: '0.1.0' },
    });
    this.emit('log', `[codex] Initialized: ${initResult?.userAgent ?? 'ok'}`);

    // Step 2: Create thread
    const threadResult = await this.rpcCall('thread/start', {});
    this.threadId = threadResult?.thread?.id;
    this.emit('log', `[codex] Thread: ${this.threadId}`);

    this.ready = true;
    this.emit('ready');
  }

  private async waitForServer(wsUrl: string): Promise<void> {
    for (let i = 0; i < 30; i++) {
      try {
        await new Promise<void>((resolve, reject) => {
          const testWs = new WebSocket(wsUrl);
          const timer = setTimeout(() => { testWs.close(); reject(new Error('timeout')); }, 1000);
          testWs.on('open', () => { clearTimeout(timer); testWs.close(); resolve(); });
          testWs.on('error', () => { clearTimeout(timer); reject(new Error('not ready')); });
        });
        return;
      } catch {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    throw new Error('Codex app-server failed to start within 30s');
  }

  private rpcId = 0;

  private rpcCall(method: string, params: Record<string, unknown>): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.rpcId;
      const timeout = setTimeout(() => reject(new Error(`RPC timeout: ${method}`)), 15000);

      const handler = (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.id === id) {
            clearTimeout(timeout);
            this.ws!.removeListener('message', handler);
            if (msg.error) reject(new Error(msg.error.message));
            else resolve(msg.result);
          }
        } catch {}
      };

      this.ws!.on('message', handler);
      this.ws!.send(JSON.stringify({ jsonrpc: '2.0', method, id, params }));
    });
  }

  async executeTask(task: string, context?: string): Promise<string> {
    if (!this.ready || !this.ws || !this.threadId) {
      throw new Error('Codex worker not ready');
    }

    const fullPrompt = context ? `Context:\n${context}\n\nTask: ${task}` : task;

    // Start a turn
    const turnResult = await this.rpcCall('turn/start', {
      threadId: this.threadId,
      input: [{ type: 'text', text: fullPrompt }],
    });
    const turnId = turnResult?.turn?.id;

    // Stream response — collect agentMessage deltas until turn/completed
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.ws!.removeListener('message', handler);
        reject(new Error('Codex task timeout (10 min)'));
      }, 600000);

      let response = '';

      const handler = (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.method === 'item/agentMessage/delta') {
            const delta = msg.params?.delta ?? '';
            response += delta;
            // Emit progress periodically
            if (response.length % 100 < delta.length) {
              this.emit('progress', response.slice(-150));
            }
          }

          if (msg.method === 'turn/completed') {
            clearTimeout(timeout);
            this.ws!.removeListener('message', handler);
            this.emit('log', `[codex] Turn completed: ${response.length} chars`);
            resolve(response || '(no output)');
          }

          if (msg.method === 'error') {
            this.emit('log', `[codex] Error: ${msg.params?.error?.message}`);
          }
        } catch {}
      };

      this.ws!.on('message', handler);
    });
  }

  async stop(): Promise<void> {
    if (this.ws) { this.ws.close(); this.ws = null; }
    if (this.appServer) { this.appServer.kill(); this.appServer = null; }
    this.ready = false;
  }

  isReady(): boolean { return this.ready; }
}
