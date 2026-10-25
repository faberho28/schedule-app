import { describe, expect, it } from 'vitest';
import {
  VOCABULARY_EXCEPTIONS,
  extractHtmlStrings,
  extractVisibleStrings,
  scanApp,
  violationsOf,
} from './test/vocabulary-scan';

const visible = (code: string, file = 'x.tsx') => extractVisibleStrings(file, code);
const rulesOf = (file: string, text: string) => violationsOf(file, text).map((v) => v.rule);

describe('escáner de texto visible', () => {
  it('extrae literales, plantillas y texto JSX', () => {
    const code =
      'const a = \'uno\'; const b = `dos ${a} tres`; const c = <p title="cuatro">cinco</p>;';

    expect(visible(code)).toEqual(['uno', 'dos ', ' tres', 'cuatro', 'cinco']);
  });

  it('ignora identificadores, comentarios y rutas importadas', () => {
    const code = "import x from '@/cita/ruta';\n// Nueva cita\nconst appointmentId = 1;";

    expect(visible(code)).toEqual([]);
  });

  it('extrae el texto de index.html sin los scripts', () => {
    const html =
      '<meta name="description" content="Agenda de citas para tu negocio" /><title>Schedule</title><script>// cita</script>';

    expect(extractHtmlStrings(html)).toEqual(['Agenda de citas para tu negocio', 'Schedule']);
  });
});

describe('reglas de vocabulario', () => {
  it('rechaza "cita" como palabra completa', () => {
    expect(rulesOf('a.tsx', 'Nueva cita')).toEqual(['cita']);
    expect(rulesOf('a.tsx', 'Citas de hoy')).toEqual(['cita']);
  });

  it('acepta palabras que solo contienen "cita" y rutas', () => {
    for (const text of [
      'Necesitas internet',
      'Solicita un cupo',
      '/appointments',
      'appointmentId',
    ]) {
      expect(rulesOf('a.tsx', text), text).toEqual([]);
    }
  });

  it('rechaza voseo, también con la tilde final', () => {
    for (const text of ['Elegí un cupo', 'Tenés que elegir', 'Hacé clic', 'vos podés']) {
      expect(rulesOf('a.tsx', text), text).toContain('voseo');
    }
    expect(rulesOf('a.tsx', 'Elige un cupo')).toEqual([]);
  });

  it('exige "tipo de servicio" en los contextos del catálogo', () => {
    expect(rulesOf('src/app/nav-items.ts', 'Servicios')).toEqual(['catalogo']);
    expect(rulesOf('src/app/nav-items.ts', 'Tipos de servicio')).toEqual([]);
    expect(
      rulesOf('src/features/settings/ServiceFormDialog.tsx', 'Nuevo tipo de servicio'),
    ).toEqual([]);
    expect(rulesOf('src/features/settings/ServiceFormDialog.tsx', 'Crear servicio')).toEqual([
      'catalogo',
    ]);
    expect(
      rulesOf(
        'src/features/settings/ServiceFormDialog.tsx',
        'No modifican los servicios ya agendados.',
      ),
    ).toEqual([]);
    expect(
      rulesOf('src/shared/lib/error-messages.ts', 'Ya existe un servicio con ese nombre.'),
    ).toEqual(['catalogo']);
  });

  it('acepta "servicio" fuera de los contextos del catálogo', () => {
    expect(rulesOf('src/shared/lib/error-messages.ts', 'Servicio cancelado.')).toEqual([]);
    expect(rulesOf('src/features/agenda/AgendaPage.tsx', 'Nuevo servicio')).toEqual([]);
    expect(
      rulesOf('src/features/appointments/CreateAppointmentDialog.tsx', 'Nuevo servicio'),
    ).toEqual([]);
  });
});

describe('vocabulario de la interfaz', () => {
  it('no tiene excepciones registradas', () => {
    expect(VOCABULARY_EXCEPTIONS).toEqual([]);
  });

  it('no usa "cita", voseo ni "servicio" con sentido de catálogo en texto visible', () => {
    const violations = scanApp(process.cwd());
    const report = violations.map((v) => `${v.file} [${v.rule}] "${v.text}" - ${v.detail}`);

    expect(report, `${violations.length} infracciones`).toEqual([]);
  });
});
