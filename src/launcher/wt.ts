import { exec } from 'node:child_process';

interface PaneConfig {
  name: string;
  command: string[];
  title: string;
}

function esc(s: string): string {
  // Collapse newlines to spaces, wrap in double quotes
  return `"${s.replace(/\n/g, ' ').replace(/"/g, '""')}"`;
}

function paneCmd(pane: PaneConfig): string {
  return pane.command.map(esc).join(' ');
}

export function launchWt(panes: PaneConfig[]): void {
  if (panes.length === 0) return;

  // wt.exe uses `;` to separate sub-commands — must be a single shell string
  const parts: string[] = [];

  parts.push(`new-tab --title ${esc(panes[0].title)} -- ${paneCmd(panes[0])}`);

  if (panes.length >= 2) {
    parts.push(`split-pane -V --title ${esc(panes[1].title)} -- ${paneCmd(panes[1])}`);
  }
  if (panes.length >= 3) {
    parts.push('move-focus left');
    parts.push(`split-pane -H --title ${esc(panes[2].title)} -- ${paneCmd(panes[2])}`);
  }
  if (panes.length >= 4) {
    parts.push('move-focus right');
    parts.push(`split-pane -H --title ${esc(panes[3].title)} -- ${paneCmd(panes[3])}`);
  }
  parts.push('move-focus first');

  const cmd = `wt.exe -w fleet ${parts.join(' ; ')}`;
  exec(cmd);
}
