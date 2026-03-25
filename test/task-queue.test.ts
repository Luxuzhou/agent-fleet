import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TaskQueue } from '../src/core/task-queue.js';

describe('TaskQueue', () => {
  let queue: TaskQueue;

  beforeEach(() => {
    queue = new TaskQueue();
  });

  afterEach(() => {
    queue.dispose();
  });

  describe('create', () => {
    it('creates a task with pending status', () => {
      const task = queue.create({
        agent: 'gemini',
        description: 'Design login page',
        timeout: 300,
      });
      expect(task.id).toBeDefined();
      expect(task.status).toBe('pending');
      expect(task.agent).toBe('gemini');
    });

    it('generates unique IDs', () => {
      const t1 = queue.create({ agent: 'gemini', description: 'Task 1', timeout: 300 });
      const t2 = queue.create({ agent: 'codex', description: 'Task 2', timeout: 300 });
      expect(t1.id).not.toBe(t2.id);
    });
  });

  describe('getForAgent', () => {
    it('returns oldest pending task for agent', () => {
      queue.create({ agent: 'gemini', description: 'Task 1', timeout: 300 });
      queue.create({ agent: 'gemini', description: 'Task 2', timeout: 300 });
      queue.create({ agent: 'codex', description: 'Task 3', timeout: 300 });

      const task = queue.getForAgent('gemini');
      expect(task?.description).toBe('Task 1');
    });

    it('returns null when no pending tasks', () => {
      const task = queue.getForAgent('gemini');
      expect(task).toBeNull();
    });

    it('skips tasks already running', () => {
      const t1 = queue.create({ agent: 'gemini', description: 'Task 1', timeout: 300 });
      queue.start(t1.id);

      const task = queue.getForAgent('gemini');
      expect(task).toBeNull();
    });
  });

  describe('start', () => {
    it('moves task from pending to running', () => {
      const t = queue.create({ agent: 'gemini', description: 'Task 1', timeout: 300 });
      queue.start(t.id);
      expect(queue.get(t.id)?.status).toBe('running');
    });

    it('throws if task not found', () => {
      expect(() => queue.start('nonexistent')).toThrow();
    });
  });

  describe('complete', () => {
    it('moves task to completed with result', () => {
      const t = queue.create({ agent: 'gemini', description: 'Task 1', timeout: 300 });
      queue.start(t.id);
      queue.complete(t.id, { result: 'Done', filesChanged: ['login.html'] });

      const task = queue.get(t.id);
      expect(task?.status).toBe('completed');
      expect(task?.result?.result).toBe('Done');
    });
  });

  describe('fail', () => {
    it('moves task to failed with reason', () => {
      const t = queue.create({ agent: 'gemini', description: 'Task 1', timeout: 300 });
      queue.start(t.id);
      queue.fail(t.id, 'timeout');

      const task = queue.get(t.id);
      expect(task?.status).toBe('failed');
    });
  });

  describe('cancel', () => {
    it('moves pending task to cancelled', () => {
      const t = queue.create({ agent: 'gemini', description: 'Task 1', timeout: 300 });
      queue.cancel(t.id);
      expect(queue.get(t.id)?.status).toBe('cancelled');
    });

    it('moves running task to cancelled', () => {
      const t = queue.create({ agent: 'gemini', description: 'Task 1', timeout: 300 });
      queue.start(t.id);
      queue.cancel(t.id);
      expect(queue.get(t.id)?.status).toBe('cancelled');
    });
  });

  describe('progress', () => {
    it('updates progress on running task', () => {
      const t = queue.create({ agent: 'gemini', description: 'Task 1', timeout: 300 });
      queue.start(t.id);
      queue.updateProgress(t.id, 'Working on layout...');
      expect(queue.get(t.id)?.progress).toBe('Working on layout...');
    });
  });

  describe('listAll', () => {
    it('returns all tasks', () => {
      queue.create({ agent: 'gemini', description: 'Task 1', timeout: 300 });
      queue.create({ agent: 'codex', description: 'Task 2', timeout: 300 });
      expect(queue.listAll()).toHaveLength(2);
    });
  });

  describe('timeout', () => {
    it('emits timeout event for expired running tasks (based on startedAt, not updatedAt)', () => {
      vi.useFakeTimers();
      // Create a fresh queue AFTER fake timers so setInterval is captured
      const timedQueue = new TaskQueue();
      const onTimeout = vi.fn();
      timedQueue.on('timeout', onTimeout);

      const t = timedQueue.create({ agent: 'gemini', description: 'Task 1', timeout: 1 }); // 1 second
      timedQueue.start(t.id);

      // Progress updates should NOT reset the timeout clock
      vi.advanceTimersByTime(500);
      timedQueue.updateProgress(t.id, 'still working...');

      vi.advanceTimersByTime(1500); // total 2s > 1s timeout, measured from startedAt
      expect(onTimeout).toHaveBeenCalledWith(t.id);
      expect(timedQueue.get(t.id)?.status).toBe('failed');

      timedQueue.dispose();
      vi.useRealTimers();
    });
  });
});
