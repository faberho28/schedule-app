import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CircleCheck, Clock } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { EventBlock, type EventBlockProps } from './EventBlock';

const base: EventBlockProps = {
  label: 'Bloque de prueba',
  colorIndex: 3,
  time: '08:00–09:30',
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

    expect(screen.getByText('08:00–09:30')).toHaveClass(
      'tabular-nums',
      'font-semibold',
      'whitespace-nowrap',
    );
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

  it('el cliente se trunca en una línea y el servicio y el técnico se ocultan en bloques angostos', () => {
    const { container } = render(<EventBlock {...base} />);

    expect(screen.getByText('Ana Pérez')).toHaveClass('truncate', 'font-semibold');
    expect(screen.getByRole('button')).toHaveClass('@container/event');
    // Bajo ~120 px de ancho del bloque solo quedan hora, estado y cliente.
    expect(container.querySelector('[data-slot="event-details"]')).toHaveClass(
      'hidden',
      '@[120px]/event:flex',
    );
  });

  it('muestra el cliente, el servicio y el técnico en un tooltip al pasar el cursor', async () => {
    render(<EventBlock {...base} />);

    await userEvent.hover(screen.getByRole('button'));

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Ana Pérez');
    expect(tooltip).toHaveTextContent('Instalación');
    expect(tooltip).toHaveTextContent('Carlos Ruiz');
  });

  it('un servicio confirmado muestra solo un ícono de 12 px, sin insignia de ancho completo', () => {
    render(
      <EventBlock
        {...base}
        iconOnlyStatus
        status={{ label: 'Confirmado', icon: CircleCheck, variant: 'blue' }}
      />,
    );

    expect(screen.getByRole('img', { name: 'Confirmado' })).toHaveClass('size-3');
    expect(screen.queryByText('Confirmado')).not.toBeInTheDocument();
  });

  it('los demás estados usan una insignia compacta con ícono y texto', () => {
    render(<EventBlock {...base} />);

    expect(screen.getByText('Pendiente')).toHaveClass(
      'h-5',
      'px-1.5',
      'text-[10px]',
      'rounded-full',
    );
  });

  it('la zona de traslado es secundaria y se explica con un tooltip', () => {
    const { container } = render(<EventBlock {...base} tailRows={2} />);

    const tail = container.querySelector('[data-slot="event-tail"]');
    expect(tail).toHaveClass('opacity-60');
    expect(tail).toHaveAttribute('title', 'Tiempo de traslado');
  });

  it('avisa al pulsarlo', async () => {
    const onClick = vi.fn();
    render(<EventBlock {...base} onClick={onClick} />);

    await userEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledOnce();
  });
});
