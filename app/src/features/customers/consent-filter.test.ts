import { describe, expect, it } from 'vitest';
import { customer } from '@/test/api';
import { CONSENT_FILTER_OPTIONS, filterByConsent } from './consent-filter';

const GRANTED = customer({ id: 'a', consent_status: 'granted' });
const PENDING = customer({ id: 'b', consent_status: 'pending' });
const REVOKED = customer({ id: 'c', consent_status: 'revoked' });
const ALL = [GRANTED, PENDING, REVOKED];

describe('CONSENT_FILTER_OPTIONS', () => {
  it('ofrece Todos primero y luego cada estado de consentimiento, en español', () => {
    expect(CONSENT_FILTER_OPTIONS.map((option) => [option.value, option.label])).toEqual([
      ['all', 'Todos'],
      ['granted', 'Otorgado'],
      ['pending', 'Pendiente'],
      ['revoked', 'Revocado'],
    ]);
  });
});

describe('filterByConsent', () => {
  it('con "all" devuelve a todos, en el mismo orden', () => {
    expect(filterByConsent(ALL, 'all')).toEqual(ALL);
  });

  it.each([
    ['granted', [GRANTED]],
    ['pending', [PENDING]],
    ['revoked', [REVOKED]],
  ] as const)('con "%s" deja solo ese estado', (value, expected) => {
    expect(filterByConsent(ALL, value)).toEqual(expected);
  });

  it('no incluye a los clientes eliminados al filtrar por un estado', () => {
    const erased = customer({
      id: 'd',
      consent_status: 'granted',
      anonymized_at: '2026-10-10T12:00:00.000Z',
    });

    expect(filterByConsent([GRANTED, erased], 'granted')).toEqual([GRANTED]);
    expect(filterByConsent([GRANTED, erased], 'all')).toEqual([GRANTED, erased]);
  });
});
