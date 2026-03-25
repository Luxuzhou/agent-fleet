/**
 * Worker Manager — manages Codex and Gemini workers, auto-dispatches tasks.
 * When fleet_delegate is called, the manager routes the task to the appropriate
 * worker and streams results back via callback.
 */
import { EventEmitter } from 'node:events';
import { appendFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CodexWorker } from './codex-worker.js';
import { GeminiWorker } from './gemini-worker.js';
import type { FleetTask } from '../types.js';

export interface WorkerManagerOptions {
  cwd: string;
  codexPort?: number;
  onProgress: (taskId: string, agent: string, message: string) => void;
  onCompleted: (taskId: string, agent: string, result: string) => void;
  onFailed: (taskId: string, agent: string, error: string) => void;
  onLog: (message: string) => void;
}

export class WorkerManager extends EventEmitter {
  private codex: CodexWorker;
  private gemini: GeminiWorker;
  private opts: WorkerManagerOptions;
  private taskQueue: Map<string, FleetTask> = new Map();

  private geminiLogPath: string;
  private codexLogPath: string;

  constructor(opts: WorkerManagerOptions) {
    super();
    this.opts = opts;
    this.codex = new CodexWorker({ port: opts.codexPort ?? 4500, cwd: opts.cwd });
    this.gemini = new GeminiWorker({ cwd: opts.cwd, allowedMcpServers: [] });

    // Per-worker log files for TUI panes
    this.geminiLogPath = resolve(opts.cwd, '.fleet-gemini.log');
    this.codexLogPath = resolve(opts.cwd, '.fleet-codex.log');
    writeFileSync(this.geminiLogPath, `[gemini] Worker started ${new Date().toISOString()}\n`);
    writeFileSync(this.codexLogPath, `[codex] Worker started ${new Date().toISOString()}\n`);

    // Wire up worker events → log files + callbacks
    this.codex.on('progress', (msg: string) => {
      this.logCodex(`Progress: ${msg}`);
      const task = this.getRunningTask('codex');
      if (task) this.opts.onProgress(task.id, 'codex', msg);
    });
    this.codex.on('log', (msg: string) => { this.logCodex(msg); this.opts.onLog(msg); });

    this.gemini.on('progress', (msg: string) => {
      this.logGemini(`Progress: ${msg}`);
      const task = this.getRunningTask('gemini');
      if (task) this.opts.onProgress(task.id, 'gemini', msg);
    });
    this.gemini.on('log', (msg: string) => { this.logGemini(msg); this.opts.onLog(msg); });
  }

  private logGemini(msg: string): void {
    try { appendFileSync(this.geminiLogPath, `${new Date().toLocaleTimeString()} ${msg}\n`); } catch {}
  }

  private logCodex(msg: string): void {
    try { appendFileSync(this.codexLogPath, `${new Date().toLocaleTimeString()} ${msg}\n`); } catch {}
  }

  async start(): Promise<void> {
    this.opts.onLog('[fleet] Starting Codex app-server...');
    try {
      await this.codex.start();
      this.opts.onLog('[fleet] Codex worker ready');
    } catch (err: any) {
      this.opts.onLog(`[fleet] Codex worker failed: ${err.message}`);
    }

    this.opts.onLog('[fleet] Gemini worker ready (subprocess mode)');
    await this.gemini.start();
  }

  async dispatch(task: FleetTask, context?: string): Promise<void> {
    const agentName = task.agent.toLowerCase();
    this.taskQueue.set(task.id, task);

    this.opts.onLog(`[fleet] Dispatching task ${task.id} to ${agentName}: ${task.description.slice(0, 80)}`);

    // Route to appropriate worker + log
    if (agentName.includes('codex')) {
      this.logCodex(`Task ${task.id}: ${task.description}`);
      this.executeCodex(task, context);
    } else if (agentName.includes('gemini')) {
      this.logGemini(`Task ${task.id}: ${task.description}`);
      this.executeGemini(task, context);
    } else {
      this.opts.onFailed(task.id, agentName, `Unknown worker: ${agentName}`);
    }
  }

  private async executeCodex(task: FleetTask, context?: string): Promise<void> {
    try {
      if (!this.codex.isReady()) {
        this.opts.onFailed(task.id, 'codex', 'Codex worker not ready');
        return;
      }
      const result = await this.codex.executeTask(task.description, context);
      this.taskQueue.delete(task.id);
      this.opts.onCompleted(task.id, 'codex', result);
    } catch (err: any) {
      this.taskQueue.delete(task.id);
      this.opts.onFailed(task.id, 'codex', err.message);
    }
  }

  private async executeGemini(task: FleetTask, context?: string): Promise<void> {
    try {
      const result = await this.gemini.executeTask(task.description, context);
      this.taskQueue.delete(task.id);
      this.opts.onCompleted(task.id, 'gemini', result);
    } catch (err: any) {
      this.taskQueue.delete(task.id);
      this.opts.onFailed(task.id, 'gemini', err.message);
    }
  }

  private getRunningTask(agentPrefix: string): FleetTask | undefined {
    for (const task of this.taskQueue.values()) {
      if (task.agent.toLowerCase().includes(agentPrefix)) return task;
    }
    return undefined;
  }

  async stop(): Promise<void> {
    await this.codex.stop();
    await this.gemini.stop();
  }

  getStatus(): { codex: boolean; gemini: boolean } {
    return {
      codex: this.codex.isReady(),
      gemini: this.gemini.isReady(),
    };
  }
}
