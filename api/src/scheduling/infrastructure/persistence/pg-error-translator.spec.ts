import { DatabaseError } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  CustomerPhoneTakenError,
  DomainError,
  ServiceNameTakenError,
  SlotTakenError,
} from '../../domain/errors';
import { translatePgError } from './pg-error-translator';

function pgError(code: string, constraint?: string): DatabaseError {
  const error = new DatabaseError('violation', 0, 'error');
  error.code = code;
  if (constraint !== undefined) error.constraint = constraint;
  return error;
}

describe('DomainError', () => {
  it('expone un code estable y conserva la causa original', () => {
    const cause = new Error('origen');
    const error = new DomainError('invalid_transition', 'No se puede pasar de A a B', { cause });
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('invalid_transition');
    expect(error.message).toBe('No se puede pasar de A a B');
    expect(error.cause).toBe(cause);
  });
});

describe('translatePgError', () => {
  it('traduce 23P01 sobre appointments_no_overlap a slot_taken', () => {
    const original = pgError('23P01', 'appointments_no_overlap');
    const translated = translatePgError(original);
    expect(translated).toBeInstanceOf(SlotTakenError);
    expect(translated).toMatchObject({ code: 'slot_taken', cause: original });
  });

  it('traduce 23505 sobre el teléfono único del cliente a customer_phone_taken', () => {
    const original = pgError('23505', 'uq_customers_business_phone');
    const translated = translatePgError(original);
    expect(translated).toBeInstanceOf(CustomerPhoneTakenError);
    expect(translated).toMatchObject({ code: 'customer_phone_taken', cause: original });
  });

  it('traduce 23505 sobre el nombre único de servicio a service_name_taken', () => {
    const original = pgError('23505', 'uq_services_business_name');
    const translated = translatePgError(original);
    expect(translated).toBeInstanceOf(ServiceNameTakenError);
    expect(translated).toMatchObject({ code: 'service_name_taken', cause: original });
  });

  it('deja intactos los errores de pg que no tienen traducción', () => {
    const overlapElsewhere = pgError('23P01', 'availability_no_overlap');
    const otherUnique = pgError('23505', 'uq_customers_business_alias');
    const noConstraint = pgError('23P01');
    expect(translatePgError(overlapElsewhere)).toBe(overlapElsewhere);
    expect(translatePgError(otherUnique)).toBe(otherUnique);
    expect(translatePgError(noConstraint)).toBe(noConstraint);
  });

  it('devuelve tal cual lo que no es un error de pg', () => {
    const plain = new Error('boom');
    const domain = new SlotTakenError();
    expect(translatePgError(plain)).toBe(plain);
    expect(translatePgError(domain)).toBe(domain);
    expect(translatePgError('texto')).toBe('texto');
    expect(translatePgError(null)).toBeNull();
  });

  it('acepta objetos con la forma de un error de pg (code y constraint)', () => {
    const translated = translatePgError({ code: '23P01', constraint: 'appointments_no_overlap' });
    expect(translated).toBeInstanceOf(SlotTakenError);
  });
});
