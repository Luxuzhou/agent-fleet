import { spawn } from 'node:child_process';

interface PaneConfig {
  name: string;
  command: string[];
  title: string;
}

export function launchWt(panes: PaneConfig[]): void {
  if (panes.length === 0) return;

  const args: string[] = ['-w', 'fleet'];
  args.push('new-tab', '--title', panes[0].title, '--', ...panes[0].command);

  if (panes.length >= 2) {
    args.push(';', 'split-pane', '-V', '--title', panes[1].title, '--', ...panes[1].command);
  }
  if (panes.length >= 3) {
    args.push(';', 'move-focus', 'left');
    args.push(';', 'split-pane', '-H', '--title', panes[2].title, '--', ...panes[2].command);
  }
  if (panes.length >= 4) {
    args.push(';', 'move-focus', 'right');
    args.push(';', 'split-pane', '-H', '--title', panes[3].title, '--', ...panes[3].command);
  }
  args.push(';', 'move-focus', 'first');

  spawn('wt.exe', args, { detached: true, stdio: 'ignore' }).unref();
}
