import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select-menu';
import { pluralize } from '@/shared/lib/format';

export type DataTablePaginationProps = {
  /** Total de filas, contando todas las páginas. */
  total: number;
  /** Filas que muestra la página actual. */
  shown: number;
  pageIndex: number;
  pageSize: number;
  pageSizes: readonly number[];
  /** Lo que se cuenta, por ejemplo `{ singular: 'cliente', plural: 'clientes' }`. */
  noun: { singular: string; plural: string };
  canPrevious: boolean;
  canNext: boolean;
  onPageSizeChange(size: number): void;
  onPrevious(): void;
  onNext(): void;
};

/**
 * Pie de una tabla: el rango visible ("1–10 de 25 clientes") y, solo cuando las filas no caben en una
 * página, el selector de filas por página y los botones para pasar de página.
 */
export function DataTablePagination({
  total,
  shown,
  pageIndex,
  pageSize,
  pageSizes,
  noun,
  canPrevious,
  canNext,
  onPageSizeChange,
  onPrevious,
  onNext,
}: DataTablePaginationProps) {
  const first = pageIndex * pageSize + 1;
  const hasSeveralPages = total > pageSize;

  return (
    <div className="flex h-12 items-center justify-between border-t px-4">
      <p className="text-sm text-muted-foreground">
        {first}–{first + shown - 1} de {total} {pluralize(total, noun.singular, noun.plural)}
      </p>
      {hasSeveralPages ? (
        <div className="flex items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger aria-label="Filas por página" className="h-8 w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizes.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="Página anterior"
            disabled={!canPrevious}
            onClick={onPrevious}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="Página siguiente"
            disabled={!canNext}
            onClick={onNext}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
