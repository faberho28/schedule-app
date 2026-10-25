import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TechnicianFilter, type TechnicianFilterProps } from './TechnicianFilter';
import type { SelectorOption } from './technician-view';
import { reconcileSelection, SELECTION_STORAGE_KEY } from './technician-selection';
import type { SelectableTechnician } from './technician-selection';
import { useTechnicianSelection } from './use-technician-selection';

const option = (id: string, overrides: Partial<SelectorOption> = {}): SelectorOption => ({
  id,
  label: id.toUpperCase(),
  initials: id.slice(0, 2).toUpperCase(),
  inactive: false,
  colorIndex: 1,
  ...overrides,
});

const ids = (count: number) =>
  Array.from({ length: count }, (_, index) => `t${String(index + 1).padStart(2, '0')}`);

function renderFilter(overrides: Partial<TechnicianFilterProps> = {}) {
  const props: TechnicianFilterProps = {
    options: [option('ana'), option('beto'), option('carla')],
    selectedIds: ['ana', 'beto', 'carla'],
    counts: new Map(),
    showCancelled: false,
    canReset: false,
    onToggle: vi.fn(),
    onSelectAll: vi.fn(),
    onClear: vi.fn(),
    onShowCancelledChange: vi.fn(),
    onReset: vi.fn(),
    ...overrides,
  };
  render(<TechnicianFilter {...props} />);
  return props;
}

const trigger = () => screen.getByRole('button', { name: /^Técnicos/ });

async function open() {
  await userEvent.click(trigger());
  return screen.findByRole('dialog');
}

describe('TechnicianFilter: botón', () => {
  it('con todos marcados dice "Todos" en gris y mide 40 px', () => {
    renderFilter();

    expect(trigger()).toHaveAccessibleName('Técnicos: todos');
    expect(trigger()).toHaveClass('h-10');
    expect(within(trigger()).getByText('Todos')).toHaveClass('text-muted-foreground');
  });

  it('con una selección parcial muestra cuántos hay en una insignia', () => {
    renderFilter({ selectedIds: ['ana', 'beto'] });

    expect(trigger()).toHaveAccessibleName('Técnicos: 2 de 3');
    expect(within(trigger()).getByText('2')).toHaveClass(
      'h-5',
      'min-w-5',
      'rounded-full',
      'bg-primary',
      'text-primary-foreground',
    );
    expect(within(trigger()).queryByText('Todos')).not.toBeInTheDocument();
  });

  it('con ninguno marcado lo dice', () => {
    renderFilter({ selectedIds: [] });

    expect(trigger()).toHaveAccessibleName('Técnicos: ninguno');
  });

  it('con los cancelados visibles lo señala con un punto y en su nombre', () => {
    renderFilter({ showCancelled: true });

    expect(trigger()).toHaveAccessibleName('Técnicos: todos, con cancelados');
    expect(trigger().querySelector('[data-slot="cancelled-indicator"]')).toBeInTheDocument();
  });

  it('sin los cancelados no dibuja el punto', () => {
    renderFilter();

    expect(trigger().querySelector('[data-slot="cancelled-indicator"]')).not.toBeInTheDocument();
  });
});

describe('TechnicianFilter: lista', () => {
  it('abre un diálogo con "Seleccionar todos" y una fila por técnico con su cantidad de servicios', async () => {
    renderFilter({ counts: new Map([['ana', 4]]) });

    const dialog = await open();

    expect(within(dialog).getByRole('checkbox', { name: 'Seleccionar todos' })).toBeChecked();
    for (const name of ['ANA', 'BETO', 'CARLA']) {
      expect(within(dialog).getByRole('checkbox', { name })).toBeChecked();
    }
    expect(within(within(dialog).getByRole('option', { name: /ANA/ })).getByText('4')).toHaveClass(
      'text-xs',
      'text-muted-foreground',
    );
  });

  it('"Seleccionar todos" queda indeterminado con una selección parcial', async () => {
    renderFilter({ selectedIds: ['ana'] });

    const dialog = await open();

    expect(
      within(dialog).getByRole('checkbox', { name: 'Seleccionar todos' }),
    ).toBePartiallyChecked();
  });

  it('cada técnico lleva su color en la casilla y en el avatar con iniciales', async () => {
    renderFilter({
      options: [option('ana', { colorIndex: 3, initials: 'AN' })],
      selectedIds: ['ana'],
    });

    const dialog = await open();

    const box = within(dialog).getByRole('checkbox', { name: 'ANA' });
    expect(box).toHaveAttribute('data-color-index', '3');
    expect(box.getAttribute('style')).toContain('var(--tech-3-border)');
    expect(box).toHaveClass(
      'data-[state=checked]:bg-(--tech-color)',
      'data-[state=checked]:border-(--tech-color)',
    );
    const initials = within(dialog).getByText('AN');
    expect(initials.closest('[data-slot="avatar"]')).toHaveClass('size-6');
    const style = initials.getAttribute('style') ?? '';
    expect(style).toContain('var(--tech-3-bg)');
    expect(style).toContain('var(--tech-3-text)');
  });

  it('marca como inactivo al técnico desactivado', async () => {
    renderFilter({
      options: [option('ana'), option('beto', { inactive: true })],
      selectedIds: ['ana', 'beto'],
    });

    const dialog = await open();

    expect(within(dialog).getByRole('checkbox', { name: 'BETO Inactivo' })).toBeInTheDocument();
    expect(within(dialog).getAllByText('Inactivo')).toHaveLength(1);
  });

  it('pulsar en cualquier parte de la fila alterna al técnico y no cierra el diálogo', async () => {
    const props = renderFilter();

    const dialog = await open();
    await userEvent.click(within(dialog).getByText('BETO'));

    expect(props.onToggle).toHaveBeenCalledExactlyOnceWith('beto');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('pulsar la casilla avisa una sola vez', async () => {
    const props = renderFilter();

    const dialog = await open();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'CARLA' }));

    expect(props.onToggle).toHaveBeenCalledExactlyOnceWith('carla');
  });

  it('se opera con el teclado: las flechas recorren las filas y Enter alterna', async () => {
    const user = userEvent.setup();
    const props = renderFilter();

    await open();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(props.onToggle).toHaveBeenCalledOnce();
  });
});

describe('TechnicianFilter: seleccionar todos', () => {
  it('con una selección parcial pide seleccionar a todos', async () => {
    const props = renderFilter({ selectedIds: ['ana'] });

    const dialog = await open();
    await userEvent.click(within(dialog).getByText('Seleccionar todos'));

    expect(props.onSelectAll).toHaveBeenCalledOnce();
    expect(props.onClear).not.toHaveBeenCalled();
  });

  it('con todos marcados pide quitar la selección', async () => {
    const props = renderFilter();

    const dialog = await open();
    await userEvent.click(within(dialog).getByText('Seleccionar todos'));

    expect(props.onClear).toHaveBeenCalledOnce();
    expect(props.onSelectAll).not.toHaveBeenCalled();
  });
});

describe('TechnicianFilter: búsqueda', () => {
  it('con 6 técnicos o menos no muestra el campo de búsqueda', async () => {
    renderFilter({ options: ids(6).map((id) => option(id)), selectedIds: ids(6) });

    await open();

    expect(screen.queryByPlaceholderText('Buscar técnico…')).not.toBeInTheDocument();
  });

  it('con más de 6 filtra por nombre sin distinguir tildes y avisa si no hay resultados', async () => {
    const user = userEvent.setup();
    const options = [...ids(6).map((id) => option(id)), option('maria', { label: 'María Pérez' })];
    renderFilter({ options, selectedIds: ids(6) });

    const dialog = await open();
    const search = within(dialog).getByPlaceholderText('Buscar técnico…');
    await user.type(search, 'maria');

    expect(within(dialog).getByRole('checkbox', { name: 'María Pérez' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox', { name: 'T01' })).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'zzz');

    expect(within(dialog).getByText('Sin resultados')).toBeInTheDocument();
  });
});

describe('TechnicianFilter: tope', () => {
  const eleven = ids(11).map((id) => option(id));

  it('con 10 marcados deshabilita las demás filas y muestra el aviso', async () => {
    renderFilter({ options: eleven, selectedIds: ids(10) });

    const dialog = await open();

    expect(within(dialog).getByRole('checkbox', { name: 'T11' })).toBeDisabled();
    expect(within(dialog).getByRole('checkbox', { name: 'T01' })).toBeEnabled();
    expect(within(dialog).getByText('Máximo 10 técnicos visibles')).toBeInTheDocument();
  });

  it('con menos de 10 marcados no deshabilita nada ni muestra el aviso', async () => {
    renderFilter({ options: eleven, selectedIds: ids(9) });

    const dialog = await open();

    expect(within(dialog).getByRole('checkbox', { name: 'T11' })).toBeEnabled();
    expect(within(dialog).queryByText('Máximo 10 técnicos visibles')).not.toBeInTheDocument();
  });

  it('una fila deshabilitada no avisa al pulsarla', async () => {
    const props = renderFilter({ options: eleven, selectedIds: ids(10) });

    const dialog = await open();
    await userEvent.click(within(dialog).getByText('T11'));

    expect(props.onToggle).not.toHaveBeenCalled();
  });

  it('con 10 marcados de 11, "Seleccionar todos" cuenta como completo', async () => {
    renderFilter({ options: eleven, selectedIds: ids(10) });

    const dialog = await open();

    expect(within(dialog).getByRole('checkbox', { name: 'Seleccionar todos' })).toBeChecked();
  });
});

describe('TechnicianFilter: cancelados y restablecer', () => {
  it('"Mostrar cancelados" es un interruptor con borde visible alineado a la derecha', async () => {
    const props = renderFilter();

    const dialog = await open();
    const toggle = within(dialog).getByRole('switch', { name: 'Mostrar cancelados' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveClass('data-[state=unchecked]:bg-input', 'border');
    expect(toggle.closest('label')).toHaveClass('justify-between');

    await userEvent.click(toggle);

    expect(props.onShowCancelledChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('"Restablecer filtros" está deshabilitado sin filtros aplicados', async () => {
    renderFilter({ canReset: false });

    const dialog = await open();

    expect(within(dialog).getByRole('button', { name: 'Restablecer filtros' })).toBeDisabled();
  });

  it('con filtros aplicados "Restablecer filtros" avisa', async () => {
    const props = renderFilter({ canReset: true });

    const dialog = await open();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Restablecer filtros' }));

    expect(props.onReset).toHaveBeenCalledOnce();
  });
});

const TECHNICIANS: SelectableTechnician[] = ids(14).map((id) => ({
  id,
  active: true,
  anonymized_at: null,
}));

function Harness() {
  const selection = useTechnicianSelection(TECHNICIANS, new Set());
  const options = TECHNICIANS.map((t) => option(t.id));
  return (
    <>
      <TechnicianFilter
        options={options}
        selectedIds={selection.selectedIds}
        counts={new Map()}
        showCancelled={false}
        canReset={selection.selectedIds.join() !== selection.defaultIds.join()}
        onToggle={selection.toggle}
        onSelectAll={() => selection.selectAll(options.map((o) => o.id))}
        onClear={selection.clear}
        onShowCancelledChange={vi.fn()}
        onReset={selection.reset}
      />
      <output aria-label="Seleccionados">{selection.selectedIds.join(',')}</output>
    </>
  );
}

describe('TechnicianFilter con la selección guardada', () => {
  it('sin nada guardado marca los 10 más antiguos y bloquea el resto', async () => {
    render(<Harness />);

    const dialog = await open();

    expect(within(dialog).getAllByRole('checkbox', { checked: true })).toHaveLength(11);
    expect(within(dialog).getByRole('checkbox', { name: 'T11' })).toBeDisabled();
  });

  it('la selección de 3 técnicos sobrevive a remontar el componente', async () => {
    const user = userEvent.setup();
    const first = render(<Harness />);
    const dialog = await open();
    // Se desmarcan 7 de los 10 por defecto y queda solo t01, t02 y t03.
    for (const id of ids(10).slice(3)) {
      await user.click(within(dialog).getByRole('checkbox', { name: id.toUpperCase() }));
    }
    expect(screen.getByLabelText('Seleccionados')).toHaveTextContent('t01,t02,t03');
    expect(JSON.parse(localStorage.getItem(SELECTION_STORAGE_KEY)!)).toEqual({
      version: 1,
      ids: ['t01', 't02', 't03'],
    });

    first.unmount();
    render(<Harness />);

    expect(screen.getByLabelText('Seleccionados')).toHaveTextContent('t01,t02,t03');
    expect(trigger()).toHaveAccessibleName('Técnicos: 3 de 14');
  });

  it('"Seleccionar todos" marca los 10 primeros cuando hay más de 10', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const dialog = await open();
    await user.click(within(dialog).getByRole('checkbox', { name: 'T01' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'T02' }));
    expect(screen.getByLabelText('Seleccionados').textContent!.split(',')).toHaveLength(8);

    await user.click(within(dialog).getByText('Seleccionar todos'));

    expect(screen.getByLabelText('Seleccionados').textContent).toBe(ids(10).join(','));
  });

  it('quitar a todos deja la selección vacía y "Restablecer filtros" vuelve a los 10 más antiguos', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const dialog = await open();

    await user.click(within(dialog).getByText('Seleccionar todos'));
    expect(screen.getByLabelText('Seleccionados')).toHaveTextContent('');
    expect(trigger()).toHaveAccessibleName('Técnicos: ninguno');

    await user.click(within(dialog).getByRole('button', { name: 'Restablecer filtros' }));
    expect(screen.getByLabelText('Seleccionados').textContent).toBe(
      reconcileSelection(null, TECHNICIANS, new Set()).join(','),
    );
  });
});
