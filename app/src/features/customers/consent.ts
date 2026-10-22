import type { components } from '@/shared/api/schema';
import { zonedInstant, type LocalDate } from '@/shared/lib/dates';

export type ConsentBody = components['schemas']['RegisterConsentDto'];
export type ConsentKind = ConsentBody['kind'];
export type ConsentMedium = ConsentBody['medium'];
export type ConsentStatus = components['schemas']['Customer']['consent_status'];

/** Etiquetas de la interfaz para cada valor del enum `medium` (ver el spec de customer-records). */
export const CONSENT_MEDIA: { value: ConsentMedium; label: string }[] = [
  { value: 'in_person', label: 'En persona' },
  { value: 'phone_call', label: 'Llamada telefónica' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'written', label: 'Formulario o documento escrito' },
  { value: 'other', label: 'Otro' },
];

export function mediumLabel(medium: ConsentMedium): string {
  return CONSENT_MEDIA.find((item) => item.value === medium)?.label ?? medium;
}

/** Nombre de cada estado y lo que implica para los mensajes del cliente. */
export const CONSENT_STATUS_INFO: Record<ConsentStatus, { label: string; explanation: string }> = {
  pending: {
    label: 'Pendiente',
    explanation:
      'Aún no hay una autorización registrada. No se enviarán mensajes de seguimiento a este cliente.',
  },
  granted: {
    label: 'Otorgado',
    explanation:
      'El cliente autorizó el tratamiento de sus datos. Puede recibir mensajes de seguimiento.',
  },
  revoked: {
    label: 'Revocado',
    explanation:
      'El cliente retiró su autorización. No recibirá mensajes y sus mensajes pendientes se cancelaron. Puedes registrar una nueva autorización.',
  },
};

export type ConsentFormValues = { date: LocalDate; medium: ConsentMedium | ''; notes: string };
export type ConsentFormErrors = Partial<Record<'date' | 'medium', string>>;

/** `today` es el día local del negocio: la fecha declarada no puede ser posterior. */
export function validateConsentForm(
  values: ConsentFormValues,
  today: LocalDate,
): ConsentFormErrors {
  const errors: ConsentFormErrors = {};
  if (values.date === '') errors.date = 'Ingresa la fecha.';
  else if (values.date > today) errors.date = 'La fecha no puede ser futura.';
  if (values.medium === '') errors.medium = 'Selecciona el medio.';
  return errors;
}

/** La fecha declarada se envía como el inicio de ese día en la zona horaria del negocio. */
export function toConsentBody(
  values: ConsentFormValues,
  kind: ConsentKind,
  timeZone: string,
): ConsentBody {
  const notes = values.notes.trim();
  return {
    kind,
    medium: values.medium as ConsentMedium,
    occurred_at: zonedInstant(values.date, '00:00', timeZone),
    ...(notes === '' ? {} : { notes }),
  };
}
