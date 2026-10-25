import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Clock } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { EventBlock, type EventBlockProps } from './EventBlock';

const base: EventBlockProps = {
  label: 'Bloque de prueba',
  colorIndex: 3,
  time: '08:00 – 09:30',
  customer: 'Ana Pérez',
  serviceName: 'Instalación',
  technicianName: 'Carlos Ruiz',
  technicianInitials: 'CR',
  status: { label: 'Pendiente', icon: Clock, variant: 'amber' },
  bodyRows: 6,
  tailRows: 0,
  onClick: () => undefined,
};

describe('EventBlock', () => {
  it('pinta fondo pastel, borde izquierdo y texto con los tokens del color del técnico', () => {
    render(<EventBlock {...base} />);

    const block = screen.getByRole('button', { name: 'Bloque de prueba' });
    expect(block).toHaveAttribute('data-color-index', '3');
    const style = block.getAttribute('style') ?? '';
    expect(style).toContain('var(--tech-3-bg)');
    expect(style).toContain('var(--tech-3-text)');
    expect(style).toContain('var(--tech-3-border)');
    expect(block).toHaveClass('border-l-[3px]', 'rounded-md');
  });

  it('muestra hora, estado con ícono y texto, cliente, servicio y técnico (nunca solo color)', () => {
    render(<EventBlock {...base} />);

    expect(screen.getByText('08:00 – 09:30')).toHaveClass('tabular-nums', 'font-semibold');
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByText('Ana Pérez')).toHaveClass('font-semibold');
    expect(screen.getByText(/Instalación/)).toBeInTheDocument();
    expect(screen.getByText('CR')).toBeInTheDocument();
    expect(screen.getByText('Carlos Ruiz')).toBeInTheDocument();
  });

  it('un servicio cancelado se atenúa y tacha al cliente', () => {
    render(<EventBlock {...base} cancelled />);

    expect(screen.getByRole('button')).toHaveClass('opacity-70');
    expect(screen.getByText('Ana Pérez')).toHaveClass('line-through');
  });

  it('indica el cambio de técnico y el cierre anticipado con texto', () => {
    render(<EventBlock {...base} technicianChanged closedEarly />);

    expect(screen.getByText('Técnico cambiado')).toBeInTheDocument();
    expect(screen.getByText('Cierre anticipado')).toBeInTheDocument();
  });

  it('dibuja la cola de traslado como zona decorativa distinta y omite el cuerpo sin filas', () => {
    const { container, rerender } = render(<EventBlock {...base} tailRows={2} />);
    expect(container.querySelector('[data-slot="event-tail"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );

    rerender(<EventBlock {...base} bodyRows={0} tailRows={2} />);
    expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument();
  });

  it('avisa al pulsarlo', async () => {
    const onClick = vi.fn();
    render(<EventBlock {...base} onClick={onClick} />);

    await userEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledOnce();
  });
});
