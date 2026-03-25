// src/cli/init.ts
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as yaml from 'js-yaml';
import { ClaudeAdapter } from '../adapters/claude.js';
import { GeminiAdapter } from '../adapters/gemini.js';
import { CodexAdapter } from '../adapters/codex.js';
import type { FleetAdapter } from '../adapters/base.js';
import type { FleetConfig, AgentConfig } from '../types.js';

export async function runInit(projectDir: string): Promise<void> {
  console.log('agent-fleet init\n');

  const adapters: FleetAdapter[] = [
    new ClaudeAdapter(),
    new GeminiAdapter(),
    new CodexAdapter(),
  ];

  const detectedAgents: Record<string, AgentConfig> = {};
  const serverUrl = 'http://localhost:4600/mcp';

  // Phase 1: Detect CLIs
  console.log('Detecting installed CLIs...');
  for (const adapter of adapters) {
    const result = await adapter.detect();
    const status = result.installed
      ? result.authenticated
        ? `✓ ${adapter.name} CLI found${result.version ? ` (${result.version})` : ''}, authenticated`
        : `✗ ${adapter.name} CLI found but not authenticated → run \`${adapter.cliCommand} auth\``
      : `- ${adapter.name} CLI not found`;
    console.log(`  ${status}`);

    if (result.installed && result.authenticated && adapter.name !== 'claude') {
      const roleMap: Record<string, string> = {
        gemini: 'designer',
        codex: 'developer',
      };
      detectedAgents[adapter.name] = {
        role: roleMap[adapter.name] ?? adapter.name,
        cli: adapter.cliCommand,
        description: adapter.name === 'gemini'
          ? 'UI/UX design, component styling, responsive layout'
          : 'Code implementation, testing, debugging',
        timeout: adapter.name === 'codex' ? 600 : 300,
      };
    }
  }

  if (Object.keys(detectedAgents).length === 0) {
    console.log('\n⚠ No worker CLIs detected. Install gemini or codex CLI first.');
    console.log('  You can add agents later with: agent-fleet add <name>');
  }

  // Phase 2: Generate fleet.yaml
  const config: FleetConfig = {
    version: 1,
    server: { port: 4600, heartbeat_interval: 15 },
    agents: detectedAgents,
    layout: {
      style: Object.keys(detectedAgents).length >= 2 ? 'quad' : 'triple',
      panes: {
        'top-left': 'claude',
        'top-right': 'claude',
        'bottom-left': Object.keys(detectedAgents)[0] ?? 'codex',
        'bottom-right': Object.keys(detectedAgents)[1] ?? 'gemini',
      },
    },
  };

  const yamlStr = yaml.dump(config, { lineWidth: 120 });
  const configPath = resolve(projectDir, 'fleet.yaml');
  await writeFile(configPath, yamlStr);
  console.log(`\n✓ Generated fleet.yaml`);

  // Phase 3: Inject MCP config into each CLI
  console.log('\nConfiguring MCP server in each CLI...');
  for (const adapter of adapters) {
    const result = await adapter.detect();
    if (result.installed && result.authenticated) {
      try {
        const role = adapter.name === 'claude' ? 'orchestrator' : 'worker';
        await adapter.configure(serverUrl, role);
        console.log(`  ✓ Configured ${adapter.name}`);
      } catch (e: any) {
        console.log(`  ✗ Failed to configure ${adapter.name}: ${e.message}`);
      }
    }
  }

  console.log('\nDone! Start with: agent-fleet start');
}
