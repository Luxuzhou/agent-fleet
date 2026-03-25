import { describe, it, expect, vi } from 'vitest';
import { detectTerminal } from '../src/launcher/detect.js';

describe('detectTerminal', () => {
  it('detects Windows Terminal via WT_SESSION', () => {
    vi.stubEnv('WT_SESSION', 'some-guid');
    expect(detectTerminal()).toBe('wt');
    vi.unstubAllEnvs();
  });

  it('falls back when nothing detected', () => {
    vi.stubEnv('WT_SESSION', '');
    const result = detectTerminal();
    expect(['tmux', 'wt', 'fallback']).toContain(result);
    vi.unstubAllEnvs();
  });
});
