/**
 * Worker Manager — manages Codex and Gemini workers, auto-dispatches tasks.
 * When fleet_delegate is called, the manager routes the task to the appropriate
 * worker and streams results back via callback.
 */
import { EventEmitter } from 'node:events';
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

  constructor(opts: WorkerManagerOptions) {
    super();
    this.opts = opts;
    this.codex = new CodexWorker({ port: opts.codexPort ?? 4500, cwd: opts.cwd });
    this.gemini = new GeminiWorker({ cwd: opts.cwd, allowedMcpServers: [] });

    // Wire up worker events
    this.codex.on('progress', (msg: string) => {
      const task = this.getRunningTask('codex');
      if (task) this.opts.onProgress(task.id, 'codex', msg);
    });
    this.codex.on('log', (msg: string) => this.opts.onLog(msg));

    this.gemini.on('progress', (msg: string) => {
      const task = this.getRunningTask('gemini');
      if (task) this.opts.onProgress(task.id, 'gemini', msg);
    });
    this.gemini.on('log', (msg: string) => this.opts.onLog(msg));
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

    // Route to appropriate worker
    if (agentName.includes('codex')) {
      this.executeCodex(task, context);
    } else if (agentName.includes('gemini')) {
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
