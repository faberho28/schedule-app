import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

/**
 * Escáner del vocabulario visible (D21). Extrae solo los textos que ve la persona usuaria:
 * literales de cadena, plantillas y texto JSX. Los identificadores, rutas importadas y comentarios
 * quedan fuera porque el compilador de TypeScript no los reporta como literales de texto.
 */

export interface Violation {
  file: string;
  text: string;
  rule: 'cita' | 'catalogo' | 'voseo';
  detail: string;
}

export interface VocabularyException {
  file: string;
  text: string;
  reason: string;
}

/** Excepciones justificadas. Vacía: ningún texto visible usa el vocabulario antiguo. */
export const VOCABULARY_EXCEPTIONS: VocabularyException[] = [];

// `\b` de JavaScript no reconoce las letras acentuadas como parte de una palabra; se usan
// lookarounds Unicode para que "elegí" o "tenés" se detecten y "necesitas" no.
const NOT_BEFORE = '(?<![\\p{L}\\p{N}_])';
const NOT_AFTER = '(?![\\p{L}\\p{N}_])';

const CITA = new RegExp(`${NOT_BEFORE}citas?${NOT_AFTER}`, 'iu');

const VOSEO_WORDS = [
  'vos',
  'tenés',
  'podés',
  'querés',
  'elegí',
  'ingresá',
  'escribí',
  'confirmá',
  'revisá',
  'intentá',
  'seleccioná',
  'creá',
  'guardá',
  'cancelá',
  'hacé',
];
const VOSEO = new RegExp(`${NOT_BEFORE}(?:${VOSEO_WORDS.join('|')})${NOT_AFTER}`, 'iu');

/** "servicio" o "servicios" sin "tipo(s) de" delante. */
const BARE_SERVICIO = new RegExp(`(?<!tipos? de )${NOT_BEFORE}servicios?${NOT_AFTER}`, 'iu');

/**
 * Contextos donde "servicio" significa el tipo del catálogo y debe decir "tipo de servicio". La
 * regla es explícita porque la palabra "servicio" también es el vocabulario correcto para lo que se
 * agenda; por eso no se prohíbe en general. Un contexto es un archivo y, opcionalmente, un patrón
 * `only` que limita la regla a los textos que lo cumplen:
 * - sin `only`, todo texto de ese archivo es del catálogo;
 * - con `only`, solo los textos que lo cumplen lo son (el resto del archivo habla del servicio
 *   agendado).
 */
export interface CatalogContext {
  file: string;
  only?: RegExp;
  reason: string;
}

export const CATALOG_CONTEXTS: CatalogContext[] = [
  { file: 'src/app/AppLayout.tsx', reason: 'ítem de menú del catálogo' },
  {
    file: 'src/features/settings/ServicesSettingsPage.tsx',
    reason: 'pantalla del catálogo de tipos de servicio',
  },
  {
    file: 'src/features/settings/ServiceFormDialog.tsx',
    // La nota "no modifican los servicios ya agendados" habla del servicio agendado y es correcta.
    only: /^(Editar|Nuevo|Crear|Déjalo)/,
    reason: 'título, botón y ayuda del formulario del tipo de servicio',
  },
  {
    file: 'src/shared/lib/error-messages.ts',
    only: /existe un servicio/i,
    reason: 'mensaje de service_name_taken: el nombre pertenece al tipo de servicio',
  },
  {
    file: 'src/features/appointments/CreateAppointmentDialog.tsx',
    only: /^(Servicio$|Selecciona un servicio|Cargando servicios|Elige un servicio|Elige el cliente, el servicio)/,
    reason: 'campo y mensajes para elegir el tipo de servicio',
  },
];

function isVisibleCandidate(text: string): boolean {
  return text.trim() !== '';
}

/** Textos visibles de un archivo TypeScript o TSX. */
export function extractVisibleStrings(fileName: string, sourceText: string): string[] {
  const kind = fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, kind);
  const found: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isImportTypeNode(node)) return;
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      if (isVisibleCandidate(node.text)) found.push(node.text);
    } else if (ts.isJsxText(node)) {
      const text = node.text.replace(/\s+/g, ' ').trim();
      if (text !== '') found.push(text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Textos visibles de `index.html`: contenido de los elementos y atributos de texto. */
export function extractHtmlStrings(html: string): string[] {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const found: string[] = [];
  for (const match of withoutScripts.matchAll(/\b(?:content|title|alt|aria-label)="([^"]*)"/gi)) {
    const value = match[1]?.trim();
    // Los metadatos técnicos (colores, viewport) no son texto para la persona usuaria.
    if (value && /[\p{L}]{3,} [\p{L}]{2,}/u.test(value)) found.push(value);
  }
  for (const match of withoutScripts.matchAll(/>([^<>]+)</g)) {
    const value = match[1]?.replace(/\s+/g, ' ').trim();
    if (value) found.push(value);
  }
  return found;
}

/** Infracciones de vocabulario de un texto visible. */
export function violationsOf(file: string, text: string): Violation[] {
  const violations: Violation[] = [];
  if (CITA.test(text)) {
    violations.push({ file, text, rule: 'cita', detail: '"cita" debe decir "servicio"' });
  }
  const voseo = VOSEO.exec(text);
  if (voseo) {
    violations.push({ file, text, rule: 'voseo', detail: `voseo "${voseo[0]}": usar tuteo` });
  }
  const context = CATALOG_CONTEXTS.find(
    (entry) => entry.file === file && (entry.only === undefined || entry.only.test(text)),
  );
  if (context && BARE_SERVICIO.test(text)) {
    violations.push({
      file,
      text,
      rule: 'catalogo',
      detail: `${context.reason}: "servicio" debe decir "tipo de servicio"`,
    });
  }
  return violations.filter(
    (violation) =>
      !VOCABULARY_EXCEPTIONS.some(
        (exception) => exception.file === violation.file && exception.text === violation.text,
      ),
  );
}

function sourceFilesUnder(directory: string, files: string[] = []): string[] {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      if (name === 'test') continue;
      sourceFilesUnder(path, files);
    } else if (
      /\.(ts|tsx)$/.test(name) &&
      !/\.test\.(ts|tsx)$/.test(name) &&
      name !== 'schema.d.ts'
    ) {
      files.push(path);
    }
  }
  return files;
}

/** Recorre `src` (sin pruebas ni `schema.d.ts`), `pwa.config.ts` e `index.html` bajo `appRoot`. */
export function scanApp(appRoot: string): Violation[] {
  const violations: Violation[] = [];
  const rel = (path: string) => relative(appRoot, path).split(sep).join('/');

  const sources = [...sourceFilesUnder(join(appRoot, 'src')), join(appRoot, 'pwa.config.ts')];
  for (const path of sources) {
    for (const text of extractVisibleStrings(path, readFileSync(path, 'utf8'))) {
      violations.push(...violationsOf(rel(path), text));
    }
  }
  const htmlPath = join(appRoot, 'index.html');
  for (const text of extractHtmlStrings(readFileSync(htmlPath, 'utf8'))) {
    violations.push(...violationsOf(rel(htmlPath), text));
  }
  return violations;
}
