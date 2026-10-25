import type { ReactNode } from 'react';
import { Notice } from '@/shared/ui/Notice';

type ChoiceRadioProps = {
  name: string;
  checked: boolean;
  onSelect(): void;
  children: ReactNode;
};

/** Opción de un grupo de radios con objetivo táctil de 44 px. */
export function ChoiceRadio({ name, checked, onSelect, children }: ChoiceRadioProps) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm">
      <input type="radio" name={name} className="size-5" checked={checked} onChange={onSelect} />
      {children}
    </label>
  );
}

type ConfirmCheckboxProps = {
  checked: boolean;
  onChange(checked: boolean): void;
  error?: string;
  children: ReactNode;
};

/** Casilla de confirmación reforzada, con su error asociado. */
export function ConfirmCheckbox({ checked, onChange, error, children }: ConfirmCheckboxProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
        <input
          type="checkbox"
          className="size-5 shrink-0"
          checked={checked}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.checked)}
        />
        {children}
      </label>
      {error ? <p className="text-xs font-medium text-event-red-text">{error}</p> : null}
    </div>
  );
}

/** Advertencia que se anuncia al aparecer; se usa para los pasos de confirmación reforzada. */
export function Warning({ children }: { children: ReactNode }) {
  return <Notice tone="error">{children}</Notice>;
}
