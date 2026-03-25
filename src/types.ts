// === Task Types ===

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface FleetTask {
  id: string;
  agent: string;
  description: string;
  status: TaskStatus;
  references?: string[];
  constraints?: string;
  deliverables?: string[];
  upstream?: Record<string, string>;
  progress?: string;
  result?: TaskResult;
  createdAt: number;
  startedAt?: number;
  updatedAt: number;
  timeout: number;
}

export interface TaskResult {
  result: string;
  filesChanged?: string[];
}

// === Agent Types ===

export type AgentRole = 'orchestrator' | 'worker';

export interface AgentInfo {
  name: string;
  role: AgentRole;
  workerRole?: string; // "designer", "developer", etc.
  description?: string;
  sessionId: string;
  status: 'connected' | 'disconnected';
  connectedAt: number;
  lastHeartbeat: number;
}

// === Session Types ===

export interface SessionInfo {
  id: string;
  agentName: string;
  role: AgentRole;
  connectedAt: number;
}

// === Config Types ===

export interface FleetConfig {
  version: number;
  server: {
    port: number;
    heartbeat_interval: number;
  };
  agents: Record<string, AgentConfig>;
  layout?: LayoutConfig;
}

export interface AgentConfig {
  role: string;
  cli: string;
  prompt_flag?: string;
  description?: string;
  timeout?: number;
}

export interface LayoutConfig {
  style: 'quad' | 'triple' | 'horizontal' | 'vertical';
  panes: Record<string, string>;
}

// === Adapter Types ===

export interface DetectResult {
  installed: boolean;
  authenticated: boolean;
  version?: string;
}

// === Notification Types ===

export type NotificationType =
  | 'task_created'
  | 'task_started'
  | 'task_progress'
  | 'task_completed'
  | 'task_failed'
  | 'task_cancelled'
  | 'agent_connected'
  | 'agent_disconnected';

export interface FleetNotification {
  type: NotificationType;
  taskId?: string;
  agent?: string;
  message?: string;
  timestamp: number;
}
