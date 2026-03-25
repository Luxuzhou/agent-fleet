import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskQueue } from '../src/core/task-queue.js';
import { AgentRegistry } from '../src/core/agent-registry.js';

describe('Orchestrator Tools (unit logic)', () => {
  let taskQueue: TaskQueue;
  let agentRegistry: AgentRegistry;

  beforeEach(() => {
    taskQueue = new TaskQueue();
    agentRegistry = new AgentRegistry(15);
    agentRegistry.register({ name: 'gemini', role: 'worker', workerRole: 'designer', sessionId: 's1' });
  });

  afterEach(() => {
    taskQueue.dispose();
    agentRegistry.dispose();
  });

  it('fleet_delegate creates a pending task for connected agent', () => {
    const task = taskQueue.create({ agent: 'gemini', description: 'Design login', timeout: 300 });
    expect(task.status).toBe('pending');
    expect(task.agent).toBe('gemini');
  });

  it('fleet_delegate should reject if agent not connected', () => {
    const agent = agentRegistry.get('nonexistent');
    expect(agent).toBeUndefined();
  });

  it('fleet_status returns all tasks with status', () => {
    taskQueue.create({ agent: 'gemini', description: 'Task 1', timeout: 300 });
    taskQueue.create({ agent: 'gemini', description: 'Task 2', timeout: 300 });
    const tasks = taskQueue.listAll();
    expect(tasks).toHaveLength(2);
  });

  it('fleet_result returns completed task result', () => {
    const t = taskQueue.create({ agent: 'gemini', description: 'Design', timeout: 300 });
    taskQueue.start(t.id);
    taskQueue.complete(t.id, { result: 'Done', filesChanged: ['a.html'] });
    const task = taskQueue.get(t.id);
    expect(task?.status).toBe('completed');
    expect(task?.result?.result).toBe('Done');
  });

  it('fleet_result rejects non-completed task', () => {
    const t = taskQueue.create({ agent: 'gemini', description: 'Design', timeout: 300 });
    expect(taskQueue.get(t.id)?.status).toBe('pending');
  });

  it('fleet_agents returns all agents with status', () => {
    agentRegistry.register({ name: 'codex', role: 'worker', sessionId: 's2' });
    const all = agentRegistry.listAll();
    expect(all).toHaveLength(2);
    expect(all.map(a => a.name)).toContain('gemini');
    expect(all.map(a => a.name)).toContain('codex');
  });

  it('fleet_cancel cancels a running task', () => {
    const t = taskQueue.create({ agent: 'gemini', description: 'Design', timeout: 300 });
    taskQueue.start(t.id);
    taskQueue.cancel(t.id);
    expect(taskQueue.get(t.id)?.status).toBe('cancelled');
  });
});
