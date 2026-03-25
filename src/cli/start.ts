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

  // Write live log file for worker output
  const logPath = resolve(projectDir, '.fleet-workers.log');
  const { writeFileSync, appendFileSync } = await import('node:fs');
  writeFileSync(logPath, `[fleet] Worker log started at ${new Date().toISOString()}\n`);

  // Redirect worker manager logs to file
  if (server.workerManager) {
    const origLog = console.log;
    const origOnLog = server.workerManager['opts'].onLog;
    server.workerManager['opts'].onLog = (msg: string) => {
      origOnLog(msg);
      try { appendFileSync(logPath, msg + '\n'); } catch {}
    };
  }

  // Build panes: left=Claude, top-right=Gemini log, bottom-right=Codex log
  const panes = [
    { name: 'claude', command: ['claude'], title: 'Claude_Architect' },
    { name: 'gemini-log', command: ['powershell', '-Command', `Get-Content -Path "${logPath}" -Wait | Select-String "gemini|Gemini|fleet"`], title: 'Gemini_Worker' },
    { name: 'codex-log', command: ['powershell', '-Command', `Get-Content -Path "${logPath}" -Wait | Select-String "codex|Codex|fleet"`], title: 'Codex_Worker' },
  ];

  const terminalType = options.terminal ?? detectTerminal();
  console.log(`✓ Launching ${panes.length}-pane layout via ${terminalType}...`);

  switch (terminalType) {
    case 'wt': launchWt(panes, projectDir); break;
    case 'tmux': launchTmux(panes, projectDir); break;
    default: launchFallback(panes, projectDir); break;
  }

  console.log('✓ Fleet ready:');
  console.log('  Left:  Claude (orchestrator — use fleet_delegate to assign tasks)');
  console.log('  Right: Live worker logs (Gemini top, Codex bottom)');
  console.log('  Workers execute automatically — no manual input needed.');

  console.log('  Press Ctrl+C to stop the server.');

  process.on('SIGINT', async () => {
    console.log('\nShutting down fleet...');
    await server.close();
    process.exit(0);
  });
}
