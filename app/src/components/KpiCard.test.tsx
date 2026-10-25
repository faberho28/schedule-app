import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { KpiCard } from './KpiCard';

describe('KpiCard', () => {
  it('es un grupo con el nombre de su etiqueta y muestra valor, sufijo y línea secundaria', () => {
    render(<KpiCard label="Técnicos activos" value="3" suffix="/5" secondary="Hoy" />);

    const card = screen.getByRole('group', { name: 'Técnicos activos' });
    expect(within(card).getByText('3')).toBeInTheDocument();
    expect(within(card).getByText('/5')).toBeInTheDocument();
    expect(within(card).getByText('Hoy')).toBeInTheDocument();
  });

  it('oculta el ícono decorativo a los lectores de pantalla', () => {
    render(<KpiCard label="Servicios hoy" value="4" icon={<svg data-testid="icon" />} />);

    expect(screen.getByTestId('icon').parentElement).toHaveAttribute('aria-hidden', 'true');
  });

  it('renderiza el pie (footer) cuando se entrega', () => {
    render(<KpiCard label="Eficiencia" value="67 %" footer={<div data-testid="bar" />} />);

    expect(screen.getByTestId('bar')).toBeInTheDocument();
  });

  it('con href es un enlace cuyo nombre incluye etiqueta y valor', () => {
    render(
      <MemoryRouter>
        <KpiCard label="Servicios pendientes" value="2" href="/agenda" secondary="Ver" />
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: /Servicios pendientes/ });
    expect(link).toHaveAttribute('href', '/agenda');
    expect(link).toHaveAccessibleName(/2/);
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  it('el tono de atención usa los tokens ámbar', () => {
    render(
      <MemoryRouter>
        <KpiCard label="Pendientes" value="2" href="/agenda" tone="attention" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link')).toHaveClass('bg-event-amber-bg');
  });
});
