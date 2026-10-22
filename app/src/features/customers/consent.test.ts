import { describe, expect, it } from 'vitest';
import {
  CONSENT_MEDIA,
  CONSENT_STATUS_INFO,
  mediumLabel,
  toConsentBody,
  validateConsentForm,
} from './consent';

describe('medios de autorización', () => {
  it('muestra cada valor del enum con su etiqueta en español', () => {
    expect(CONSENT_MEDIA).toEqual([
      { value: 'in_person', label: 'En persona' },
      { value: 'phone_call', label: 'Llamada telefónica' },
      { value: 'whatsapp', label: 'WhatsApp' },
      { value: 'written', label: 'Formulario o documento escrito' },
      { value: 'other', label: 'Otro' },
    ]);
    expect(mediumLabel('written')).toBe('Formulario o documento escrito');
  });
});

describe('estado del consentimiento', () => {
  it('explica qué significa cada estado para los mensajes', () => {
    expect(CONSENT_STATUS_INFO.pending.label).toBe('Pendiente');
    expect(CONSENT_STATUS_INFO.granted.label).toBe('Otorgado');
    expect(CONSENT_STATUS_INFO.revoked.label).toBe('Revocado');
    expect(CONSENT_STATUS_INFO.pending.explanation).toMatch(/no se enviarán mensajes/i);
    expect(CONSENT_STATUS_INFO.granted.explanation).toMatch(/puede recibir mensajes/i);
    expect(CONSENT_STATUS_INFO.revoked.explanation).toMatch(/cancelaron/i);
  });
});

describe('validateConsentForm', () => {
  const today = '2026-10-22';

  it('acepta una fecha pasada o de hoy con medio', () => {
    expect(
      validateConsentForm({ date: '2026-10-15', medium: 'in_person', notes: '' }, today),
    ).toEqual({});
    expect(validateConsentForm({ date: today, medium: 'other', notes: '' }, today)).toEqual({});
  });

  it('exige el medio', () => {
    expect(validateConsentForm({ date: today, medium: '', notes: '' }, today)).toEqual({
      medium: 'Selecciona el medio.',
    });
  });

  it('exige la fecha', () => {
    expect(validateConsentForm({ date: '', medium: 'whatsapp', notes: '' }, today)).toEqual({
      date: 'Ingresa la fecha.',
    });
  });

  it('rechaza una fecha futura', () => {
    expect(
      validateConsentForm({ date: '2026-10-23', medium: 'whatsapp', notes: '' }, today),
    ).toEqual({ date: 'La fecha no puede ser futura.' });
  });
});

describe('toConsentBody', () => {
  it('envía el inicio del día en la zona del negocio y omite notas vacías', () => {
    expect(
      toConsentBody(
        { date: '2026-10-15', medium: 'in_person', notes: '  ' },
        'granted',
        'America/Bogota',
      ),
    ).toEqual({ kind: 'granted', medium: 'in_person', occurred_at: '2026-10-15T05:00:00.000Z' });
  });

  it('incluye las notas recortadas y el tipo de evento', () => {
    expect(
      toConsentBody(
        { date: '2026-10-15', medium: 'phone_call', notes: ' Llamó ella ' },
        'revoked',
        'America/Bogota',
      ),
    ).toEqual({
      kind: 'revoked',
      medium: 'phone_call',
      occurred_at: '2026-10-15T05:00:00.000Z',
      notes: 'Llamó ella',
    });
  });
});
