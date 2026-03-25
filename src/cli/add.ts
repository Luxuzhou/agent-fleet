import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as yaml from 'js-yaml';
import type { FleetConfig } from '../types.js';

export async function runAdd(projectDir: string, agentName: string, role: string): Promise<void> {
  const configPath = resolve(projectDir, 'fleet.yaml');

  let config: FleetConfig;
  try {
    const raw = await readFile(configPath, 'utf-8');
    config = yaml.load(raw) as FleetConfig;
  } catch {
    console.error('fleet.yaml not found. Run `agent-fleet init` first.');
    process.exit(1);
  }

  if (config.agents[agentName]) {
    console.log(`Agent "${agentName}" already exists in fleet.yaml.`);
    return;
  }

  config.agents[agentName] = {
    role,
    cli: agentName,
    description: `${role} agent`,
    timeout: 300,
  };

  await writeFile(configPath, yaml.dump(config, { lineWidth: 120 }));
  console.log(`✓ Added ${agentName} as ${role} to fleet.yaml`);
}
