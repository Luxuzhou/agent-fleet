import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { FleetAdapter } from './base.js';
import { which } from './base.js';
import type { DetectResult } from '../types.js';

const execFileAsync = promisify(execFile);

export class ClaudeAdapter implements FleetAdapter {
  name = 'claude';
  cliCommand = 'claude';

  async detect(): Promise<DetectResult> {
    const path = await which('claude');
    if (!path) return { installed: false, authenticated: false };
    try {
      const { stdout } = await execFileAsync('claude', ['--version']);
      return { installed: true, authenticated: true, version: stdout.trim() };
    } catch {
      return { installed: true, authenticated: false };
    }
  }

  async configure(serverUrl: string, _role: string): Promise<void> {
    try {
      await execFileAsync('claude', ['mcp', 'add', 'agent-fleet', '--transport', 'http', '--url', serverUrl]);
    } catch (e: any) {
      throw new Error(`Failed to configure Claude: ${e.message}`);
    }
  }

  async unconfigure(): Promise<void> {
    try {
      await execFileAsync('claude', ['mcp', 'remove', 'agent-fleet']);
    } catch { /* ignore if not configured */ }
  }

  buildRolePrompt(_role: string, _description: string): string {
    return [
      'You are the architect and orchestrator of an agent-fleet team.',
      'Use fleet_agents to see your team members. Use fleet_delegate to assign tasks.',
      'Use fleet_status and fleet_result to track and review work.',
      'You can delegate design tasks to the designer and implementation tasks to the developer.',
    ].join('\n');
  }

  buildLaunchCommand(prompt: string): string[] {
    return ['claude', '-p', prompt];
  }
}
