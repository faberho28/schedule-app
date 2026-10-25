import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AgendaDatePicker } from './AgendaDatePicker';

describe('AgendaDatePicker', () => {
  it('muestra la fecha formateada en un botón, sin etiqueta "Fecha" visible', () => {
    render(<AgendaDatePicker date="2026-10-25" onChange={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Fecha: 25 oct 2026' });
    expect(button).toHaveTextContent('25 oct 2026');
    expect(screen.queryByText('Fecha')).not.toBeInTheDocument();
  });

  it('abre un calendario en el mes de la fecha y marca el día elegido', async () => {
    render(<AgendaDatePicker date="2026-10-25" onChange={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /^Fecha:/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/octubre 2026/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('gridcell', { selected: true })).toHaveTextContent('25');
  });

  it('al elegir un día avisa con la fecha local y cierra el calendario', async () => {
    const onChange = vi.fn();
    render(<AgendaDatePicker date="2026-10-25" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: /^Fecha:/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /15 de octubre/i }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-10-15');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('al elegir de nuevo el día actual solo cierra el calendario', async () => {
    const onChange = vi.fn();
    render(<AgendaDatePicker date="2026-10-25" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: /^Fecha:/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /25 de octubre/i }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
