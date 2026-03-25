import { execSync } from 'node:child_process';

export type TerminalType = 'wt' | 'tmux' | 'fallback';

export function detectTerminal(): TerminalType {
  // Check WT_SESSION first (running inside Windows Terminal)
  if (process.env.WT_SESSION) return 'wt';

  // On Windows, check if wt.exe is available (even if not running inside it)
  if (process.platform === 'win32') {
    try {
      execSync('where wt', { stdio: 'ignore' });
      return 'wt';
    } catch { /* wt not installed */ }
  }

  // Check tmux
  try {
    execSync(process.platform === 'win32' ? 'where tmux' : 'which tmux', { stdio: 'ignore' });
    return 'tmux';
  } catch { /* not available */ }

  return 'fallback';
}
