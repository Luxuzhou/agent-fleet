import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import type { FleetAdapter } from './base.js';
import { which } from './base.js';
import type { DetectResult } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

  async configure(_serverUrl: string, _role: string): Promise<void> {
    // Use stdio bridge instead of HTTP URL to bypass system proxies
    const bridgePath = join(__dirname, '..', 'stdio-bridge.js');

    let settings: any = {};
    try {
      settings = JSON.parse(await readFile(this.settingsPath, 'utf-8'));
    } catch { /* file doesn't exist yet */ }
    if (!settings.mcpServers) settings.mcpServers = {};
    settings.mcpServers['agent-fleet'] = {
      command: 'node',
      args: [bridgePath],
      env: { FLEET_URL: _serverUrl },
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
    return `You are the ${role} in an agent-fleet team. Specialization: ${description}. Call fleet_poll to get tasks, fleet_context for context, fleet_progress to report, fleet_submit when done.`;
  }

  buildLaunchCommand(prompt: string): string[] {
    return ['gemini', '-p', prompt];
  }
}
