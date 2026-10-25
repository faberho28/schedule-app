import type { components } from '@/shared/api/schema';

type Schemas = components['schemas'];

const PERCENT = 100;

/**
 * Texto de la tarjeta "Eficiencia de servicios": porcentaje entero (redondeo al más cercano) de la
 * fracción `rate`, o "Sin datos" cuando nada debía cerrarse (`rate` nula; nunca 0 % ni 100 %).
 */
export function efficiencyPercentText(rate: number | null): string {
  if (rate === null) return 'Sin datos';
  return `${Math.round(rate * PERCENT)} %`;
}

/** Fecha de corte `YYYY-MM-DD` como `dd/mm/aaaa`. Es texto puro: no pasa por la zona del navegador. */
export function formatCutoffDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

/** Texto `X/Y` de la tarjeta "Técnicos activos". */
export function formatWorkingOfTotal({
  working,
  total,
}: Schemas['DashboardActiveTechnicians']): string {
  return `${working}/${total}`;
}

/** Conteos de la tarjeta de eficiencia, por ejemplo `6 de 9 servicios`. */
export function formatCompletedOfDue({
  completed,
  due,
}: Pick<Schemas['DashboardEfficiency'], 'completed' | 'due'>): string {
  return `${completed} de ${due} ${due === 1 ? 'servicio' : 'servicios'}`;
}
