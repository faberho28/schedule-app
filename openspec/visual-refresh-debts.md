# Deudas de la renovación visual (sprint 2.2)

Rama: `feat/sprint-2-2-ui-refresh`. Lista de lo que quedó fuera o requiere decisión.

## Excepciones de contraste AA aceptadas

Declaradas en `app/src/theme/tokens.test.ts` (`ACCEPTED_AA_EXCEPTIONS`), todas en tema claro, con el motivo "aceptado por el brief de diseño del usuario" (decisión del 2026-10-25). La prueba falla si alguna empeora.

| Texto | Fondo | Relación |
| --- | --- | --- |
| `primary-foreground` | `primary` | 3,78:1 |
| `sidebar-primary-foreground` | `sidebar-primary` | 3,78:1 |
| `destructive-foreground` | `destructive` | 3,76:1 |
| `muted-foreground` | `muted` | 4,39:1 |
| `text-subtle` | `card` | 2,54:1 |
| `text-subtle` | `background` | 2,43:1 |
| `accent-foreground` | `accent` | 4,05:1 |
| `sidebar-accent-foreground` | `sidebar-accent` | 4,05:1 |
| `event-green-text` | `event-green-bg` | 4,49:1 |

Nota: los avisos de éxito y los `Badge` verdes usan el último par.

## Pendiente de diseño

- El selector de técnicos sigue siendo un `fieldset` de casillas siempre visible y los filtros de la agenda siguen siendo chips. El brief pedía popover y selects; cambiarlos obliga a reescribir unas 55 aserciones de pruebas.
- No hay indicador de la hora actual en la grilla de la agenda.

## Pruebas

- `ProfilePage.test.tsx` falló de forma intermitente bajo carga, visto dos veces. No se investigó la causa.

## Ramas y archivos sueltos

- Ramas sin fusionar: `feat/sprint-1-owner-pwa`, `feat/sprint-2-owner-panel`, `feat/sprint-2-1-visual` y esta rama. `feat/sprint-2-1-visual` es el rediseño rechazado y se puede borrar.
- La carpeta `.claude/` está sin versionar y no se debe agregar al repositorio.
- `api/package-lock.json` aparece modificado en el árbol de trabajo y no forma parte de esta rama.

## Seguridad de dependencias

- Los hallazgos de `npm audit` en dependencias de ejecución siguen los ya registrados en `debts.md` del sprint 2 archivado (`openspec/changes/archive/2026-10-25-sprint-2-owner-panel/`).

## Otros hallazgos

- Los tokens `--status-*` ya no los usan los componentes (todo el estado visual sale de `Badge` y `STATUS_STYLES`); siguen definidos y probados. Se pueden retirar en una limpieza posterior junto con su prueba de contraste.
- Los `radio` y `checkbox` nativos de los diálogos de cierre y de los listados conservan el estilo del navegador.
- No se pudo revisar nada en un navegador real durante esta fase: el aspecto de diálogos, avisos y pantallas pendientes de ajuste fino debe validarse a ojo.
