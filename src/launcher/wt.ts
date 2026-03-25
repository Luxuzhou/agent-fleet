import { spawn } from 'node:child_process';

interface PaneConfig {
  name: string;
  command: string[];
  title: string;
}

export function launchWt(panes: PaneConfig[]): void {
  if (panes.length === 0) return;

  // spawn passes args directly to wt.exe — no cmd.exe interpretation
  // wt.exe recognizes `;` as sub-command separator when it's a standalone arg
  // Each pane uses `cmd /k <cli> <args>` so .cmd files on PATH are resolved
  const args: string[] = ['-w', 'fleet'];

  // Pane 0: top-left (new tab)
  args.push('new-tab', '--title', panes[0].title, '--', 'cmd', '/k', ...panes[0].command);

  // Pane 1: top-right (split vertical from pane 0)
  if (panes.length >= 2) {
    args.push(';', 'split-pane', '-V', '--title', panes[1].title, '--', 'cmd', '/k', ...panes[1].command);
  }

  // Pane 2: bottom-left (split horizontal from pane 0)
  if (panes.length >= 3) {
    args.push(';', 'move-focus', 'left');
    args.push(';', 'split-pane', '-H', '--title', panes[2].title, '--', 'cmd', '/k', ...panes[2].command);
  }

  // Pane 3: bottom-right (split horizontal from pane 1)
  if (panes.length >= 4) {
    args.push(';', 'move-focus', 'right');
    args.push(';', 'split-pane', '-H', '--title', panes[3].title, '--', 'cmd', '/k', ...panes[3].command);
  }

  // Focus back to orchestrator
  args.push(';', 'move-focus', 'first');

  spawn('wt.exe', args, { detached: true, stdio: 'ignore' }).unref();
}
