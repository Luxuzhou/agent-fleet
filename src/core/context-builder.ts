import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

interface BuildInput {
  references?: string[];
  constraints?: string;
  upstream?: Record<string, string>;
}

interface BuiltContext {
  references: Record<string, string>;
  constraints: string;
  upstream: Record<string, string>;
  warnings: string[];
}

export class ContextBuilder {
  constructor(private projectDir: string) {}

  async build(input: BuildInput): Promise<BuiltContext> {
    const references: Record<string, string> = {};
    const warnings: string[] = [];

    for (const ref of input.references ?? []) {
      try {
        const fullPath = resolve(this.projectDir, ref);
        references[ref] = await readFile(fullPath, 'utf-8');
      } catch {
        references[ref] = `[File not found: ${ref}]`;
        warnings.push(ref);
      }
    }

    return {
      references,
      constraints: input.constraints ?? '',
      upstream: input.upstream ?? {},
      warnings,
    };
  }
}
