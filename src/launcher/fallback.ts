import { spawn } from 'node:child_process';

interface PaneConfig {
  name: string;
  command: string[];
  title: string;
}

export function launchFallback(panes: PaneConfig[]): void {
  for (const pane of panes) {
    const cmd = pane.command.join(' ');

    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', `"${pane.title}"`, 'cmd', '/k', cmd], {
        detached: true, stdio: 'ignore',
      }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', ['-a', 'Terminal', '--args', '-e', cmd], {
        detached: true, stdio: 'ignore',
      }).unref();
    } else {
      for (const term of ['gnome-terminal', 'xterm', 'konsole']) {
        try {
          spawn(term, ['--title', pane.title, '-e', cmd], {
            detached: true, stdio: 'ignore',
          }).unref();
          break;
        } catch { continue; }
      }
    }
  }
}
