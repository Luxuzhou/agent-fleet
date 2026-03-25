/**
 * Gemini Worker — runs gemini CLI in headless mode as subprocess.
 * Spawns `gemini -p "task" -o stream-json` per task, captures JSON stream.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

interface GeminiWorkerOptions {
  cwd?: string;
  allowedMcpServers?: string[];
}

export class GeminiWorker extends EventEmitter {
  private cwd: string;
  private allowedMcpServers: string[];
  private currentProcess: ChildProcess | null = null;
  private ready = true; // Always ready — spawns per task

  constructor(options: GeminiWorkerOptions = {}) {
    super();
    this.cwd = options.cwd ?? process.cwd();
    this.allowedMcpServers = options.allowedMcpServers ?? [];
  }

  async start(): Promise<void> {
    this.ready = true;
    this.emit('ready');
  }

  async executeTask(task: string, context?: string): Promise<string> {
    const fullPrompt = context ? `Context:\n${context}\n\nTask:\n${task}` : task;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.currentProcess) {
          this.currentProcess.kill();
          this.currentProcess = null;
        }
        reject(new Error('Gemini task timeout (5 min)'));
      }, 300000);

      // Quote prompt for shell: true — otherwise spaces split it into positional args
      const args = ['-p', `"${fullPrompt.replace(/"/g, '\\"')}"`, '-o', 'stream-json', '-y'];

      // Only load fleet-related MCP servers for speed
      if (this.allowedMcpServers.length > 0) {
        args.push('--allowed-mcp-server-names', ...this.allowedMcpServers);
      }

      this.currentProcess = spawn('gemini', args, {
        cwd: this.cwd,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let output = '';
      let lastContent = '';

      this.currentProcess.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);

            if (msg.type === 'message' && msg.role === 'assistant') {
              lastContent = msg.content ?? '';
              output += lastContent + '\n';
              this.emit('progress', lastContent.slice(0, 200));
            }

            if (msg.type === 'result') {
              // Final result
              this.emit('log', `[gemini] Completed: ${msg.stats?.total_tokens ?? '?'} tokens`);
            }
          } catch {
            // Non-JSON line (MCP loading logs etc.), ignore
          }
        }
      });

      this.currentProcess.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg && !msg.includes('MCP') && !msg.includes('Registering')) {
          this.emit('log', `[gemini] ${msg}`);
        }
      });

      this.currentProcess.on('close', (code) => {
        clearTimeout(timeout);
        this.currentProcess = null;

        if (code === 0) {
          resolve(output.trim() || lastContent);
        } else {
          reject(new Error(`Gemini exited with code ${code}`));
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

  isReady(): boolean {
    return this.ready;
  }
}
