import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guarda del Perfil simulado (D22): el mock solo puede importarse desde `features/profile` y su
 * archivo debe conservar el marcador `MOCK`. Así no puede filtrarse a otra parte ni quedar
 * sin señalar hasta la fase de autenticación.
 */

const PROFILE_DIR = 'features/profile/';
const MOCK_FILE = 'features/profile/profile.mock.ts';
const MOCK_IMPORT =
  /\bfrom\s+['"][^'"]*profile\.mock(?:\.ts)?['"]|import\(\s*['"][^'"]*profile\.mock/;
const MARKER = /^\s*(?:\/\/|\/\*+|\*)\s*MOCK\b/m;

export interface SourceFile {
  /** Ruta relativa a `src`, con `/`. */
  path: string;
  content: string;
}

export function findForeignMockImports(files: SourceFile[]): string[] {
  return files
    .filter((file) => !file.path.startsWith(PROFILE_DIR) && MOCK_IMPORT.test(file.content))
    .map((file) => file.path);
}

export function mockLacksMarker(files: SourceFile[]): boolean {
  const mock = files.find((file) => file.path === MOCK_FILE);
  return mock === undefined || !MARKER.test(mock.content);
}

function readSources(dir: string, root = dir): SourceFile[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return readSources(full, root);
    if (!/\.(ts|tsx)$/.test(name)) return [];
    return [
      { path: relative(root, full).split(sep).join('/'), content: readFileSync(full, 'utf8') },
    ];
  });
}

describe('escáner de la guarda del Perfil simulado', () => {
  it('señala el archivo de otra funcionalidad que importa el mock', () => {
    const files: SourceFile[] = [
      {
        path: 'features/profile/ProfilePage.tsx',
        content: "import { MOCK_PROFILE } from './profile.mock';",
      },
      {
        path: 'features/agenda/AgendaPage.tsx',
        content: "import { MOCK_PROFILE } from '@/features/profile/profile.mock';",
      },
      { path: 'app/lazy.tsx', content: "const m = import('../features/profile/profile.mock');" },
    ];

    expect(findForeignMockImports(files)).toEqual([
      'features/agenda/AgendaPage.tsx',
      'app/lazy.tsx',
    ]);
  });

  it('acepta importaciones solo dentro de features/profile', () => {
    const files: SourceFile[] = [
      {
        path: 'features/profile/ProfilePage.tsx',
        content: "import { MOCK_PROFILE } from './profile.mock';",
      },
      { path: 'features/agenda/AgendaPage.tsx', content: "import { x } from './profile';" },
    ];

    expect(findForeignMockImports(files)).toEqual([]);
  });

  it('detecta un mock sin el marcador MOCK o ausente', () => {
    expect(mockLacksMarker([{ path: MOCK_FILE, content: 'export const MOCK_PROFILE = {};' }])).toBe(
      true,
    );
    expect(mockLacksMarker([])).toBe(true);
    expect(
      mockLacksMarker([
        { path: MOCK_FILE, content: '// MOCK: reemplazar en la fase de autenticación\nexport {};' },
      ]),
    ).toBe(false);
  });
});

describe('Perfil simulado en el código real', () => {
  const files = readSources(join(process.cwd(), 'src'));

  it('ningún archivo fuera de features/profile importa profile.mock', () => {
    expect(findForeignMockImports(files)).toEqual([]);
  });

  it('profile.mock.ts conserva el marcador MOCK', () => {
    expect(mockLacksMarker(files)).toBe(false);
  });
});
