import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as yaml from 'js-yaml';
import { createFleetServer } from '../server.js';
import { detectTerminal, type TerminalType } from '../launcher/detect.js';
import { launchWt } from '../launcher/wt.js';
import { launchTmux } from '../launcher/tmux.js';
import { launchFallback } from '../launcher/fallback.js';
import type { FleetConfig } from '../types.js';

interface StartOptions {
  serverOnly?: boolean;
  terminal?: TerminalType;
  auto?: boolean; // v2: auto-dispatch mode (no worker TUI panes needed)
}

export async function runStart(projectDir: string, options: StartOptions): Promise<void> {
  const configPath = resolve(projectDir, 'fleet.yaml');
  let config: FleetConfig;
  try {
    const raw = await readFile(configPath, 'utf-8');
    config = yaml.load(raw) as FleetConfig;
  } catch {
    console.error('fleet.yaml not found. Run `agent-fleet init` first.');
    process.exit(1);
  }

  // v2 auto mode: enable worker manager for direct dispatch
  const enableWorkers = options.auto ?? true;

  const server = await createFleetServer({
    port: config.server.port,
    heartbeatInterval: config.server.heartbeat_interval,
    projectDir,
    enableWorkers,
  });

  console.log(`✓ MCP server listening on http://localhost:${server.port}`);

  if (enableWorkers) {
    const status = server.workerManager?.getStatus();
    console.log(`✓ Workers: Codex ${status?.codex ? '✓' : '✗'} | Gemini ${status?.gemini ? '✓' : '✗'}`);
    console.log('✓ Auto-dispatch mode: tasks delegated by Claude will execute automatically');
  }

  if (options.serverOnly) {
    console.log('Server ready. Claude connects via channel-bridge MCP.');
    console.log('Press Ctrl+C to stop.');
    return;
  }

  // Panes: Claude interactive, Gemini interactive, Codex live log (app-server is headless)
  const codexLog = resolve(projectDir, '.fleet-codex.log');

  const panes = [
    { name: 'claude', command: ['claude'], title: 'Claude_Architect' },
    { name: 'gemini', command: ['gemini'], title: 'Gemini_Designer' },
    { name: 'codex-log', command: ['powershell', `Get-Content "${codexLog}" -Wait -Tail 50`], title: 'Codex_Developer' },
  ];

  const terminalType = options.terminal ?? detectTerminal();
  console.log(`✓ Launching ${panes.length}-pane layout via ${terminalType}...`);

  switch (terminalType) {
    case 'wt': launchWt(panes, projectDir); break;
    case 'tmux': launchTmux(panes, projectDir); break;
    default: launchFallback(panes, projectDir); break;
  }

  console.log('✓ Fleet ready:');
  console.log('  Left:  Claude — just tell it what you want to build');
  console.log('  Right: Gemini (interactive) + Codex (auto-dispatch)');

  console.log('  Press Ctrl+C to stop the server.');

  process.on('SIGINT', async () => {
    console.log('\nShutting down fleet...');
    await server.close();
    process.exit(0);
  });
}
