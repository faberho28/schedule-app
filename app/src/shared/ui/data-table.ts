/**
 * Anchos de las columnas de las tablas de la aplicación, para una tabla de diseño fijo
 * (`table-fixed`). Las columnas de datos tienen un ancho propio y quedan juntas a la izquierda; la
 * de acciones no tiene ancho y recibe el espacio que sobra.
 */
export const COLUMN_WIDTH = {
  /** Nombre (cliente, técnico): más angosta en pantallas medianas, donde no sobra espacio. */
  main: 'w-[240px] lg:w-[320px]',
  phone: 'w-[200px]',
  /** Estado o consentimiento. */
  status: 'w-[160px]',
  /** Sin ancho: toma el espacio restante. */
  actions: '',
} as const;

export type ColumnWidth = keyof typeof COLUMN_WIDTH;

/** Opciones de filas por página de las tablas. */
export const PAGE_SIZES = [10, 25, 50] as const;
