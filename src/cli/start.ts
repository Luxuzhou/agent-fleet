import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as yaml from 'js-yaml';
import { createFleetServer } from '../server.js';
import { detectTerminal, type TerminalType } from '../launcher/detect.js';
import { launchWt } from '../launcher/wt.js';
import { launchTmux } from '../launcher/tmux.js';
import { launchFallback } from '../launcher/fallback.js';
import { ClaudeAdapter } from '../adapters/claude.js';
import { GeminiAdapter } from '../adapters/gemini.js';
import { CodexAdapter } from '../adapters/codex.js';
import type { FleetConfig } from '../types.js';
import type { FleetAdapter } from '../adapters/base.js';

interface StartOptions {
  serverOnly?: boolean;
  layout?: string;
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

  const adapterMap: Record<string, FleetAdapter> = {
    claude: new ClaudeAdapter(),
    gemini: new GeminiAdapter(),
    codex: new CodexAdapter(),
  };

  const paneMapping = config.layout?.panes ?? {
    'top-left': 'claude',
    'top-right': 'claude',
    'bottom-left': 'codex',
    'bottom-right': 'gemini',
  };

  const paneOrder = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  const panes = [];

  for (const position of paneOrder) {
    const agentName = paneMapping[position];
    if (!agentName) continue;

    const adapter = adapterMap[agentName];
    if (!adapter) continue;

    const agentConfig = config.agents[agentName];
    const isOrchestrator = agentName === 'claude' && position === 'top-left';

    const prompt = isOrchestrator
      ? adapter.buildRolePrompt('orchestrator', 'Architecture and team orchestration')
      : adapter.buildRolePrompt(agentConfig?.role ?? agentName, agentConfig?.description ?? '');

    panes.push({
      name: agentName,
      command: adapter.buildLaunchCommand(prompt),
      title: `${agentName} (${isOrchestrator ? 'Architect' : agentConfig?.role ?? agentName})`,
    });
  }

  const terminalType = options.terminal ?? detectTerminal();
  console.log(`✓ Launching ${panes.length}-pane layout via ${terminalType}...`);

  switch (terminalType) {
    case 'wt': launchWt(panes); break;
    case 'tmux': launchTmux(panes); break;
    default: launchFallback(panes); break;
  }

  console.log('✓ All panes launched. Fleet is ready.');

  process.on('SIGINT', async () => {
    console.log('\nShutting down fleet...');
    await server.close();
    process.exit(0);
  });
}
