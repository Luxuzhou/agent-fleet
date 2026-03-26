/**
 * Codex Worker — runs codex exec as subprocess per task (like GeminiWorker).
 * Simpler and more reliable than app-server WebSocket.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

interface CodexWorkerOptions {
  cwd?: string;
}

export class CodexWorker extends EventEmitter {
  private cwd: string;
  private currentProcess: ChildProcess | null = null;
  private ready = true;

  constructor(options: CodexWorkerOptions = {}) {
    super();
    this.cwd = options.cwd ?? process.cwd();
  }

  async start(): Promise<void> {
    this.ready = true;
    this.emit('ready');
  }

  async executeTask(task: string, context?: string): Promise<string> {
    const fullPrompt = context ? `Context:\n${context}\n\nTask: ${task}` : task;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.currentProcess) {
          this.currentProcess.kill();
          this.currentProcess = null;
        }
        reject(new Error('Codex task timeout (10 min)'));
      }, 600000);

      // Use codex exec for non-interactive execution
      this.currentProcess = spawn('codex', ['exec', fullPrompt], {
        cwd: this.cwd,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let output = '';

      this.currentProcess.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        output += chunk;
        // Emit progress
        const lastLine = chunk.trim().split('\n').pop() ?? '';
        if (lastLine) this.emit('progress', lastLine.slice(0, 200));
      });

      this.currentProcess.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) this.emit('log', `[codex] ${msg}`);
      });

      this.currentProcess.on('close', (code) => {
        clearTimeout(timeout);
        this.currentProcess = null;

        if (code === 0) {
          this.emit('log', `[codex] Task completed: ${output.length} chars`);
          resolve(output.trim() || '(completed with no output)');
        } else {
          reject(new Error(`Codex exited with code ${code}`));
        }
      });

      this.currentProcess.on('error', (err) => {
        clearTimeout(timeout);
        this.currentProcess = null;
        reject(err);
      });
    });
  }

  async stop(): Promise<void> {
    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
    }
    this.ready = false;
  }

  isReady(): boolean { return this.ready; }
}
