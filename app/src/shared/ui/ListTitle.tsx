import { pluralize } from '@/shared/lib/format';

type ListTitleProps = {
  title: string;
  /** Elementos de la lista; sin valor (cargando) no se muestra el contador. */
  count?: number;
  /** Lo que se cuenta, por ejemplo `{ singular: 'cliente', plural: 'clientes' }`. */
  noun: { singular: string; plural: string };
};

/** Título de una lista con su contador en gris a un lado, alineado a la línea base del título. */
export function ListTitle({ title, count, noun }: ListTitleProps) {
  return (
    <div className="flex items-baseline gap-2">
      <h1 className="text-xl font-semibold">{title}</h1>
      {count === undefined ? null : (
        <span
          aria-label={`${count} ${pluralize(count, noun.singular, noun.plural)}`}
          className="text-sm font-normal text-muted-foreground tabular-nums"
        >
          {count}
        </span>
      )}
    </div>
  );
}
