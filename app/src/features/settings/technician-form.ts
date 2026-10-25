import type { components } from '@/shared/api/schema';
import type { CreateTechnicianBody, UpdateTechnicianBody } from './technicians-api';

type Technician = components['schemas']['Technician'];

export type TechnicianFormValues = { name: string; phone: string };

export function validateTechnicianForm({ name }: TechnicianFormValues): { name?: string } {
  return name.trim() === '' ? { name: 'El nombre es obligatorio.' } : {};
}

/** Cuerpo de `POST /technicians`; el teléfono vacío se omite. */
export function toCreateTechnicianBody({
  name,
  phone,
}: TechnicianFormValues): CreateTechnicianBody {
  const trimmedPhone = phone.trim();
  return { name: name.trim(), ...(trimmedPhone === '' ? {} : { phone: trimmedPhone }) };
}

/** Cuerpo de `PATCH /technicians/:id` con solo lo que cambió; un teléfono vacío lo borra (`null`). */
export function technicianChanges(
  current: Pick<Technician, 'name' | 'phone'>,
  values: TechnicianFormValues,
): UpdateTechnicianBody {
  const changes: UpdateTechnicianBody = {};
  const name = values.name.trim();
  if (name !== current.name) changes.name = name;
  const phone = values.phone.trim() === '' ? null : values.phone.trim();
  if (phone !== current.phone) changes.phone = phone;
  return changes;
}
