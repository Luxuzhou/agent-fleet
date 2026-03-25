import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { DetectResult } from '../types.js';

export const execAsync = promisify(exec);

export interface FleetAdapter {
  name: string;
  cliCommand: string;
  detect(): Promise<DetectResult>;
  configure(serverUrl: string, role: string): Promise<void>;
  unconfigure(): Promise<void>;
  buildRolePrompt(role: string, description: string): string;
  buildLaunchCommand(prompt: string): string[];
}

export async function which(command: string): Promise<string | null> {
  try {
    const cmd = process.platform === 'win32' ? `where ${command}` : `which ${command}`;
    const { stdout } = await execAsync(cmd);
    return stdout.trim().split('\n')[0] || null;
  } catch {
    return null;
  }
}
