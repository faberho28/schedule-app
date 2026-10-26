import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeRects, setRect } from '@/test/rects';
import { setDesktopViewport } from '@/test/viewport';
import {
  AgendaGrid,
  type AgendaAppointment,
  type AgendaGridProps,
  type GridTechnician,
} from './AgendaGrid';

beforeEach(() => setDesktopViewport());
installFakeRects();

/** `dnd-kit` limpia sus escuchas y engancha el teclado un turno después: se espera uno. */
const tick = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
// Una prueba puede dejar un arrastre sin soltar. `dnd-kit` no retira sus escuchas del documento al
// desmontarse (en uso real el arrastre siempre termina con un `pointerup`), y su bloqueo de clics se
// tragaría el clic de la prueba siguiente. Aquí se suelta y se cancela todo antes de desmontar, y se
// espera los 50 ms con que `dnd-kit` retira el bloqueo.
afterEach(async () => {
  fireEvent.pointerUp(document);
  fireEvent.keyDown(document, { code: 'Escape', key: 'Escape' });
  cleanup();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
});

const CARLOS = 'tech-carlos';
const MARTA = 'tech-marta';
const TECHNICIANS: GridTechnician[] = [
  { id: CARLOS, name: 'Carlos', initials: 'CA', colorIndex: 1 },
  { id: MARTA, name: 'Marta', initials: 'MA', colorIndex: 2 },
];

// 2026-11-06 de 08:00 a 09:30 locales (America/Bogota es UTC-5).
const EVENT: AgendaAppointment = {
  id: 'apt-1',
  technicianId: CARLOS,
  startsAt: '2026-11-06T13:00:00Z',
  endsAt: '2026-11-06T14:30:00Z',
  occupiedUntil: '2026-11-06T14:30:00Z',
  status: 'confirmed',
  customerName: 'Ana Pérez',
  serviceName: 'Mantenimiento de aire',
  technicianChanged: false,
};

const WEEK = [
  '2026-11-02',
  '2026-11-03',
  '2026-11-04',
  '2026-11-05',
  '2026-11-06',
  '2026-11-07',
  '2026-11-08',
];

// Geometría falsa: eje de 56 px, encabezado de 56 px, columnas de 200 px y 1,25 px por minuto.
const AXIS = 56;
const HEADER = 56;
const COLUMN = 200;
const PX_PER_MINUTE = 1.25;

function renderGrid(overrides: Partial<AgendaGridProps> = {}) {
  const props: AgendaGridProps = {
    view: 'day',
    days: ['2026-11-06'],
    timeZone: 'America/Bogota',
    technicians: TECHNICIANS,
    appointments: [EVENT],
    visibleHours: { startMinute: 7 * 60, endMinute: 19 * 60 },
    onAppointmentSelect: vi.fn(),
    onOverflowSelect: vi.fn(),
    onEventDrop: vi.fn(),
    ...overrides,
  };
  render(<AgendaGrid {...props} />);

  const columns = Array.from(document.querySelectorAll<HTMLElement>('[data-slot="column-body"]'));
  columns.forEach((column, index) =>
    setRect(column, {
      left: AXIS + index * COLUMN,
      top: HEADER,
      width: COLUMN,
      height: 12 * 60 * PX_PER_MINUTE,
    }),
  );
  const card = screen.getByRole('button', { name: /Ana Pérez/ });
  // El servicio de las 08:00 está 60 min (75 px) bajo el inicio de la ventana de las 07:00.
  setRect(card, { left: AXIS, top: HEADER + 75, width: COLUMN, height: 90 * PX_PER_MINUTE });
  return { props, columns, card };
}

/** Pulsa el servicio y lo arrastra por el documento a un punto dado. */
function dragTo(card: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }) {
  fireEvent.pointerDown(card, {
    clientX: from.x,
    clientY: from.y,
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    isPrimary: true,
  });
  // Un primer movimiento supera los 5 px de activación.
  fireEvent.pointerMove(document, { clientX: from.x + 8, clientY: from.y + 8, pointerId: 1 });
  fireEvent.pointerMove(document, { clientX: to.x, clientY: to.y, pointerId: 1 });
}

function release(at: { x: number; y: number }) {
  fireEvent.pointerUp(document, { clientX: at.x, clientY: at.y, pointerId: 1 });
}

const START = { x: AXIS + 100, y: HEADER + 75 + 20 };

describe('AgendaGrid: arrastrar servicios', () => {
  it('sin manejador de soltado los servicios no se arrastran', () => {
    const { card } = renderGrid({ onEventDrop: undefined });

    expect(card).toHaveClass('cursor-pointer');
    expect(card).not.toHaveAttribute('aria-roledescription');
  });

  it('con manejador, el servicio es arrastrable: cursor de agarrar y descripción para lectores', () => {
    const { card } = renderGrid();

    expect(card).toHaveClass('cursor-grab');
    expect(card).toHaveAttribute('aria-roledescription', 'servicio arrastrable');
  });

  it('isDraggable decide servicio por servicio: el que no se puede mover sigue siendo clicable', async () => {
    const { card, props } = renderGrid({ isDraggable: () => false });

    expect(card).toHaveClass('cursor-pointer');
    expect(card).not.toHaveAttribute('aria-roledescription');
    dragTo(card, START, { x: START.x, y: START.y + 100 });
    release({ x: START.x, y: START.y + 100 });

    expect(props.onEventDrop).not.toHaveBeenCalled();
  });

  it('un clic sin movimiento sigue abriendo el servicio', () => {
    const { card, props } = renderGrid();

    fireEvent.pointerDown(card, { clientX: START.x, clientY: START.y, pointerId: 1, button: 0 });
    fireEvent.pointerUp(document, { clientX: START.x, clientY: START.y, pointerId: 1 });
    fireEvent.click(card);

    expect(props.onAppointmentSelect).toHaveBeenCalledExactlyOnceWith('apt-1');
    expect(props.onEventDrop).not.toHaveBeenCalled();
  });

  it('un movimiento de menos de 5 px no inicia el arrastre', () => {
    const { card } = renderGrid();

    fireEvent.pointerDown(card, { clientX: START.x, clientY: START.y, pointerId: 1, button: 0 });
    fireEvent.pointerMove(document, { clientX: START.x + 2, clientY: START.y + 2, pointerId: 1 });

    expect(card).not.toHaveClass('opacity-40');
    expect(document.querySelector('[data-slot="drag-preview"]')).not.toBeInTheDocument();
  });

  it('al arrastrar, el original se atenúa y la vista previa aparece en el destino con la hora en vivo', () => {
    const { card } = renderGrid();

    // 75 px bajan 60 min: de 08:00–09:30 a 09:00–10:30.
    dragTo(card, START, { x: START.x, y: START.y + 75 });

    expect(card).toHaveClass('opacity-40', 'cursor-grabbing');
    const preview = document.querySelector('[data-slot="drag-preview"]')!;
    expect(preview).toHaveTextContent('09:00–10:30');
    expect(preview).toHaveAttribute('data-state', 'valid');
    expect(within(screen.getByRole('region', { name: 'Carlos' })).getByText('09:00–10:30')).toBe(
      preview.firstElementChild,
    );
  });

  it('la vista previa se ajusta a pasos de 15 min', () => {
    const { card } = renderGrid();

    // 40 px son 32 min; el ajuste visual a pasos de 18,75 px la deja en 30 min.
    dragTo(card, START, { x: START.x, y: START.y + 40 });

    expect(document.querySelector('[data-slot="drag-preview"]')).toHaveTextContent('08:30–10:00');
  });

  it('al soltar avisa el servicio, el nuevo inicio y fin en UTC, sin técnico si no cambió', () => {
    const { card, props } = renderGrid();

    dragTo(card, START, { x: START.x, y: START.y + 75 });
    release({ x: START.x, y: START.y + 75 });

    expect(props.onEventDrop).toHaveBeenCalledExactlyOnceWith(
      EVENT,
      '2026-11-06T14:00:00.000Z',
      '2026-11-06T15:30:00.000Z',
      undefined,
    );
    expect(document.querySelector('[data-slot="drag-preview"]')).not.toBeInTheDocument();
    expect(card).not.toHaveClass('opacity-40');
  });

  it('en el día, arrastrar a la columna de otro técnico avisa el técnico destino y usa su color', () => {
    const { card, props } = renderGrid();

    dragTo(card, START, { x: START.x + COLUMN, y: START.y });

    const preview = document.querySelector<HTMLElement>('[data-slot="drag-preview"]')!;
    expect(within(screen.getByRole('region', { name: 'Marta' })).getByText('08:00–09:30')).toBe(
      preview.firstElementChild,
    );
    expect(preview.getAttribute('style')).toContain('var(--tech-2-bg)');
    release({ x: START.x + COLUMN, y: START.y });

    expect(props.onEventDrop).toHaveBeenCalledExactlyOnceWith(
      EVENT,
      '2026-11-06T13:00:00.000Z',
      '2026-11-06T14:30:00.000Z',
      MARTA,
    );
  });

  it('soltarlo donde estaba no avisa ningún cambio', () => {
    const { card, props } = renderGrid();

    dragTo(card, START, { x: START.x, y: START.y });
    release({ x: START.x, y: START.y });

    expect(props.onEventDrop).not.toHaveBeenCalled();
  });

  it('en la semana, arrastrar a otro día avisa el nuevo día y el mismo técnico', () => {
    const { card, props } = renderGrid({ view: 'week', days: WEEK });

    // El viernes es la quinta columna; el miércoles, la tercera (dos columnas a la izquierda).
    // Se reubica la tarjeta en la quinta columna.
    setRect(card, { left: AXIS + 4 * COLUMN, top: HEADER + 75, width: COLUMN, height: 112.5 });
    const from = { x: AXIS + 4 * COLUMN + 100, y: HEADER + 95 };
    const to = { x: AXIS + 2 * COLUMN + 100, y: HEADER + 95 };
    dragTo(card, from, to);
    release(to);

    expect(props.onEventDrop).toHaveBeenCalledExactlyOnceWith(
      EVENT,
      '2026-11-04T13:00:00.000Z',
      '2026-11-04T14:30:00.000Z',
      undefined,
    );
  });

  it('soltarlo fuera de las columnas cancela el movimiento', () => {
    const { card, props } = renderGrid();

    dragTo(card, START, { x: 5, y: 5 });
    release({ x: 5, y: 5 });

    expect(props.onEventDrop).not.toHaveBeenCalled();
    expect(document.querySelector('[data-slot="drag-preview"]')).not.toBeInTheDocument();
  });

  it('Escape cancela el arrastre', () => {
    const { card, props } = renderGrid();

    dragTo(card, START, { x: START.x, y: START.y + 75 });
    fireEvent.keyDown(document, { code: 'Escape', key: 'Escape' });
    release({ x: START.x, y: START.y + 75 });

    expect(props.onEventDrop).not.toHaveBeenCalled();
    expect(document.querySelector('[data-slot="drag-preview"]')).not.toBeInTheDocument();
    expect(card).not.toHaveClass('opacity-40');
  });
});

describe('AgendaGrid: destinos válidos e inválidos', () => {
  it('consulta getDropState con el servicio y el destino calculado', () => {
    const getDropState = vi.fn().mockReturnValue('valid');
    const { card } = renderGrid({ getDropState });

    dragTo(card, START, { x: START.x + COLUMN, y: START.y + 75 });

    expect(getDropState).toHaveBeenLastCalledWith(
      EVENT,
      expect.objectContaining({
        day: '2026-11-06',
        startMinute: 9 * 60,
        endMinute: 10 * 60 + 30,
        startsAt: '2026-11-06T14:00:00.000Z',
        endsAt: '2026-11-06T15:30:00.000Z',
        technicianId: MARTA,
      }),
    );
  });

  it('un destino inválido pinta la vista previa en tonos de peligro con el mensaje en un tooltip', async () => {
    const { card } = renderGrid({
      getDropState: () => 'invalid',
      getDropMessage: () => 'Marta no está libre a esa hora',
    });

    dragTo(card, START, { x: START.x + COLUMN, y: START.y + 75 });

    const preview = document.querySelector('[data-slot="drag-preview"]')!;
    expect(preview).toHaveAttribute('data-state', 'invalid');
    expect(preview).toHaveClass('bg-destructive/10', 'border-destructive', 'text-destructive');
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Marta no está libre a esa hora');
  });

  it('el cursor de la columna destino es "no permitido" cuando es inválido', () => {
    const { card, columns } = renderGrid({ getDropState: () => 'invalid' });

    dragTo(card, START, { x: START.x + COLUMN, y: START.y + 75 });

    expect(columns[1]).toHaveClass('data-[drop=invalid]:cursor-not-allowed');
    expect(columns[1]).toHaveAttribute('data-drop', 'invalid');
    expect(columns[0]).not.toHaveAttribute('data-drop');
  });

  it('soltar en un destino inválido no avisa ningún movimiento', () => {
    const { card, props } = renderGrid({ getDropState: () => 'invalid' });

    dragTo(card, START, { x: START.x, y: START.y + 75 });
    release({ x: START.x, y: START.y + 75 });

    expect(props.onEventDrop).not.toHaveBeenCalled();
  });

  it('sin getDropState todo destino se considera válido', () => {
    const { card } = renderGrid();

    dragTo(card, START, { x: START.x, y: START.y + 75 });

    expect(document.querySelector('[data-slot="drag-preview"]')).toHaveAttribute(
      'data-state',
      'valid',
    );
  });
});

describe('AgendaGrid: arrastrar con teclado', () => {
  it('Enter no levanta el servicio: abre el detalle', () => {
    const { card, props } = renderGrid();

    card.focus();
    fireEvent.keyDown(card, { code: 'Enter', key: 'Enter' });
    fireEvent.click(card);

    expect(props.onAppointmentSelect).toHaveBeenCalledExactlyOnceWith('apt-1');
    expect(card).not.toHaveClass('opacity-40');
  });

  it('Espacio levanta el servicio, las flechas lo mueven de a 15 min y Espacio lo suelta', async () => {
    const { card, props } = renderGrid();

    card.focus();
    fireEvent.keyDown(card, { code: 'Space', key: ' ' });
    expect(card).toHaveClass('opacity-40');
    await tick();
    for (let step = 0; step < 4; step += 1) {
      fireEvent.keyDown(document, { code: 'ArrowDown', key: 'ArrowDown' });
    }
    expect(document.querySelector('[data-slot="drag-preview"]')).toHaveTextContent('09:00–10:30');
    fireEvent.keyDown(document, { code: 'Space', key: ' ' });

    expect(props.onEventDrop).toHaveBeenCalledExactlyOnceWith(
      EVENT,
      '2026-11-06T14:00:00.000Z',
      '2026-11-06T15:30:00.000Z',
      undefined,
    );
  });

  it('anuncia en español cómo mover el servicio', () => {
    renderGrid();

    expect(document.body).toHaveTextContent(/pulsa la barra espaciadora/i);
  });
});

describe('AgendaGrid: redimensionar servicios', () => {
  const handleOf = (card: HTMLElement) =>
    card.querySelector<HTMLElement>('[data-slot="resize-handle"]');

  it('sin manejador de redimensionado los servicios no tienen asa', () => {
    const { card } = renderGrid();

    expect(handleOf(card)).not.toBeInTheDocument();
  });

  it('con manejador cada servicio tiene su asa en el borde inferior', () => {
    const { card } = renderGrid({ onEventResize: vi.fn() });

    expect(handleOf(card)).toBeInTheDocument();
  });

  it('isResizable decide servicio por servicio', () => {
    const { card } = renderGrid({ onEventResize: vi.fn(), isResizable: () => false });

    expect(handleOf(card)).not.toBeInTheDocument();
  });

  it('mientras se estira, el fin se actualiza en vivo dentro del servicio y el bloque crece', () => {
    const { card } = renderGrid({ onEventResize: vi.fn() });
    const handle = handleOf(card)!;

    fireEvent.pointerDown(handle, { clientY: 200, pointerId: 2, button: 0 });
    // 25 px son 20 minutos: 09:30 + 20 = 09:50, que se ajusta a 09:45.
    fireEvent.pointerMove(handle, { clientY: 225, pointerId: 2 });

    expect(within(card).getByText('08:00–09:45')).toBeInTheDocument();
    expect(card).toHaveAccessibleName(expect.stringContaining('08:00 a 09:45'));
    // 08:00 está en la fila 5 (4 filas de 15 min tras las 07:00); de 6 filas pasa a 7.
    expect(card.closest('li')).toHaveStyle({ gridRow: '5 / span 7' });
  });

  it('al soltar avisa el servicio y el nuevo fin en UTC', () => {
    const { card, props } = renderGrid({ onEventResize: vi.fn() });
    const handle = handleOf(card)!;

    fireEvent.pointerDown(handle, { clientY: 200, pointerId: 2, button: 0 });
    fireEvent.pointerMove(handle, { clientY: 225, pointerId: 2 });
    fireEvent.pointerUp(handle, { clientY: 225, pointerId: 2 });

    expect(props.onEventResize).toHaveBeenCalledExactlyOnceWith(EVENT, '2026-11-06T14:45:00.000Z');
    expect(within(card).getByText('08:00–09:30')).toBeInTheDocument();
  });

  it('un estiramiento que no cambia el fin no avisa nada', () => {
    const { card, props } = renderGrid({ onEventResize: vi.fn() });
    const handle = handleOf(card)!;

    fireEvent.pointerDown(handle, { clientY: 200, pointerId: 2, button: 0 });
    fireEvent.pointerUp(handle, { clientY: 204, pointerId: 2 });

    expect(props.onEventResize).not.toHaveBeenCalled();
  });

  it('cancelar el gesto devuelve el servicio a su tamaño', () => {
    const { card, props } = renderGrid({ onEventResize: vi.fn() });
    const handle = handleOf(card)!;

    fireEvent.pointerDown(handle, { clientY: 200, pointerId: 2, button: 0 });
    fireEvent.pointerMove(handle, { clientY: 260, pointerId: 2 });
    fireEvent.pointerCancel(handle, { pointerId: 2 });

    expect(props.onEventResize).not.toHaveBeenCalled();
    expect(within(card).getByText('08:00–09:30')).toBeInTheDocument();
  });

  it('estirar no inicia un arrastre ni abre el servicio', () => {
    const { card, props } = renderGrid({ onEventResize: vi.fn() });
    const handle = handleOf(card)!;

    fireEvent.pointerDown(handle, { clientX: 100, clientY: 200, pointerId: 2, button: 0 });
    fireEvent.pointerMove(document, { clientX: 100, clientY: 260, pointerId: 2 });
    fireEvent.pointerUp(handle, { clientX: 100, clientY: 260, pointerId: 2 });
    fireEvent.click(handle);

    expect(document.querySelector('[data-slot="drag-preview"]')).not.toBeInTheDocument();
    expect(props.onEventDrop).not.toHaveBeenCalled();
    expect(props.onAppointmentSelect).not.toHaveBeenCalled();
  });
});

describe('AgendaGrid: arrastrar con el dedo', () => {
  it('tras mantener pulsado 250 ms el servicio se levanta con una leve escala', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { card } = renderGrid();

      fireEvent.touchStart(card, {
        touches: [{ clientX: START.x, clientY: START.y, identifier: 1 }],
      });
      expect(card).not.toHaveClass('scale-[1.02]');
      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(card).toHaveClass('scale-[1.02]', 'opacity-40');
    } finally {
      vi.useRealTimers();
    }
  });
});
