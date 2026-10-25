import { screen } from '@testing-library/react';

const TOAST = '[data-sonner-toast]';

/** Espera un aviso temporal (toast) cuyo texto contenga `text` y devuelve su contenedor. */
export async function findToast(text: string): Promise<HTMLElement> {
  const element = await screen.findByText((content) => content.includes(text));
  return element.closest<HTMLElement>(TOAST)!;
}

/** Los avisos temporales que hay en pantalla en este momento. */
export function currentToasts(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(TOAST));
}
