import { describe, it, expect, vi } from 'vitest';
import { which } from '../src/adapters/base.js';
import { GeminiAdapter } from '../src/adapters/gemini.js';
import { ClaudeAdapter } from '../src/adapters/claude.js';
import { CodexAdapter } from '../src/adapters/codex.js';

describe('which()', () => {
  it('returns null for nonexistent command', async () => {
    const result = await which('definitely-not-a-real-command-xyz');
    expect(result).toBeNull();
  });

  it('returns path for known command', async () => {
    const result = await which('node');
    expect(result).not.toBeNull();
  });
});

describe('Adapters', () => {
  describe('GeminiAdapter', () => {
    it('builds a role prompt', () => {
      const adapter = new GeminiAdapter();
      const prompt = adapter.buildRolePrompt('designer', 'UI/UX design');
      expect(prompt).toContain('designer');
      expect(prompt).toContain('fleet_poll');
    });

    it('builds launch command', () => {
      const adapter = new GeminiAdapter();
      const cmd = adapter.buildLaunchCommand('Do the work');
      expect(cmd[0]).toBe('gemini');
      expect(cmd).toContain('-p');
    });
  });

  describe('ClaudeAdapter', () => {
    it('builds orchestrator prompt', () => {
      const adapter = new ClaudeAdapter();
      const prompt = adapter.buildRolePrompt('orchestrator', 'Architecture');
      expect(prompt).toContain('orchestrator');
      expect(prompt).toContain('fleet_delegate');
    });
  });

  describe('CodexAdapter', () => {
    it('builds launch command with prompt', () => {
      const adapter = new CodexAdapter();
      const cmd = adapter.buildLaunchCommand('Implement feature');
      expect(cmd[0]).toBe('codex');
      expect(cmd).toContain('Implement feature');
    });
  });
});
