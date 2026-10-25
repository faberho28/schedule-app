import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { appointment, IDS } from '@/test/api';
import { AgendaList } from './AgendaList';

const TZ = 'America/Bogota';

const ANA = appointment({ id: IDS.apt1 });
const OTHER = appointment({
  id: IDS.apt2,
  starts_at: '2026-10-25T15:00:00.000Z',
  ends_at: '2026-10-25T16:00:00.000Z',
  status: 'completed',
  customer: { id: IDS.customer, name: null, alias: 'bear_1', phone: '' },
  technician: { id: IDS.marta, name: null, alias: 'fox_2' },
});

describe('AgendaList', () => {
  it('muestra cada servicio como una fila con hora, cliente, tipo de servicio, técnico y estado', () => {
    render(<AgendaList appointments={[ANA]} timeZone={TZ} onSelect={vi.fn()} />);

    const list = screen.getByRole('list');
    const row = within(list).getByRole('button', {
      name: '08:00-09:30, Ana Pérez, Mantenimiento de aire, Carlos, Confirmado',
    });
    expect(row).toHaveTextContent('08:00-09:30');
    expect(row).toHaveTextContent('Ana Pérez');
    expect(row).toHaveTextContent('Mantenimiento de aire');
    expect(row).toHaveTextContent('Carlos');
    expect(row).toHaveTextContent('Confirmado');
  });

  it('el estado lleva texto además del color', () => {
    render(<AgendaList appointments={[OTHER]} timeZone={TZ} onSelect={vi.fn()} />);
    expect(screen.getByText('Completado')).toBeInTheDocument();
  });

  it('un cliente y un técnico anonimizados se muestran con su alias', () => {
    render(<AgendaList appointments={[OTHER]} timeZone={TZ} onSelect={vi.fn()} />);

    const row = screen.getByRole('button');
    expect(row).toHaveTextContent('Cliente eliminado (bear_1)');
    expect(row).toHaveTextContent('Técnico eliminado (fox_2)');
    expect(row).not.toHaveTextContent('Ana');
  });

  it('cada fila tiene al menos 44 px de alto táctil', () => {
    render(<AgendaList appointments={[ANA]} timeZone={TZ} onSelect={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveClass('min-h-11');
  });

  it('al tocar una fila avisa con el id del servicio', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<AgendaList appointments={[ANA]} timeZone={TZ} onSelect={onSelect} />);

    await user.click(screen.getByRole('button'));

    expect(onSelect).toHaveBeenCalledWith(IDS.apt1);
  });

  it('con groupByDay agrupa por día con un encabezado por grupo', () => {
    render(<AgendaList appointments={[OTHER, ANA]} timeZone={TZ} onSelect={vi.fn()} groupByDay />);

    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'dom 25 oct',
      'vie 6 nov',
    ]);
    expect(screen.getAllByRole('list')).toHaveLength(2);
  });

  it('sin servicios muestra el mensaje de lista vacía', () => {
    render(<AgendaList appointments={[]} timeZone={TZ} onSelect={vi.fn()} />);

    expect(screen.getByText('No hay servicios para estos filtros')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
