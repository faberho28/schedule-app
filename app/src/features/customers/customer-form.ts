import type { components } from '@/shared/api/schema';

export type CreateCustomerBody = components['schemas']['CreateCustomerDto'];
export type UpdateCustomerBody = components['schemas']['UpdateCustomerDto'];

export type CustomerFormValues = { name: string; phone: string };
export type CustomerFormErrors = Partial<Record<keyof CustomerFormValues, string>>;

/** Datos completos de la ficha: además del nombre y el teléfono, la dirección guardada y las notas. */
export type CustomerDataValues = CustomerFormValues & { address: string; notes: string };

/** Prefijo de Colombia con el que arranca el campo de teléfono. */
export const DEFAULT_PHONE_PREFIX = '+57';

const E164 = /^\+[1-9][0-9]{7,14}$/;

export function emptyCustomerForm(): CustomerFormValues {
  return { name: '', phone: DEFAULT_PHONE_PREFIX };
}

export function emptyCustomerData(): CustomerDataValues {
  return { ...emptyCustomerForm(), address: '', notes: '' };
}

/** Valores del formulario de edición a partir del cliente guardado. */
export function customerDataOf(
  customer: Pick<components['schemas']['Customer'], 'name' | 'phone' | 'address' | 'notes'>,
): CustomerDataValues {
  return {
    name: customer.name,
    phone: customer.phone,
    address: customer.address ?? '',
    notes: customer.notes ?? '',
  };
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

/** Alta con dirección y notas; los campos vacíos se omiten. */
export function toCreateCustomerDataBody(values: CustomerDataValues): CreateCustomerBody {
  const address = values.address.trim();
  const notes = values.notes.trim();
  return {
    ...toCreateCustomerBody(values),
    ...(address === '' ? {} : { address }),
    ...(notes === '' ? {} : { notes }),
  };
}

/** Cuerpo del PATCH: solo los campos que cambiaron; un texto vacío borra la dirección o las notas. */
export function customerChanges(
  current: Pick<components['schemas']['Customer'], 'name' | 'phone' | 'address' | 'notes'>,
  values: CustomerDataValues,
): UpdateCustomerBody {
  const body: UpdateCustomerBody = {};
  const name = values.name.trim();
  const phone = compactPhone(values.phone);
  const address = values.address.trim() === '' ? null : values.address.trim();
  const notes = values.notes.trim() === '' ? null : values.notes.trim();
  if (name !== current.name) body.name = name;
  if (phone !== current.phone) body.phone = phone;
  if (address !== current.address) body.address = address;
  if (notes !== current.notes) body.notes = notes;
  return body;
}
