import { useId, type ReactNode } from 'react';

/** Propiedades que el campo debe recibir para quedar asociado a su etiqueta y a su error. */
export type FieldControlProps = {
  id: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
};

type FormFieldProps = {
  label: string;
  error?: string;
  hint?: string;
  children: (control: FieldControlProps) => ReactNode;
};

/** Etiqueta, ayuda y mensaje de error de un campo, asociados con `for` y `aria-describedby`. */
export function FormField({ label, error, hint, children }: FormFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      {children({
        id,
        ...(error ? { 'aria-invalid': true as const } : {}),
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
      })}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-event-red-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
