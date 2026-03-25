/**
 * Codex Worker — connects to codex app-server via WebSocket.
 * Injects tasks as user messages, streams responses back.
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
  private currentResponse = '';
  private ready = false;

  constructor(options: CodexWorkerOptions = {}) {
    super();
    this.port = options.port ?? 4500;
    this.cwd = options.cwd ?? process.cwd();
  }

  async start(): Promise<void> {
    // Start codex app-server
    const wsUrl = `ws://127.0.0.1:${this.port}`;
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

    // Connect WebSocket
    this.ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WebSocket connection timeout')), 10000);
      this.ws!.on('open', () => {
        clearTimeout(timeout);
        this.setupMessageHandler();
        this.ready = true;
        this.emit('ready');
        resolve();
      });
      this.ws!.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
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

  private setupMessageHandler(): void {
    this.ws!.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch {
        // ignore non-JSON
      }
    });
  }

  private handleMessage(msg: any): void {
    const method = msg.method;

    if (method === 'thread/started' || method === 'thread/created') {
      this.threadId = msg.params?.thread?.id ?? msg.params?.id;
      this.emit('log', `[codex] Thread: ${this.threadId}`);
    }

    if (method === 'turn/started') {
      this.currentResponse = '';
      this.emit('progress', 'Codex is working...');
    }

    if (method === 'item/agentMessage/delta') {
      const delta = msg.params?.delta?.text ?? msg.params?.delta ?? '';
      this.currentResponse += delta;
      // Emit progress every ~200 chars
      if (this.currentResponse.length % 200 < delta.length) {
        this.emit('progress', this.currentResponse.slice(-200));
      }
    }

    if (method === 'turn/completed') {
      this.emit('completed', this.currentResponse);
      this.currentResponse = '';
    }

    if (method === 'item/completed' && msg.params?.item?.type === 'agentMessage') {
      // Individual message completed (may have multiple in a turn)
    }
  }

  async executeTask(task: string, context?: string): Promise<string> {
    if (!this.ready || !this.ws) {
      throw new Error('Codex worker not ready');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Codex task timeout (10 min)')), 600000);

      const fullPrompt = context ? `${context}\n\n${task}` : task;

      // Listen for completion
      const onCompleted = (result: string) => {
        clearTimeout(timeout);
        this.removeListener('completed', onCompleted);
        resolve(result);
      };
      this.on('completed', onCompleted);

      // Send turn/start with the task
      this.ws!.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'turn/start',
        id: Date.now(),
        params: {
          thread_id: this.threadId,
          message: fullPrompt,
        },
      }));
    });
  }

  async stop(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.appServer) {
      this.appServer.kill();
      this.appServer = null;
    }
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }
}
