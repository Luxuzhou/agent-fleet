import { execFileSync } from 'node:child_process';

export type TerminalType = 'wt' | 'tmux' | 'fallback';

export function detectTerminal(): TerminalType {
  if (process.env.WT_SESSION) return 'wt';

  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', ['tmux'], { stdio: 'ignore' });
    return 'tmux';
  } catch { /* not available */ }

  return 'fallback';
}
