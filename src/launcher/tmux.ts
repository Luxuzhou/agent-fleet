import { execFileSync, execFile } from 'node:child_process';

interface PaneConfig {
  name: string;
  command: string[];
  title: string;
}

export function launchTmux(panes: PaneConfig[]): void {
  if (panes.length === 0) return;

  const sessionName = 'fleet';
  try {
    execFileSync('tmux', ['kill-session', '-t', sessionName], { stdio: 'ignore' });
  } catch { /* no existing session */ }

  execFileSync('tmux', ['new-session', '-d', '-s', sessionName, '-n', 'main', ...panes[0].command]);

  if (panes.length >= 2) {
    execFileSync('tmux', ['split-window', '-h', '-t', sessionName, ...panes[1].command]);
  }
  if (panes.length >= 3) {
    execFileSync('tmux', ['split-window', '-v', '-t', sessionName, ...panes[2].command]);
  }
  if (panes.length >= 4) {
    execFileSync('tmux', ['select-pane', '-t', `${sessionName}:0.0`]);
    execFileSync('tmux', ['split-window', '-v', '-t', sessionName, ...panes[3].command]);
  }
  execFileSync('tmux', ['select-pane', '-t', `${sessionName}:0.0`]);
  execFile('tmux', ['attach', '-t', sessionName], { stdio: 'inherit' } as any);
}
