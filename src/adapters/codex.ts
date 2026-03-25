import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { FleetAdapter } from './base.js';
import { which } from './base.js';
import type { DetectResult } from '../types.js';

const execFileAsync = promisify(execFile);

export class CodexAdapter implements FleetAdapter {
  name = 'codex';
  cliCommand = 'codex';

  async detect(): Promise<DetectResult> {
    const path = await which('codex');
    if (!path) return { installed: false, authenticated: false };
    try {
      const { stdout } = await execFileAsync('codex', ['--version']);
      return { installed: true, authenticated: true, version: stdout.trim() };
    } catch {
      return { installed: true, authenticated: false };
    }
  }

  async configure(serverUrl: string, _role: string): Promise<void> {
    try {
      await execFileAsync('codex', ['mcp', 'add', 'agent-fleet', '--', 'curl', serverUrl]);
    } catch (e: any) {
      throw new Error(`Failed to configure Codex: ${e.message}`);
    }
  }

  async unconfigure(): Promise<void> {
    try {
      await execFileAsync('codex', ['mcp', 'remove', 'agent-fleet']);
    } catch { /* ignore */ }
  }

  buildRolePrompt(role: string, description: string): string {
    return [
      `You are the ${role} in an agent-fleet team.`,
      `Your specialization: ${description}`,
      'Call fleet_poll to receive your first task.',
      'When you receive a task, call fleet_context for full context.',
      'Execute the task using your full capabilities (read/write files, run commands).',
      'Report progress via fleet_progress.',
      'Submit results via fleet_submit when done, then fleet_poll again for next task.',
    ].join('\n');
  }

  buildLaunchCommand(prompt: string): string[] {
    return ['codex', '-q', prompt];
  }
}
