/**
 * Simula `window.matchMedia` en jsdom, que no lo implementa. El ancho por defecto es móvil;
 * las pruebas de escritorio llaman a `setDesktopViewport()`. `setup.ts` instala el ayudante y
 * restablece el ancho móvil después de cada prueba.
 */

export const MOBILE_WIDTH = 390;
export const DESKTOP_WIDTH = 1280;

type Listener = (event: MediaQueryListEvent) => void;

interface Entry {
  query: string;
  mql: MediaQueryList;
  listeners: Set<Listener>;
  matches: boolean;
}

let width = MOBILE_WIDTH;
const entries = new Set<Entry>();

function evaluate(query: string): boolean {
  const clauses = Array.from(query.matchAll(/\(\s*(min|max)-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)/g));
  if (clauses.length === 0) return false;
  return clauses.every(([, kind, value]) =>
    kind === 'min' ? width >= Number(value) : width <= Number(value),
  );
}

function createMediaQueryList(query: string): MediaQueryList {
  const listeners = new Set<Listener>();
  const entry = { query, listeners, matches: evaluate(query) } as Entry;
  const mql = {
    media: query,
    get matches() {
      return entry.matches;
    },
    onchange: null,
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
    addListener: (listener: Listener) => listeners.add(listener),
    removeListener: (listener: Listener) => listeners.delete(listener),
    dispatchEvent: () => true,
  } as unknown as MediaQueryList;
  entry.mql = mql;
  entries.add(entry);
  return mql;
}

function setWidth(next: number) {
  width = next;
  for (const entry of entries) {
    const matches = evaluate(entry.query);
    if (matches === entry.matches) continue;
    entry.matches = matches;
    const event = { matches, media: entry.query } as MediaQueryListEvent;
    for (const listener of Array.from(entry.listeners)) listener(event);
  }
}

export function setDesktopViewport(next: number = DESKTOP_WIDTH) {
  setWidth(next);
}

export function setMobileViewport(next: number = MOBILE_WIDTH) {
  setWidth(next);
}

export function installViewport() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => createMediaQueryList(query),
  });
}

export function resetViewport() {
  entries.clear();
  width = MOBILE_WIDTH;
}
