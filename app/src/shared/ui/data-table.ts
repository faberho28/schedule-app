/**
 * Anchos de las columnas de las tablas de la aplicación, en porcentaje y para una tabla de diseño
 * fijo (`table-fixed`): las columnas no se estiran con su contenido, que se recorta con puntos
 * suspensivos. Suman 100.
 */
export const COLUMN_WIDTH = {
  /** Nombre (cliente, técnico). */
  main: 'w-[28%]',
  phone: 'w-[18%]',
  address: 'w-[34%]',
  /** Estado o consentimiento. */
  status: 'w-[14%]',
  /** Acciones, alineadas a la derecha. */
  actions: 'w-[6%]',
} as const;

export type ColumnWidth = keyof typeof COLUMN_WIDTH;

/** Opciones de filas por página de las tablas. */
export const PAGE_SIZES = [10, 25, 50] as const;
