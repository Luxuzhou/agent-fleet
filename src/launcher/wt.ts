import { exec } from 'node:child_process';

interface PaneConfig {
  name: string;
  command: string[];
  title: string;
}

function escapeTitle(s: string): string {
  // Titles: wrap in quotes, no special chars
  return `"${s.replace(/"/g, '')}"`;
}

function escapePrompt(s: string): string {
  // Prompts: collapse newlines, wrap in quotes
  return `"${s.replace(/\n/g, ' ').replace(/"/g, "'")}"`;
}

function buildCmd(pane: PaneConfig): string {
  // First element (cli name) must NOT be quoted — Windows needs bare command to resolve .cmd
  // Remaining elements (flags and prompt) get escaped
  const [cli, ...args] = pane.command;
  const escapedArgs = args.map(escapePrompt).join(' ');
  return escapedArgs ? `${cli} ${escapedArgs}` : cli;
}

export function launchWt(panes: PaneConfig[]): void {
  if (panes.length === 0) return;

  const parts: string[] = [];

  parts.push(`new-tab --title ${escapeTitle(panes[0].title)} -- ${buildCmd(panes[0])}`);

  if (panes.length >= 2) {
    parts.push(`split-pane -V --title ${escapeTitle(panes[1].title)} -- ${buildCmd(panes[1])}`);
  }
  if (panes.length >= 3) {
    parts.push('move-focus left');
    parts.push(`split-pane -H --title ${escapeTitle(panes[2].title)} -- ${buildCmd(panes[2])}`);
  }
  if (panes.length >= 4) {
    parts.push('move-focus right');
    parts.push(`split-pane -H --title ${escapeTitle(panes[3].title)} -- ${buildCmd(panes[3])}`);
  }
  parts.push('move-focus first');

  const cmd = `wt.exe -w fleet ${parts.join(' ; ')}`;
  exec(cmd);
}
