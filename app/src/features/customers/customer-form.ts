import type { components } from '@/shared/api/schema';

export type CreateCustomerBody = components['schemas']['CreateCustomerDto'];

export type CustomerFormValues = { name: string; phone: string };
export type CustomerFormErrors = Partial<Record<keyof CustomerFormValues, string>>;

/** Prefijo de Colombia con el que arranca el campo de teléfono. */
export const DEFAULT_PHONE_PREFIX = '+57';

const E164 = /^\+[1-9][0-9]{7,14}$/;

export function emptyCustomerForm(): CustomerFormValues {
  return { name: '', phone: DEFAULT_PHONE_PREFIX };
}

/** Quita espacios, guiones y paréntesis que la persona escribe para leer mejor el número. */
function compactPhone(phone: string): string {
  return phone.replace(/[\s\-().]/g, '');
}

export function validateCustomerForm(values: CustomerFormValues): CustomerFormErrors {
  const errors: CustomerFormErrors = {};
  if (values.name.trim() === '') errors.name = 'Ingresa el nombre del cliente.';
  if (!E164.test(compactPhone(values.phone))) {
    errors.phone = 'Ingresa el teléfono con código de país, por ejemplo +573001234567.';
  }
  return errors;
}

export function toCreateCustomerBody(values: CustomerFormValues): CreateCustomerBody {
  return { name: values.name.trim(), phone: compactPhone(values.phone) };
}
