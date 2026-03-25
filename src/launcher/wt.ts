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

function buildCmd(pane: PaneConfig): string {
  // Bare CLI name — no quotes needed, cmd /k resolves .cmd from PATH
  return `cmd /k ${pane.command.join(' ')}`;
}

export function launchWt(panes: PaneConfig[], cwd: string): void {
  if (panes.length === 0) return;

  // Layout: left=pane[0], top-right=pane[1], bottom-right=pane[2]
  // pane[0] (Claude) takes left half
  // pane[1] (Gemini) splits right from Claude
  // pane[2] (Codex) splits below Gemini
  const segments: string[] = [];

  segments.push(`new-tab -d "${cwd}" --title ${safeTitle(panes[0].title)} -- ${buildCmd(panes[0])}`);

  if (panes.length >= 2) {
    segments.push(`split-pane -V -d "${cwd}" --title ${safeTitle(panes[1].title)} -- ${buildCmd(panes[1])}`);
  }
  if (panes.length >= 3) {
    segments.push(`split-pane -H -d "${cwd}" --title ${safeTitle(panes[2].title)} -- ${buildCmd(panes[2])}`);
  }
  // Any additional panes split below the last
  for (let i = 3; i < panes.length; i++) {
    segments.push(`split-pane -H -d "${cwd}" --title ${safeTitle(panes[i].title)} -- ${buildCmd(panes[i])}`);
  }

  segments.push('move-focus first');

  const wtLine = `wt -w fleet ${segments.join(' ; ')}`;
  const batPath = join(tmpdir(), `fleet-${Date.now()}.bat`);
  writeFileSync(batPath, `@echo off\r\nchcp 65001 >nul\r\n${wtLine}\r\n`, 'utf-8');

  exec(`"${batPath}"`, (err) => {
    setTimeout(() => { try { unlinkSync(batPath); } catch {} }, 5000);
    if (err) console.error(`[fleet] Launch error: ${err.message}`);
  });
}
