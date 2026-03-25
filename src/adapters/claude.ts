import type { FleetAdapter } from './base.js';
import { which, execAsync } from './base.js';
import type { DetectResult } from '../types.js';

export class ClaudeAdapter implements FleetAdapter {
  name = 'claude';
  cliCommand = 'claude';

  async detect(): Promise<DetectResult> {
    const path = await which('claude');
    if (!path) return { installed: false, authenticated: false };
    try {
      const { stdout } = await execAsync('claude --version');
      return { installed: true, authenticated: true, version: stdout.trim() };
    } catch {
      return { installed: true, authenticated: false };
    }
  }

  async configure(serverUrl: string, _role: string): Promise<void> {
    try {
      // Remove first to make idempotent
      await execAsync('claude mcp remove -s user agent-fleet').catch(() => {});
      await execAsync(`claude mcp add --transport http -s user agent-fleet ${serverUrl}`);
    } catch (e: any) {
      throw new Error(`Failed to configure Claude: ${e.message}`);
    }
  }

  async unconfigure(): Promise<void> {
    try {
      await execAsync('claude mcp remove agent-fleet');
    } catch { /* ignore if not configured */ }
  }

  buildRolePrompt(_role: string, _description: string): string {
    return 'You are the architect and orchestrator of an agent-fleet team. Use fleet_agents to see your team, fleet_delegate to assign tasks, fleet_status and fleet_result to track work.';
  }

  buildLaunchCommand(prompt: string): string[] {
    return ['claude', '-p', prompt];
  }
}
