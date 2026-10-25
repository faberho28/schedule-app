import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { SegmentedControl } from './SegmentedControl';

const OPTIONS = [
  { value: 'day', label: 'Día' },
  { value: 'week', label: 'Semana' },
] as const;

function Harness() {
  const [value, setValue] = useState<'day' | 'week'>('day');
  return (
    <SegmentedControl label="Vista" options={[...OPTIONS]} value={value} onValueChange={setValue} />
  );
}

describe('SegmentedControl', () => {
  it('marca la opción activa con la pill de marca y cambia al pulsar otra', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const day = screen.getByRole('radio', { name: 'Día' });
    const week = screen.getByRole('radio', { name: 'Semana' });
    expect(screen.getByRole('radiogroup', { name: 'Vista' })).toBeInTheDocument();
    expect(day).toBeChecked();
    expect(day).toHaveClass('data-[state=on]:bg-brand', 'data-[state=on]:text-brand-foreground');

    await user.click(week);

    expect(week).toBeChecked();
    expect(day).not.toBeChecked();
  });

  it('no se queda sin selección al pulsar la opción activa', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('radio', { name: 'Día' }));

    expect(screen.getByRole('radio', { name: 'Día' })).toBeChecked();
  });
});
