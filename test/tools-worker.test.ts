import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskQueue } from '../src/core/task-queue.js';

describe('Worker Tools (unit logic)', () => {
  let taskQueue: TaskQueue;

  beforeEach(() => {
    taskQueue = new TaskQueue();
  });

  afterEach(() => {
    taskQueue.dispose();
  });

  it('poll returns pending task for the agent', () => {
    taskQueue.create({ agent: 'gemini', description: 'Design login', timeout: 300 });
    const task = taskQueue.getForAgent('gemini');
    expect(task).not.toBeNull();
    expect(task?.description).toBe('Design login');
  });

  it('poll starts the task when picked up', () => {
    const t = taskQueue.create({ agent: 'gemini', description: 'Design login', timeout: 300 });
    taskQueue.start(t.id);
    expect(taskQueue.get(t.id)?.status).toBe('running');
  });

  it('submit completes the task with result', () => {
    const t = taskQueue.create({ agent: 'gemini', description: 'Design login', timeout: 300 });
    taskQueue.start(t.id);
    taskQueue.complete(t.id, { result: 'Created login.html', filesChanged: ['login.html'] });
    expect(taskQueue.get(t.id)?.status).toBe('completed');
  });
});
