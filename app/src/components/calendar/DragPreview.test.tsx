import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DragPreview } from './DragPreview';

const WINDOW = { startMinute: 7 * 60, endMinute: 19 * 60 };

function renderPreview(props: Partial<React.ComponentProps<typeof DragPreview>> = {}) {
  const { container } = render(
    <div className="relative">
      <DragPreview
        range={{ startMinute: 14 * 60, endMinute: 17 * 60 }}
        window={WINDOW}
        colorIndex={3}
        customer="Ana Pérez"
        state="valid"
        {...props}
      />
    </div>,
  );
  return container.querySelector<HTMLElement>('[data-slot="drag-preview"]')!;
}

describe('DragPreview', () => {
  it('se ubica y mide según el rango, con la hora nueva en vivo', () => {
    const preview = renderPreview();

    // 14:00 está a 420 min de las 07:00 = 525 px; 3 h son 225 px.
    expect(preview.style.top).toBe('525px');
    expect(preview.style.height).toBe('225px');
    expect(preview).toHaveTextContent('14:00–17:00');
    expect(preview).toHaveTextContent('Ana Pérez');
  });

  it('es una vista previa: no recibe el puntero y se destaca con sombra y anillo', () => {
    const preview = renderPreview();

    expect(preview).toHaveClass('pointer-events-none', 'shadow-lg', 'ring-2', 'ring-primary/30');
  });

  it('válida usa el color del técnico destino', () => {
    const preview = renderPreview({ colorIndex: 5 });

    const style = preview.getAttribute('style') ?? '';
    expect(style).toContain('var(--tech-5-bg)');
    expect(style).toContain('var(--tech-5-border)');
    expect(style).toContain('var(--tech-5-text)');
    expect(preview).toHaveAttribute('data-state', 'valid');
    expect(preview).not.toHaveClass('bg-destructive/10');
  });

  it('inválida se pinta con los tonos de peligro y cursor de no permitido', () => {
    const preview = renderPreview({ state: 'invalid' });

    expect(preview).toHaveAttribute('data-state', 'invalid');
    expect(preview).toHaveClass(
      'bg-destructive/10',
      'border-destructive',
      'text-destructive',
      'cursor-not-allowed',
    );
    expect(preview.getAttribute('style') ?? '').not.toContain('--tech-5');
  });

  it('inválida con mensaje lo muestra en un tooltip abierto', async () => {
    renderPreview({ state: 'invalid', message: 'Marta no tiene ese horario libre' });

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Marta no tiene ese horario libre',
    );
  });

  it('inválida sin mensaje no abre ningún tooltip', () => {
    renderPreview({ state: 'invalid' });

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('válida no abre tooltip aunque haya mensaje', () => {
    renderPreview({ message: 'No debería verse' });

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
