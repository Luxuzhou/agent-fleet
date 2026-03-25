#!/usr/bin/env node
import { runInit } from './cli/init.js';
import { runStart } from './cli/start.js';
import { runAdd } from './cli/add.js';

const args = process.argv.slice(2);
const command = args[0];
const projectDir = process.cwd();

async function main() {
  switch (command) {
    case 'init':
      await runInit(projectDir);
      break;

    case 'start': {
      const serverOnly = args.includes('--server-only');
      const termIdx = args.indexOf('--terminal');
      const terminal = termIdx >= 0 ? args[termIdx + 1] as any : undefined;
      await runStart(projectDir, { serverOnly, terminal });
      break;
    }

    case 'add': {
      const agentName = args[1];
      const roleIdx = args.indexOf('--role');
      const role = roleIdx >= 0 ? args[roleIdx + 1] : args[1];
      if (!agentName) {
        console.error('Usage: agent-fleet add <agent-name> --role <role>');
        process.exit(1);
      }
      await runAdd(projectDir, agentName, role);
      break;
    }

    default:
      console.log(`agent-fleet v0.1.0

Usage:
  agent-fleet init              Detect CLIs, generate fleet.yaml, configure MCP
  agent-fleet start             Start server and launch all agents in split panes
  agent-fleet start --server-only  Start server only (manual CLI management)
  agent-fleet start --terminal wt|tmux  Force specific terminal multiplexer
  agent-fleet add <name> --role <role>  Add a new agent to fleet.yaml
      `);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
