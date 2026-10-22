import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/shared/ui/FormField';
import type { CustomerDataValues, CustomerFormErrors } from './customer-form';

type CustomerDataFieldsProps = {
  values: CustomerDataValues;
  errors: CustomerFormErrors;
  onChange(change: Partial<CustomerDataValues>): void;
};

/** Campos del cliente (nombre, teléfono, dirección guardada y notas) del alta y de la edición. */
export function CustomerDataFields({ values, errors, onChange }: CustomerDataFieldsProps) {
  return (
    <>
      <FormField label="Nombre" error={errors.name}>
        {(control) => (
          <Input
            {...control}
            value={values.name}
            maxLength={120}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        )}
      </FormField>
      <FormField label="Teléfono" error={errors.phone}>
        {(control) => (
          <Input
            {...control}
            type="tel"
            inputMode="tel"
            maxLength={30}
            value={values.phone}
            onChange={(event) => onChange({ phone: event.target.value })}
          />
        )}
      </FormField>
      <FormField label="Dirección guardada (opcional)">
        {(control) => (
          <Input
            {...control}
            maxLength={300}
            value={values.address}
            onChange={(event) => onChange({ address: event.target.value })}
          />
        )}
      </FormField>
      <FormField label="Notas (opcional)">
        {(control) => (
          <Textarea
            {...control}
            maxLength={1000}
            value={values.notes}
            onChange={(event) => onChange({ notes: event.target.value })}
          />
        )}
      </FormField>
    </>
  );
}
