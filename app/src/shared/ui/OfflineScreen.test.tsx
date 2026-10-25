import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OfflineScreen } from './OfflineScreen';

const OFFLINE_TEXT =
  'Sin conexión. Necesitas internet para ver y modificar la agenda. Reintenta cuando recuperes señal.';

describe('OfflineScreen', () => {
  it('muestra el texto exacto de la especificación y el botón "Reintentar"', () => {
    render(<OfflineScreen onRetry={() => {}} />);

    expect(screen.getByText(OFFLINE_TEXT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeEnabled();
  });

  it('no muestra datos de agenda', () => {
    render(<OfflineScreen onRetry={() => {}} />);

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByText(/cita/i)).not.toBeInTheDocument();
  });

  it('llama a onRetry cada vez que se pulsa "Reintentar"', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<OfflineScreen onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('desactiva el botón mientras se comprueba la conexión', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<OfflineScreen onRetry={onRetry} retrying />);

    const button = screen.getByRole('button', { name: 'Reintentar' });
    expect(button).toBeDisabled();
    await user.click(button);

    expect(onRetry).not.toHaveBeenCalled();
  });
});
