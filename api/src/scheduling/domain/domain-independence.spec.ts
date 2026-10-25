import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const DOMAIN_DIR = __dirname;
const FORBIDDEN = ['@nestjs/', 'kysely', 'pg', 'express', '../infrastructure', '../application'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

function importedModules(source: string): string[] {
  return [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1] as string);
}

describe('independencia del dominio', () => {
  const files = sourceFiles(DOMAIN_DIR);

  it('encuentra los archivos del dominio', () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it.each(files.map((file) => [relative(DOMAIN_DIR, file), file]))(
    '%s no depende de Nest, Kysely, Postgres ni de capas externas',
    (_name, file) => {
      const offending = importedModules(readFileSync(file as string, 'utf8')).filter((module) =>
        FORBIDDEN.some((prefix) => module === prefix || module.startsWith(prefix)),
      );
      expect(offending).toEqual([]);
    },
  );

  it('Luxon solo se importa desde time/zoned-clock.ts', () => {
    const importers = files
      .filter((file) => importedModules(readFileSync(file, 'utf8')).includes('luxon'))
      .map((file) => relative(DOMAIN_DIR, file).replaceAll('\\', '/'));
    expect(importers).toEqual(['time/zoned-clock.ts']);
  });
});
