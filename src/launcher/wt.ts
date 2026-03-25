import { exec } from 'node:child_process';

interface PaneConfig {
  name: string;
  command: string[];
  title: string;
}

function safeTitle(s: string): string {
  // Remove characters that cmd.exe interprets: () & | < > ^
  return s.replace(/[()&|<>^]/g, '');
}

function buildPaneCommand(pane: PaneConfig): string {
  // Wrap in cmd /k so .cmd files on PATH are resolved
  const inner = pane.command.map((arg, i) => {
    if (i === 0) return arg; // CLI name bare
    // Wrap args in quotes, escape inner quotes
    return `"${arg.replace(/"/g, "'")}"`;
  }).join(' ');
  return `cmd /k ${inner}`;
}

export function launchWt(panes: PaneConfig[]): void {
  if (panes.length === 0) return;

  // Build wt.exe command — each sub-command separated by ;
  // wt.exe parses ; as its own delimiter, not cmd.exe
  const parts: string[] = [];

  parts.push(`new-tab --title "${safeTitle(panes[0].title)}" -- ${buildPaneCommand(panes[0])}`);

  if (panes.length >= 2) {
    parts.push(`split-pane -V --title "${safeTitle(panes[1].title)}" -- ${buildPaneCommand(panes[1])}`);
  }
  if (panes.length >= 3) {
    parts.push('move-focus left');
    parts.push(`split-pane -H --title "${safeTitle(panes[2].title)}" -- ${buildPaneCommand(panes[2])}`);
  }
  if (panes.length >= 4) {
    parts.push('move-focus right');
    parts.push(`split-pane -H --title "${safeTitle(panes[3].title)}" -- ${buildPaneCommand(panes[3])}`);
  }
  parts.push('move-focus first');

  const cmd = `wt.exe -w fleet ${parts.join(' ; ')}`;
  console.log(`[fleet] Launching: ${cmd.slice(0, 120)}...`);
  exec(cmd, (err) => {
    if (err) console.error(`[fleet] wt.exe error: ${err.message}`);
  });
}
