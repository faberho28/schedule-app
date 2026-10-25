import type { ReactNode } from 'react';

/** Título de pantalla: un único `h1` por ruta. */
export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-xl font-bold text-foreground">{children}</h1>;
}
