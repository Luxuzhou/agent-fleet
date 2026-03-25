import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exec } from 'node:child_process';

interface PaneConfig {
  name: string;
  command: string[];
  title: string;
}

function sanitize(s: string): string {
  // Remove all shell-special chars from titles
  return s.replace(/[^a-zA-Z0-9 _-]/g, '');
}

function paneArg(pane: PaneConfig): string {
  // Build: cmd /k claude -p "prompt text here"
  const [cli, ...rest] = pane.command;
  const parts = [cli, ...rest.map(a => `"${a}"`)];
  return `cmd /k ${parts.join(' ')}`;
}

export function launchWt(panes: PaneConfig[]): void {
  if (panes.length === 0) return;

  // Build the full wt.exe command as a single line in a .bat file
  // This avoids all Node spawn/exec argument parsing issues
  const segments: string[] = [];

  segments.push(`new-tab --title "${sanitize(panes[0].title)}" -- ${paneArg(panes[0])}`);

  if (panes.length >= 2) {
    segments.push(`split-pane -V --title "${sanitize(panes[1].title)}" -- ${paneArg(panes[1])}`);
  }
  if (panes.length >= 3) {
    segments.push('move-focus left');
    segments.push(`split-pane -H --title "${sanitize(panes[2].title)}" -- ${paneArg(panes[2])}`);
  }
  if (panes.length >= 4) {
    segments.push('move-focus right');
    segments.push(`split-pane -H --title "${sanitize(panes[3].title)}" -- ${paneArg(panes[3])}`);
  }
  segments.push('move-focus first');

  const wtCmd = `wt -w fleet ${segments.join(' ; ')}`;

  // Write to temp .bat file and execute
  const batPath = join(tmpdir(), `agent-fleet-launch-${Date.now()}.bat`);
  writeFileSync(batPath, `@echo off\n${wtCmd}\n`, 'utf-8');

  exec(`"${batPath}"`, (err) => {
    // Clean up bat file after a delay
    setTimeout(() => { try { unlinkSync(batPath); } catch {} }, 5000);
    if (err) console.error(`[fleet] Launch error: ${err.message}`);
  });
}
