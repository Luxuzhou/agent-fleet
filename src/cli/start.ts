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

  const server = await createFleetServer({
    port: config.server.port,
    heartbeatInterval: config.server.heartbeat_interval,
    projectDir,
  });

  console.log(`✓ MCP server listening on http://localhost:${server.port}`);

  if (options.serverOnly) {
    console.log('Server ready. Claude connects via channel-bridge MCP.');
    console.log('Press Ctrl+C to stop.');
    return;
  }

  // Write fleet instructions to project CLAUDE.md (append, don't overwrite)
  const { existsSync, readFileSync, writeFileSync } = await import('node:fs');
  const claudeMdPath = resolve(projectDir, 'CLAUDE.md');
  const fleetMarker = '<!-- agent-fleet -->';
  const fleetInstructions = `
${fleetMarker}
## Agent Fleet Mode

You have a team of AI agents available via the agent-fleet MCP tools. **DO NOT use brainstorming skills, superpowers, or other built-in skills for implementation tasks.** Instead:

- For ANY design/UI task → use \`fleet_delegate\` with agent "gemini"
- For ANY code/implementation task → use \`fleet_delegate\` with agent "codex"
- For architecture/planning → do it yourself
- \`fleet_delegate\` blocks until the worker finishes and returns the result directly
- After receiving a result, review it. If issues, delegate a fix. If good, continue or summarize.
- For multi-step projects: plan → delegate design → delegate implementation with design as context
- Never ask the user which agent to use. Just do it.
`;

  if (existsSync(claudeMdPath)) {
    const existing = readFileSync(claudeMdPath, 'utf-8');
    if (!existing.includes(fleetMarker)) {
      writeFileSync(claudeMdPath, existing + '\n' + fleetInstructions);
      console.log('✓ Appended fleet instructions to CLAUDE.md');
    }
  } else {
    writeFileSync(claudeMdPath, fleetInstructions.trim() + '\n');
    console.log('✓ Created CLAUDE.md with fleet instructions');
  }

  // Worker auto-poll prompt — workers start and immediately check for tasks, then loop
  const workerPrompt = 'You are a fleet worker. Call fleet_poll now. When you get a task, execute it fully, then call fleet_submit with your result. After submitting, call fleet_poll again. Repeat forever.';

  // All three CLIs open as interactive windows with auto-poll for workers
  const panes = [
    { name: 'claude', command: ['claude'], title: 'Claude_Architect' },
    { name: 'gemini', command: ['gemini', '-i', workerPrompt], title: 'Gemini_Designer' },
    { name: 'codex', command: ['codex', workerPrompt], title: 'Codex_Developer' },
  ];

  const terminalType = options.terminal ?? detectTerminal();
  console.log(`✓ Launching ${panes.length}-pane layout via ${terminalType}...`);

  switch (terminalType) {
    case 'wt': launchWt(panes, projectDir); break;
    case 'tmux': launchTmux(panes, projectDir); break;
    default: launchFallback(panes, projectDir); break;
  }

  console.log('✓ Fleet ready:');
  console.log('  Left:  Claude (architect) — tell it what to build');
  console.log('  Right: Gemini (designer) + Codex (developer) — auto-polling for tasks');
  console.log('  All work happens visibly in the panes.');

  console.log('  Press Ctrl+C to stop the server.');

  process.on('SIGINT', async () => {
    console.log('\nShutting down fleet...');
    await server.close();
    process.exit(0);
  });
}
