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

  const server = await createFleetServer({
    port: config.server.port,
    heartbeatInterval: config.server.heartbeat_interval,
    projectDir,
  });

  console.log(`✓ MCP server listening on http://localhost:${server.port}`);

  if (options.serverOnly) {
    console.log('Server-only mode. Connect CLIs manually.');
    return;
  }

  // Build panes: left=Claude, top-right=Gemini, bottom-right=Codex
  // No prompt injection — CLIs launch bare, fleet tools auto-available via MCP config
  const panes = [
    { name: 'claude', command: ['claude'], title: 'Claude_Architect' },
  ];

  // Add configured worker agents
  const agentNames = Object.keys(config.agents);
  for (const name of agentNames) {
    panes.push({
      name,
      command: [config.agents[name].cli],
      title: `${name}_${config.agents[name].role}`,
    });
  }

  const terminalType = options.terminal ?? detectTerminal();
  console.log(`✓ Launching ${panes.length}-pane layout via ${terminalType}...`);

  switch (terminalType) {
    case 'wt': launchWt(panes, projectDir); break;
    case 'tmux': launchTmux(panes, projectDir); break;
    default: launchFallback(panes, projectDir); break;
  }

  console.log('✓ All panes launched. Fleet is ready.');
  console.log('  Press Ctrl+C to stop the server.');

  process.on('SIGINT', async () => {
    console.log('\nShutting down fleet...');
    await server.close();
    process.exit(0);
  });
}
