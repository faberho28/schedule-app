// MOCK: reemplazar en la fase de autenticación.
// Datos simulados del Perfil: no hay inicio de sesión ni usuario real. Solo los archivos de
// `features/profile` pueden importar este módulo (lo verifica `profile-mock.guard.test.ts`).
// Ver `openspec/changes/sprint-2-owner-panel/debts.md`.

export const MOCK_PROFILE = { name: 'Dueño del negocio' };

export const MOCK_PROFILE_NOTICE = 'Perfil de demostración. Aún no hay inicio de sesión.';
