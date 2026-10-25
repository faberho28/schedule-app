import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TechnicianSelector, type SelectorOption } from './TechnicianSelector';
import { SELECTION_STORAGE_KEY, type SelectableTechnician } from './technician-selection';
import { useTechnicianSelection } from './use-technician-selection';

const option = (id: string, overrides: Partial<SelectorOption> = {}): SelectorOption => ({
  id,
  label: id.toUpperCase(),
  inactive: false,
  colorIndex: 1,
  ...overrides,
});

const ids = (count: number) =>
  Array.from({ length: count }, (_, index) => `t${String(index + 1).padStart(2, '0')}`);

describe('TechnicianSelector: presentación', () => {
  it('muestra una casilla por técnico dentro del grupo "Técnicos" con su color', () => {
    render(
      <TechnicianSelector
        options={[option('ana', { colorIndex: 3 }), option('beto', { colorIndex: 7 })]}
        selectedIds={['ana']}
        onToggle={vi.fn()}
      />,
    );

    const group = screen.getByRole('group', { name: 'Técnicos' });
    expect(group.tagName).toBe('FIELDSET');
    const ana = within(group).getByRole('checkbox', { name: 'ANA' });
    const beto = within(group).getByRole('checkbox', { name: 'BETO' });
    expect(ana).toBeChecked();
    expect(beto).not.toBeChecked();
    expect(ana.closest('label')?.querySelector('[data-color-index]')).toHaveAttribute(
      'data-color-index',
      '3',
    );
    expect(beto.closest('label')?.querySelector('[data-color-index]')).toHaveAttribute(
      'data-color-index',
      '7',
    );
  });

  it('marca como inactivo al técnico desactivado y no a los demás', () => {
    render(
      <TechnicianSelector
        options={[option('ana'), option('beto', { inactive: true })]}
        selectedIds={['ana', 'beto']}
        onToggle={vi.fn()}
      />,
    );

    const beto = screen.getByRole('checkbox', { name: /BETO/ });
    expect(beto).toHaveAccessibleName('BETO Inactivo');
    expect(within(beto.closest('label')!).getByText('Inactivo')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'ANA' })).toBeInTheDocument();
    expect(screen.getAllByText('Inactivo')).toHaveLength(1);
  });

  it('avisa el id del técnico al marcarlo con el ratón', async () => {
    const onToggle = vi.fn();
    render(
      <TechnicianSelector
        options={[option('ana'), option('beto')]}
        selectedIds={['ana']}
        onToggle={onToggle}
      />,
    );

    await userEvent.click(screen.getByRole('checkbox', { name: 'BETO' }));

    expect(onToggle).toHaveBeenCalledExactlyOnceWith('beto');
  });

  it('se opera con el teclado: Tab llega a la casilla y la barra espaciadora la marca', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <TechnicianSelector
        options={[option('ana'), option('beto')]}
        selectedIds={['ana']}
        onToggle={onToggle}
      />,
    );

    await user.tab();
    await user.tab();
    expect(screen.getByRole('checkbox', { name: 'BETO' })).toHaveFocus();
    await user.keyboard(' ');

    expect(onToggle).toHaveBeenCalledExactlyOnceWith('beto');
  });
});

describe('TechnicianSelector: tope', () => {
  const eleven = ids(11).map((id) => option(id));

  it('con 10 marcados deshabilita las demás casillas y muestra el aviso', () => {
    render(<TechnicianSelector options={eleven} selectedIds={ids(10)} onToggle={vi.fn()} />);

    expect(screen.getByRole('checkbox', { name: 'T11' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'T01' })).toBeEnabled();
    expect(screen.getByText('Máximo 10 técnicos visibles')).toBeInTheDocument();
  });

  it('con menos de 10 marcados no deshabilita nada ni muestra el aviso', () => {
    render(<TechnicianSelector options={eleven} selectedIds={ids(9)} onToggle={vi.fn()} />);

    expect(screen.getByRole('checkbox', { name: 'T11' })).toBeEnabled();
    expect(screen.queryByText('Máximo 10 técnicos visibles')).not.toBeInTheDocument();
  });

  it('una casilla deshabilitada no avisa al marcarla', async () => {
    const onToggle = vi.fn();
    render(<TechnicianSelector options={eleven} selectedIds={ids(10)} onToggle={onToggle} />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'T11' }));

    expect(onToggle).not.toHaveBeenCalled();
  });
});

const TECHNICIANS: SelectableTechnician[] = ids(14).map((id) => ({
  id,
  active: true,
  anonymized_at: null,
}));

function Harness({ technicians = TECHNICIANS }: { technicians?: SelectableTechnician[] }) {
  const { selectedIds, toggle } = useTechnicianSelection(technicians, new Set());
  return (
    <>
      <TechnicianSelector
        options={technicians.map((t) => option(t.id))}
        selectedIds={selectedIds}
        onToggle={toggle}
      />
      <output aria-label="Seleccionados">{selectedIds.join(',')}</output>
    </>
  );
}

describe('TechnicianSelector con la selección guardada', () => {
  it('sin nada guardado marca los 10 más antiguos y bloquea el resto', () => {
    render(<Harness />);

    expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(10);
    expect(screen.getByRole('checkbox', { name: 'T11' })).toBeDisabled();
    expect(screen.getByText('Máximo 10 técnicos visibles')).toBeInTheDocument();
  });

  it('la selección de 3 técnicos sobrevive a remontar el componente', async () => {
    const user = userEvent.setup();
    const first = render(<Harness />);
    // Se desmarcan 7 de los 10 por defecto y queda solo t01, t02 y t03.
    for (const id of ids(10).slice(3)) {
      await user.click(screen.getByRole('checkbox', { name: id.toUpperCase() }));
    }
    expect(screen.getByLabelText('Seleccionados')).toHaveTextContent('t01,t02,t03');
    expect(JSON.parse(localStorage.getItem(SELECTION_STORAGE_KEY)!)).toEqual({
      version: 1,
      ids: ['t01', 't02', 't03'],
    });

    first.unmount();
    render(<Harness />);

    expect(screen.getByLabelText('Seleccionados')).toHaveTextContent('t01,t02,t03');
    expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(3);
  });

  it('al desmarcar uno con el tope alcanzado se puede marcar otro', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('checkbox', { name: 'T01' }));
    await user.click(screen.getByRole('checkbox', { name: 'T11' }));

    expect(screen.getByLabelText('Seleccionados')).toHaveTextContent(
      't02,t03,t04,t05,t06,t07,t08,t09,t10,t11',
    );
  });

  it('desmarcar a todos deja la selección vacía durante la sesión', async () => {
    const user = userEvent.setup();
    render(<Harness technicians={TECHNICIANS.slice(0, 2)} />);

    await user.click(screen.getByRole('checkbox', { name: 'T01' }));
    await user.click(screen.getByRole('checkbox', { name: 'T02' }));

    expect(screen.getByLabelText('Seleccionados')).toHaveTextContent('');
    expect(screen.queryAllByRole('checkbox', { checked: true })).toHaveLength(0);
  });

  it('una selección vacía recordada vuelve al valor por defecto al recargar', async () => {
    const user = userEvent.setup();
    const first = render(<Harness technicians={TECHNICIANS.slice(0, 2)} />);
    await user.click(screen.getByRole('checkbox', { name: 'T01' }));
    await user.click(screen.getByRole('checkbox', { name: 'T02' }));
    first.unmount();

    render(<Harness technicians={TECHNICIANS.slice(0, 2)} />);

    expect(screen.getByLabelText('Seleccionados')).toHaveTextContent('t01,t02');
  });
});
