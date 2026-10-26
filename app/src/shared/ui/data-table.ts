/**
 * Anchos de las columnas de las tablas de la aplicación. La primera columna (el nombre) crece y
 * ocupa lo que sobra; las demás tienen un ancho fijo para que ninguna columna de datos se estire.
 */
export const COLUMN_WIDTH = {
  /** Primera columna: absorbe el espacio libre. */
  main: 'w-full',
  phone: 'w-[200px]',
  /** Estado o consentimiento. */
  status: 'w-[160px]',
  actions: 'w-12',
} as const;

export type ColumnWidth = keyof typeof COLUMN_WIDTH;

/** Opciones de filas por página de las tablas. */
export const PAGE_SIZES = [10, 25, 50] as const;
