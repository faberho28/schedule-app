import type { components } from '@/shared/api/schema';
import { pluralize } from '@/shared/lib/format';

type Service = components['schemas']['Service'];
export type CreateServiceBody = components['schemas']['CreateServiceDto'];
export type UpdateServiceBody = components['schemas']['UpdateServiceDto'];

/** Valores del formulario tal como los escribe la persona (texto). */
export type ServiceFormValues = {
  name: string;
  duration: string;
  price: string;
  followupInterval: string;
};

export type ServiceFormErrors = Partial<Record<keyof ServiceFormValues, string>>;

const POSITIVE_INTEGER = /^[1-9]\d*$/;
const PRICE = /^\d+(\.\d{1,2})?$/;

export function emptyServiceForm(): ServiceFormValues {
  return { name: '', duration: '', price: '', followupInterval: '' };
}

export function serviceToForm(service: Service): ServiceFormValues {
  return {
    name: service.name,
    duration: String(service.duration_min),
    price: String(service.price),
    followupInterval:
      service.followup_interval_days === null ? '' : String(service.followup_interval_days),
  };
}

/** Valida con las mismas reglas que la API para avisar antes de enviar. */
export function validateServiceForm(values: ServiceFormValues): ServiceFormErrors {
  const errors: ServiceFormErrors = {};
  if (values.name.trim() === '') errors.name = 'El nombre es obligatorio.';
  if (!POSITIVE_INTEGER.test(values.duration)) {
    errors.duration = 'La duración debe ser un número entero de minutos mayor que 0.';
  }
  if (!PRICE.test(values.price)) {
    errors.price = 'El precio debe ser un número mayor o igual a 0, con hasta 2 decimales.';
  }
  if (values.followupInterval !== '' && !POSITIVE_INTEGER.test(values.followupInterval)) {
    errors.followupInterval = 'El intervalo debe ser un número entero de días mayor que 0.';
  }
  return errors;
}

/** Cuerpo de `POST /services`; sin intervalo, el servicio no genera seguimientos. */
export function toCreateBody(values: ServiceFormValues): CreateServiceBody {
  return {
    name: values.name.trim(),
    duration_min: Number(values.duration),
    price: Number(values.price),
    ...(values.followupInterval === ''
      ? {}
      : { followup_interval_days: Number(values.followupInterval) }),
  };
}

/** Cuerpo de `PATCH /services/:id` con solo los campos que cambiaron. */
export function serviceChanges(
  current: Pick<Service, 'name' | 'duration_min' | 'price' | 'followup_interval_days'>,
  values: ServiceFormValues,
): UpdateServiceBody {
  const changes: UpdateServiceBody = {};
  const name = values.name.trim();
  if (name !== current.name) changes.name = name;
  if (Number(values.duration) !== current.duration_min) {
    changes.duration_min = Number(values.duration);
  }
  if (Number(values.price) !== current.price) changes.price = Number(values.price);
  const interval = values.followupInterval === '' ? null : Number(values.followupInterval);
  if (interval !== current.followup_interval_days) changes.followup_interval_days = interval;
  return changes;
}

/** Aviso informativo cuando un cambio de duración deja citas futuras con la duración anterior. */
export function durationWarningMessage(count: number): string {
  const subject = pluralize(
    count,
    'servicio futuro que conserva',
    'servicios futuros que conservan',
  );
  return `Hay ${count} ${subject} la duración anterior`;
}
