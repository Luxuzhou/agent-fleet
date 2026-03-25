import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exec } from 'node:child_process';

interface PaneConfig {
  name: string;
  command: string[];
  title: string;
}

function safeTitle(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, '_');
}

function buildCmd(pane: PaneConfig, cwd: string): string {
  const [cli, ...args] = pane.command;
  const parts = args.map(a => {
    if (a.startsWith('-')) return a;
    return `"${a}"`;
  });
  // cd to project dir first, then run CLI
  return `cmd /k cd /d "${cwd}" && ${cli} ${parts.join(' ')}`;
}

export function launchWt(panes: PaneConfig[], cwd: string): void {
  if (panes.length === 0) return;

  const segments: string[] = [];

  segments.push(`new-tab --title ${safeTitle(panes[0].title)} -- ${buildCmd(panes[0], cwd)}`);

  if (panes.length >= 2) {
    segments.push(`split-pane -V --title ${safeTitle(panes[1].title)} -- ${buildCmd(panes[1], cwd)}`);
  }
  if (panes.length >= 3) {
    segments.push('move-focus left');
    segments.push(`split-pane -H --title ${safeTitle(panes[2].title)} -- ${buildCmd(panes[2], cwd)}`);
  }
  if (panes.length >= 4) {
    segments.push('move-focus right');
    segments.push(`split-pane -H --title ${safeTitle(panes[3].title)} -- ${buildCmd(panes[3], cwd)}`);
  }
  segments.push('move-focus first');

  const wtLine = `wt -w fleet ${segments.join(' ; ')}`;

  const batPath = join(tmpdir(), `fleet-${Date.now()}.bat`);
  writeFileSync(batPath, `@echo off\r\n${wtLine}\r\n`, 'utf-8');

  exec(`"${batPath}"`, (err) => {
    setTimeout(() => { try { unlinkSync(batPath); } catch {} }, 5000);
    if (err) console.error(`[fleet] Launch error: ${err.message}`);
  });
}
