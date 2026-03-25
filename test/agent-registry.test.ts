import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AgentRegistry } from '../src/core/agent-registry.js';

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry(15);
  });

  afterEach(() => {
    registry.dispose();
  });

  describe('register', () => {
    it('registers an orchestrator agent', () => {
      registry.register({ name: 'claude', role: 'orchestrator', sessionId: 'session-1' });
      const agent = registry.get('claude');
      expect(agent?.role).toBe('orchestrator');
      expect(agent?.status).toBe('connected');
    });

    it('registers a worker agent with workerRole', () => {
      registry.register({ name: 'gemini', role: 'worker', workerRole: 'designer', description: 'UI/UX design', sessionId: 'session-2' });
      const agent = registry.get('gemini');
      expect(agent?.workerRole).toBe('designer');
    });

    it('updates session on re-register (reconnect)', () => {
      registry.register({ name: 'gemini', role: 'worker', sessionId: 'session-1' });
      registry.register({ name: 'gemini', role: 'worker', sessionId: 'session-2' });
      expect(registry.get('gemini')?.sessionId).toBe('session-2');
      expect(registry.get('gemini')?.status).toBe('connected');
    });
  });

  describe('disconnect', () => {
    it('marks agent as disconnected', () => {
      registry.register({ name: 'gemini', role: 'worker', sessionId: 'session-1' });
      registry.disconnect('session-1');
      expect(registry.get('gemini')?.status).toBe('disconnected');
    });
  });

  describe('getBySession', () => {
    it('returns agent by session ID', () => {
      registry.register({ name: 'gemini', role: 'worker', sessionId: 'session-2' });
      const agent = registry.getBySession('session-2');
      expect(agent?.name).toBe('gemini');
    });

    it('returns undefined for unknown session', () => {
      expect(registry.getBySession('unknown')).toBeUndefined();
    });
  });

  describe('listConnected', () => {
    it('returns only connected agents', () => {
      registry.register({ name: 'claude', role: 'orchestrator', sessionId: 's1' });
      registry.register({ name: 'gemini', role: 'worker', sessionId: 's2' });
      registry.disconnect('s2');
      const connected = registry.listConnected();
      expect(connected).toHaveLength(1);
      expect(connected[0].name).toBe('claude');
    });
  });

  describe('listWorkers', () => {
    it('returns only worker agents', () => {
      registry.register({ name: 'claude', role: 'orchestrator', sessionId: 's1' });
      registry.register({ name: 'gemini', role: 'worker', sessionId: 's2' });
      registry.register({ name: 'codex', role: 'worker', sessionId: 's3' });
      const workers = registry.listWorkers();
      expect(workers).toHaveLength(2);
    });
  });

  describe('getOrchestratorSession', () => {
    it('returns the orchestrator session ID', () => {
      registry.register({ name: 'claude', role: 'orchestrator', sessionId: 's1' });
      expect(registry.getOrchestratorSession()).toBe('s1');
    });

    it('returns undefined when no orchestrator', () => {
      expect(registry.getOrchestratorSession()).toBeUndefined();
    });
  });

  describe('heartbeat', () => {
    it('updates lastHeartbeat timestamp', () => {
      registry.register({ name: 'gemini', role: 'worker', sessionId: 's1' });
      const before = registry.get('gemini')!.lastHeartbeat;
      registry.heartbeat('s1');
      expect(registry.get('gemini')!.lastHeartbeat).toBeGreaterThanOrEqual(before);
    });
  });
});
