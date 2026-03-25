import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { FleetTask, TaskResult, TaskStatus } from '../types.js';

interface CreateTaskInput {
  agent: string;
  description: string;
  timeout: number;
  references?: string[];
  constraints?: string;
  deliverables?: string[];
  upstream?: Record<string, string>;
}

export class TaskQueue extends EventEmitter {
  private tasks = new Map<string, FleetTask>();
  private timeoutChecker: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.timeoutChecker = setInterval(() => this.checkTimeouts(), 1000);
  }

  create(input: CreateTaskInput): FleetTask {
    const now = Date.now();
    const task: FleetTask = {
      id: randomUUID().slice(0, 8),
      agent: input.agent,
      description: input.description,
      status: 'pending',
      references: input.references,
      constraints: input.constraints,
      deliverables: input.deliverables,
      upstream: input.upstream,
      createdAt: now,
      updatedAt: now,
      timeout: input.timeout,
    };
    this.tasks.set(task.id, task);
    this.emit('created', task.id);
    return task;
  }

  get(id: string): FleetTask | undefined {
    return this.tasks.get(id);
  }

  getForAgent(agent: string): FleetTask | null {
    for (const task of this.tasks.values()) {
      if (task.agent === agent && task.status === 'pending') {
        return task;
      }
    }
    return null;
  }

  start(id: string): void {
    const task = this.mustGet(id);
    task.status = 'running';
    task.startedAt = Date.now();
    task.updatedAt = Date.now();
    this.emit('started', id);
  }

  complete(id: string, result: TaskResult): void {
    const task = this.mustGet(id);
    task.status = 'completed';
    task.result = result;
    task.updatedAt = Date.now();
    this.emit('completed', id);
  }

  fail(id: string, reason: string): void {
    const task = this.mustGet(id);
    task.status = 'failed';
    task.progress = `Failed: ${reason}`;
    task.updatedAt = Date.now();
    this.emit('failed', id);
  }

  cancel(id: string): void {
    const task = this.mustGet(id);
    task.status = 'cancelled';
    task.updatedAt = Date.now();
    this.emit('cancelled', id);
  }

  updateProgress(id: string, message: string): void {
    const task = this.mustGet(id);
    task.progress = message;
    task.updatedAt = Date.now();
    this.emit('progress', id, message);
  }

  listAll(): FleetTask[] {
    return Array.from(this.tasks.values());
  }

  dispose(): void {
    if (this.timeoutChecker) {
      clearInterval(this.timeoutChecker);
      this.timeoutChecker = null;
    }
  }

  private mustGet(id: string): FleetTask {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task not found: ${id}`);
    return task;
  }

  private checkTimeouts(): void {
    const now = Date.now();
    for (const task of this.tasks.values()) {
      if (task.status === 'running' && task.startedAt) {
        const elapsed = (now - task.startedAt) / 1000;
        if (elapsed >= task.timeout) {
          this.fail(task.id, 'timeout');
          this.emit('timeout', task.id);
        }
      }
    }
  }
}
