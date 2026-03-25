import { describe, it, expect, vi } from 'vitest';
import { ContextBuilder } from '../src/core/context-builder.js';
import * as fs from 'node:fs/promises';

vi.mock('node:fs/promises');

describe('ContextBuilder', () => {
  const builder = new ContextBuilder('/project');

  it('builds context with referenced files', async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce('file content here');

    const ctx = await builder.build({
      references: ['docs/arch.md'],
      constraints: 'Use Tailwind CSS',
      upstream: { 'task-001': 'Previous design output' },
    });

    expect(ctx.references['docs/arch.md']).toBe('file content here');
    expect(ctx.constraints).toBe('Use Tailwind CSS');
    expect(ctx.upstream['task-001']).toBe('Previous design output');
  });

  it('handles missing files gracefully', async () => {
    vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('ENOENT'));

    const ctx = await builder.build({
      references: ['missing.md'],
    });

    expect(ctx.references['missing.md']).toMatch(/not found/i);
    expect(ctx.warnings).toContain('missing.md');
  });

  it('returns empty context when no inputs', async () => {
    const ctx = await builder.build({});
    expect(Object.keys(ctx.references)).toHaveLength(0);
    expect(Object.keys(ctx.upstream)).toHaveLength(0);
  });
});
