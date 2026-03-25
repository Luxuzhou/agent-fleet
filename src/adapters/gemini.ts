import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { FleetAdapter } from './base.js';
import { which } from './base.js';
import type { DetectResult } from '../types.js';

export class GeminiAdapter implements FleetAdapter {
  name = 'gemini';
  cliCommand = 'gemini';

  private get settingsPath(): string {
    return join(homedir(), '.gemini', 'settings.json');
  }

  async detect(): Promise<DetectResult> {
    const path = await which('gemini');
    if (!path) return { installed: false, authenticated: false };
    try {
      const settings = JSON.parse(await readFile(this.settingsPath, 'utf-8'));
      return { installed: true, authenticated: true };
    } catch {
      return { installed: true, authenticated: false };
    }
  }

  async configure(serverUrl: string, _role: string): Promise<void> {
    let settings: any = {};
    try {
      settings = JSON.parse(await readFile(this.settingsPath, 'utf-8'));
    } catch { /* file doesn't exist yet */ }
    if (!settings.mcpServers) settings.mcpServers = {};
    settings.mcpServers['agent-fleet'] = {
      url: serverUrl,
      headers: { 'X-Fleet-Role': 'worker', 'X-Fleet-Agent': 'gemini' },
    };
    await writeFile(this.settingsPath, JSON.stringify(settings, null, 2));
  }

  async unconfigure(): Promise<void> {
    try {
      const settings = JSON.parse(await readFile(this.settingsPath, 'utf-8'));
      delete settings.mcpServers?.['agent-fleet'];
      await writeFile(this.settingsPath, JSON.stringify(settings, null, 2));
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
    return ['gemini', '-p', prompt];
  }
}
