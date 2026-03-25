import { EventEmitter } from 'node:events';
import type { AgentInfo, AgentRole } from '../types.js';

interface RegisterInput {
  name: string;
  role: AgentRole;
  workerRole?: string;
  description?: string;
  sessionId: string;
}

export class AgentRegistry extends EventEmitter {
  private agents = new Map<string, AgentInfo>();
  private sessionToAgent = new Map<string, string>();
  private heartbeatChecker: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeout: number;
  private disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private gracePeriodMs = 60_000;

  constructor(heartbeatIntervalSec: number) {
    super();
    this.heartbeatTimeout = heartbeatIntervalSec * 3 * 1000;
    // Disabled: MCP clients don't send heartbeats, rely on transport.onclose instead
    this.heartbeatChecker = null;
  }

  register(input: RegisterInput): void {
    const now = Date.now();
    const existing = this.agents.get(input.name);

    if (existing) {
      this.sessionToAgent.delete(existing.sessionId);
      const timer = this.disconnectTimers.get(input.name);
      if (timer) {
        clearTimeout(timer);
        this.disconnectTimers.delete(input.name);
      }
    }

    const agent: AgentInfo = {
      name: input.name,
      role: input.role,
      workerRole: input.workerRole,
      description: input.description,
      sessionId: input.sessionId,
      status: 'connected',
      connectedAt: existing?.connectedAt ?? now,
      lastHeartbeat: now,
    };

    this.agents.set(input.name, agent);
    this.sessionToAgent.set(input.sessionId, input.name);
    this.emit('connected', input.name);
  }

  disconnect(sessionId: string): void {
    const agentName = this.sessionToAgent.get(sessionId);
    if (!agentName) return;
    const agent = this.agents.get(agentName);
    if (!agent) return;

    agent.status = 'disconnected';
    this.emit('disconnecting', agentName);

    const timer = setTimeout(() => {
      const current = this.agents.get(agentName);
      if (current && current.status === 'disconnected') {
        this.disconnectTimers.delete(agentName);
        this.emit('disconnected', agentName);
      }
    }, this.gracePeriodMs);

    this.disconnectTimers.set(agentName, timer);
  }

  get(name: string): AgentInfo | undefined {
    return this.agents.get(name);
  }

  getBySession(sessionId: string): AgentInfo | undefined {
    const name = this.sessionToAgent.get(sessionId);
    if (!name) return undefined;
    return this.agents.get(name);
  }

  getOrchestratorSession(): string | undefined {
    for (const agent of this.agents.values()) {
      if (agent.role === 'orchestrator' && agent.status === 'connected') {
        return agent.sessionId;
      }
    }
    return undefined;
  }

  listAll(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  listConnected(): AgentInfo[] {
    return Array.from(this.agents.values()).filter(a => a.status === 'connected');
  }

  listWorkers(): AgentInfo[] {
    return Array.from(this.agents.values()).filter(a => a.role === 'worker');
  }

  heartbeat(sessionId: string): void {
    const name = this.sessionToAgent.get(sessionId);
    if (!name) return;
    const agent = this.agents.get(name);
    if (agent) {
      agent.lastHeartbeat = Date.now();
    }
  }

  dispose(): void {
    if (this.heartbeatChecker) {
      clearInterval(this.heartbeatChecker);
      this.heartbeatChecker = null;
    }
    for (const timer of this.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.disconnectTimers.clear();
  }

  private checkHeartbeats(): void {
    const now = Date.now();
    for (const agent of this.agents.values()) {
      if (agent.status === 'connected' && (now - agent.lastHeartbeat) > this.heartbeatTimeout) {
        agent.status = 'disconnected';
        this.emit('disconnected', agent.name);
      }
    }
  }
}
