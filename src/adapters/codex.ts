import type { FleetAdapter } from './base.js';
import { which, execAsync } from './base.js';
import type { DetectResult } from '../types.js';

export class CodexAdapter implements FleetAdapter {
  name = 'codex';
  cliCommand = 'codex';

  async detect(): Promise<DetectResult> {
    const path = await which('codex');
    if (!path) return { installed: false, authenticated: false };
    try {
      const { stdout } = await execAsync('codex --version');
      return { installed: true, authenticated: true, version: stdout.trim() };
    } catch {
      return { installed: true, authenticated: false };
    }
  }

  async configure(serverUrl: string, _role: string): Promise<void> {
    try {
      await execAsync('codex mcp remove agent-fleet').catch(() => {});
      await execAsync(`codex mcp add agent-fleet -- curl ${serverUrl}`);
    } catch (e: any) {
      throw new Error(`Failed to configure Codex: ${e.message}`);
    }
  }

  async unconfigure(): Promise<void> {
    try {
      await execAsync('codex mcp remove agent-fleet');
    } catch { /* ignore */ }
  }

  buildRolePrompt(role: string, description: string): string {
    return `You are the ${role} in an agent-fleet team. Specialization: ${description}. Call fleet_poll to get tasks, fleet_context for context, fleet_progress to report, fleet_submit when done.`;
  }

  buildLaunchCommand(prompt: string): string[] {
    return ['codex', prompt];
  }
}
