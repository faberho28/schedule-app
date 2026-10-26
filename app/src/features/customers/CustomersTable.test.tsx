import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { customer } from '@/test/api';
import { renderPage } from '@/test/render';
import { avatarToneOf } from './customer-tone';
import { CustomersTable, type CustomersTableProps } from './CustomersTable';

const ANA = customer({ id: 'c-ana', name: 'Ana Pérez', phone: '+573001234567' });
const LUIS = customer({
  id: 'c-luis',
  name: 'Luis Gómez',
  phone: '+573109998877',
  consent_status: 'granted',
});
const MARTA = customer({
  id: 'c-marta',
  name: 'Marta Ruiz',
  phone: '+573205550000',
  consent_status: 'revoked',
});
const ERASED = customer({
  id: 'c-erased',
  name: 'bear_1',
  alias: 'bear_1',
  phone: 'anon:abc',
  address: null,
  anonymized_at: '2026-10-10T12:00:00.000Z',
});

function renderTable(overrides: Partial<CustomersTableProps> = {}) {
  const props: CustomersTableProps = {
    customers: [ANA, LUIS, MARTA],
    loading: false,
    searching: false,
    onOpen: vi.fn(),
    onClearSearch: vi.fn(),
    onClearFilters: vi.fn(),
    onCreate: vi.fn(),
    ...overrides,
  };
  renderPage(<CustomersTable {...props} />);
  return props;
}

const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const names = () => bodyRows().map((row) => within(row).getAllByRole('cell')[0]!.textContent);

describe('CustomersTable: estructura', () => {
  it('tiene las columnas Cliente, Teléfono, Dirección, Consentimiento y Acciones (esta última solo para lectores)', () => {
    renderTable();

    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([
      'Cliente',
      'Teléfono',
      'Dirección',
      'Consentimiento',
      'Acciones',
    ]);
    expect(within(headers[4]!).getByText('Acciones')).toHaveClass('sr-only');
  });

  it('el encabezado mide 40 px, con fondo tenue y texto pequeño en mayúsculas', () => {
    renderTable();

    const [headerRow] = screen.getAllByRole('row');
    expect(headerRow).toHaveClass('h-10', 'bg-muted/50');
    expect(screen.getAllByRole('columnheader')[1]).toHaveClass(
      'text-xs',
      'font-medium',
      'uppercase',
      'tracking-wide',
      'text-muted-foreground',
    );
  });

  it('va dentro de un contenedor redondeado con borde, separado de la barra', () => {
    renderTable();

    const container = screen.getByRole('table').closest('[data-slot="customers-table"]')!;
    expect(container).toHaveClass('rounded-xl', 'border', 'overflow-hidden', 'mt-4');
  });

  it('cada fila mide 56 px, resalta al pasar el cursor y se puede pulsar', () => {
    renderTable();

    expect(bodyRows()[0]).toHaveClass(
      'h-14',
      'border-border',
      'hover:bg-muted/40',
      'cursor-pointer',
    );
  });
});

describe('CustomersTable: anchos de columna', () => {
  it('la tabla es de diseño fijo: los anchos se respetan y nada se estira', () => {
    renderTable();

    expect(screen.getByRole('table')).toHaveClass('table-fixed', 'w-full');
  });

  it('las columnas reparten el ancho en porcentajes: 28, 18, 34, 14 y 6', () => {
    renderTable();

    const widths = screen
      .getAllByRole('columnheader')
      .map((header) => /w-\[(\d+%)\]/.exec(header.className)?.[1]);
    expect(widths).toEqual(['28%', '18%', '34%', '14%', '6%']);
    expect(screen.getAllByRole('columnheader')[4]).toHaveClass('text-right');
  });

  it('las celdas de cada fila llevan el mismo ancho que su encabezado y las acciones van a la derecha', () => {
    renderTable();

    const widths = within(bodyRows()[0]!)
      .getAllByRole('cell')
      .map((cell) => /w-\[(\d+%)\]/.exec(cell.className)?.[1]);
    expect(widths).toEqual(['28%', '18%', '34%', '14%', '6%']);
    expect(within(bodyRows()[0]!).getAllByRole('cell')[4]).toHaveClass('text-right');
  });

  it('el esqueleto de carga usa los mismos anchos', () => {
    renderTable({ customers: [], loading: true });

    const widths = within(bodyRows()[0]!)
      .getAllByRole('cell')
      .map((cell) => /w-\[(\d+%)\]/.exec(cell.className)?.[1]);
    expect(widths).toEqual(['28%', '18%', '34%', '14%', '6%']);
  });
});

describe('CustomersTable: dirección', () => {
  it('muestra un ícono de ubicación de 14 px en gris tenue y la dirección recortada', () => {
    renderTable();

    const cell = within(bodyRows()[0]!).getAllByRole('cell')[2]!;
    const icon = cell.querySelector('svg')!;
    expect(icon).toHaveClass('size-3.5', 'text-text-subtle', 'lucide-map-pin');
    expect(within(cell).getByText('Calle 10 # 5-20')).toHaveClass('truncate');
  });

  it('al pasar el mouse muestra la dirección completa en un tooltip', async () => {
    renderTable({
      customers: [customer({ id: 'c-long', address: 'Carrera 7 # 1-1, Torre 3 apto 502, Bogotá' })],
    });

    await userEvent.hover(screen.getByText('Carrera 7 # 1-1, Torre 3 apto 502, Bogotá'));

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Carrera 7 # 1-1, Torre 3 apto 502, Bogotá',
    );
  });

  it('sin dirección muestra un guion gris tenue y ningún ícono', () => {
    renderTable({ customers: [customer({ id: 'c-none', address: null })] });

    const cell = within(bodyRows()[0]!).getAllByRole('cell')[2]!;
    expect(within(cell).getByText('—')).toHaveClass('text-text-subtle');
    expect(cell.querySelector('svg')).not.toBeInTheDocument();
  });

  it('una dirección en blanco cuenta como vacía', () => {
    renderTable({ customers: [customer({ id: 'c-blank', address: '   ' })] });

    expect(
      within(within(bodyRows()[0]!).getAllByRole('cell')[2]!).getByText('—'),
    ).toBeInTheDocument();
  });

  it('un cliente eliminado no muestra dirección', () => {
    renderTable({ customers: [ERASED] });

    expect(
      within(within(bodyRows()[0]!).getAllByRole('cell')[2]!).getByText('—'),
    ).toBeInTheDocument();
  });
});

describe('CustomersTable: notas', () => {
  const WITH_NOTES = customer({
    id: 'c-notes',
    name: 'Rosa Díaz',
    notes: 'Portón verde.\nTimbre dañado: llamar al llegar.',
  });

  it('un cliente con notas muestra un ícono de nota de 14 px después del nombre', () => {
    renderTable({ customers: [WITH_NOTES] });

    const cell = within(bodyRows()[0]!).getAllByRole('cell')[0]!;
    const note = within(cell).getByRole('img', { name: 'Tiene notas' });
    expect(note.querySelector('svg')).toHaveClass(
      'size-3.5',
      'text-text-subtle',
      'lucide-sticky-note',
    );
    expect(screen.getByRole('link', { name: 'Rosa Díaz' }).compareDocumentPosition(note)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('al pasar el mouse muestra las notas en un tooltip de hasta 3 líneas', async () => {
    renderTable({ customers: [WITH_NOTES] });

    await userEvent.hover(screen.getByRole('img', { name: 'Tiene notas' }));

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Portón verde.');
    expect(tooltip).toHaveTextContent('Timbre dañado: llamar al llegar.');
    const text = within(tooltip.parentElement!).getAllByText(/Portón verde/)[0]!;
    expect(text).toHaveClass('line-clamp-3', 'max-w-xs');
  });

  it('también se puede ver con el teclado: el ícono recibe el foco', async () => {
    renderTable({ customers: [WITH_NOTES] });

    // Orden de tabulación: los dos encabezados que ordenan, el nombre y, por fin, el ícono.
    for (let step = 0; step < 4; step += 1) await userEvent.tab();

    expect(screen.getByRole('img', { name: 'Tiene notas' })).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Portón verde.');
  });

  it('sin notas, o con notas en blanco, no muestra el ícono', () => {
    renderTable({
      customers: [ANA, customer({ id: 'c-blank', name: 'Blanca', notes: '  ' })],
    });

    expect(screen.queryByRole('img', { name: 'Tiene notas' })).not.toBeInTheDocument();
  });

  it('un cliente eliminado no muestra el ícono de notas', () => {
    renderTable({ customers: [{ ...ERASED, notes: 'No debería verse' }] });

    expect(screen.queryByRole('img', { name: 'Tiene notas' })).not.toBeInTheDocument();
  });

  it('pulsar el ícono abre la ficha, como el resto de la fila', async () => {
    const props = renderTable({ customers: [WITH_NOTES] });

    await userEvent.click(screen.getByRole('img', { name: 'Tiene notas' }));

    expect(props.onOpen).toHaveBeenCalledExactlyOnceWith('c-notes');
  });
});

describe('CustomersTable: contenido que no se parte', () => {
  it('el teléfono, la dirección y el consentimiento no se parten en dos líneas', () => {
    renderTable();

    const cells = within(bodyRows()[0]!).getAllByRole('cell');
    for (const index of [0, 1, 2, 3]) {
      expect(cells[index]).toHaveClass('whitespace-nowrap');
    }
    expect(screen.getByText('+57 300 123 4567')).toHaveClass('whitespace-nowrap');
  });

  it('el nombre se recorta con puntos suspensivos en lugar de pasar a otra línea', () => {
    renderTable({ customers: [customer({ id: 'c-long', name: 'Nombre Muy Largo '.repeat(8) })] });

    const link = screen.getByRole('link', { name: /Nombre Muy Largo/ });
    expect(link).toHaveClass('truncate', 'min-w-0');
    expect(link.parentElement).toHaveClass('min-w-0');
  });

  it('las filas mantienen 56 px de alto y ningún contenido las ensancha', () => {
    renderTable({ customers: [ANA, ERASED] });

    for (const row of bodyRows()) {
      expect(row).toHaveClass('h-14');
    }
    // La insignia "Eliminado" no cambia de línea junto al nombre.
    const erasedCell = within(bodyRows()[1]!).getAllByRole('cell')[0]!;
    expect(erasedCell.firstElementChild).toHaveClass('flex', 'items-center', 'flex-nowrap');
  });
});

describe('CustomersTable: contenido de las filas', () => {
  it('muestra el avatar con iniciales y el nombre del cliente', () => {
    renderTable();

    const cell = within(bodyRows()[0]!).getAllByRole('cell')[0]!;
    const initials = within(cell).getByText('AP');
    expect(initials.closest('[data-slot="avatar"]')).toHaveClass('size-8');
    expect(within(cell).getByText('Ana Pérez')).toHaveClass('text-sm', 'font-medium');
  });

  it('el avatar toma un color pastel que sale del nombre y es siempre el mismo', () => {
    renderTable({ customers: [ANA, LUIS] });

    const style = (name: string) => screen.getByText(name).getAttribute('style');
    const tone = avatarToneOf('Ana Pérez');
    expect(style('AP')).toContain(tone.background);
    expect(style('AP')).toContain(tone.color);
    expect(style('LG')).toContain(avatarToneOf('Luis Gómez').background);
  });

  it('el color del avatar de un cliente eliminado es neutro', () => {
    renderTable({ customers: [ERASED] });

    expect(screen.getByText('CE')).toHaveClass('bg-muted');
    expect(screen.getByText('CE').getAttribute('style') ?? '').not.toContain('--event');
  });

  it('el nombre es un enlace a la ficha', () => {
    renderTable();

    expect(screen.getByRole('link', { name: 'Ana Pérez' })).toHaveAttribute(
      'href',
      '/customers/c-ana',
    );
  });

  it('formatea el teléfono con espacios, en gris y con cifras tabulares', () => {
    renderTable();

    expect(screen.getByText('+57 300 123 4567')).toHaveClass(
      'text-sm',
      'text-muted-foreground',
      'tabular-nums',
    );
  });

  it.each([
    ['Pendiente', 'bg-event-amber-bg'],
    ['Otorgado', 'bg-event-green-bg'],
    ['Revocado', 'bg-event-red-bg'],
  ])('el consentimiento %s se muestra con insignia de color y un punto', (label, tone) => {
    renderTable();

    const badge = screen.getByText(label).closest('[data-slot="badge"]')!;
    expect(badge).toHaveClass(tone);
    expect(badge.querySelector('[data-slot="consent-dot"]')).toBeInTheDocument();
  });

  it('un cliente eliminado se atenúa, lleva la insignia "Eliminado" y no muestra teléfono ni consentimiento', () => {
    renderTable({ customers: [ERASED] });

    const row = bodyRows()[0]!;
    expect(row).toHaveClass('opacity-60');
    expect(within(row).getByText('Cliente eliminado (bear_1)')).not.toHaveClass('line-through');
    expect(within(row).getByText('Eliminado').closest('[data-slot="badge"]')).toHaveClass('border');
    expect(within(row).queryByText(/anon/)).not.toBeInTheDocument();
    // Teléfono, dirección y consentimiento.
    expect(within(row).getAllByText('—')).toHaveLength(3);
  });
});

describe('CustomersTable: abrir la ficha', () => {
  it('pulsar la fila abre la ficha del cliente', async () => {
    const props = renderTable();

    await userEvent.click(within(bodyRows()[1]!).getByText('+57 310 999 8877'));

    expect(props.onOpen).toHaveBeenCalledExactlyOnceWith('c-luis');
  });

  it('pulsar el nombre (el enlace) no abre dos veces', async () => {
    const props = renderTable();

    await userEvent.click(screen.getByRole('link', { name: 'Ana Pérez' }));

    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it('no hay botón "Ver ficha" en las filas', () => {
    renderTable();

    expect(screen.queryByRole('button', { name: /^Ver ficha/ })).not.toBeInTheDocument();
  });

  it('el menú de acciones ofrece "Ver ficha" y no propaga el clic a la fila', async () => {
    const props = renderTable();

    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Ana Pérez' }));
    expect(props.onOpen).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Ver ficha' }));

    expect(props.onOpen).toHaveBeenCalledExactlyOnceWith('c-ana');
  });

  it('el botón del menú es un ícono ghost alineado a la derecha', () => {
    renderTable();

    const trigger = screen.getByRole('button', { name: 'Acciones de Ana Pérez' });
    expect(trigger).toHaveClass('size-11');
    expect(trigger.closest('td')).toHaveClass('text-right');
  });
});

describe('CustomersTable: orden', () => {
  it('los encabezados Cliente y Consentimiento ordenan; Teléfono no', () => {
    renderTable();

    expect(screen.getByRole('button', { name: /Cliente/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Consentimiento/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Teléfono/ })).not.toBeInTheDocument();
  });

  it('ordena por nombre ascendente, luego descendente y luego vuelve al orden original', async () => {
    renderTable({ customers: [LUIS, ANA, MARTA] });
    const header = screen.getByRole('columnheader', { name: /Cliente/ });
    expect(header).toHaveAttribute('aria-sort', 'none');

    await userEvent.click(screen.getByRole('button', { name: /Cliente/ }));
    expect(names().map((n) => n?.replace(/^\w{2}/, ''))).toEqual([
      'Ana Pérez',
      'Luis Gómez',
      'Marta Ruiz',
    ]);
    expect(header).toHaveAttribute('aria-sort', 'ascending');

    await userEvent.click(screen.getByRole('button', { name: /Cliente/ }));
    expect(names().map((n) => n?.replace(/^\w{2}/, ''))).toEqual([
      'Marta Ruiz',
      'Luis Gómez',
      'Ana Pérez',
    ]);
    expect(header).toHaveAttribute('aria-sort', 'descending');

    await userEvent.click(screen.getByRole('button', { name: /Cliente/ }));
    expect(names().map((n) => n?.replace(/^\w{2}/, ''))).toEqual([
      'Luis Gómez',
      'Ana Pérez',
      'Marta Ruiz',
    ]);
  });

  it('ordena por consentimiento alfabético: Otorgado, Pendiente, Revocado', async () => {
    renderTable({ customers: [MARTA, ANA, LUIS] });

    await userEvent.click(screen.getByRole('button', { name: /Consentimiento/ }));

    expect(names().map((n) => n?.replace(/^\w{2}/, ''))).toEqual([
      'Luis Gómez',
      'Ana Pérez',
      'Marta Ruiz',
    ]);
  });

  it('el ícono del encabezado indica el sentido del orden', async () => {
    renderTable();
    const button = () => screen.getByRole('button', { name: /Cliente/ });
    expect(button().querySelector('svg')).toHaveClass('lucide-arrow-up-down');

    await userEvent.click(button());
    expect(button().querySelector('svg')).toHaveClass('lucide-arrow-up');

    await userEvent.click(button());
    expect(button().querySelector('svg')).toHaveClass('lucide-arrow-down');
  });
});

describe('CustomersTable: paginación', () => {
  const MANY = Array.from({ length: 25 }, (_, index) =>
    customer({ id: `c-${index}`, name: `Cliente ${String(index + 1).padStart(2, '0')}` }),
  );

  it('si todo cabe en una página deja solo el rango, sin selector de filas ni botones', () => {
    renderTable();

    expect(screen.getByText('1–3 de 3 clientes')).toHaveClass('text-sm', 'text-muted-foreground');
    expect(screen.queryByRole('combobox', { name: 'Filas por página' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Página anterior' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Página siguiente' })).not.toBeInTheDocument();
  });

  it('con un solo cliente usa el singular', () => {
    renderTable({ customers: [ANA] });

    expect(screen.getByText('1–1 de 1 cliente')).toBeInTheDocument();
  });

  it('pagina de a 10 por defecto y avanza y retrocede', async () => {
    renderTable({ customers: MANY });

    expect(bodyRows()).toHaveLength(10);
    expect(screen.getByText('1–10 de 25 clientes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('11–20 de 25 clientes')).toBeInTheDocument();
    expect(names()[0]).toContain('Cliente 11');

    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('21–25 de 25 clientes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Página anterior' }));
    expect(screen.getByText('11–20 de 25 clientes')).toBeInTheDocument();
  });

  it('permite elegir 10, 25 o 50 filas por página con el selector de shadcn', async () => {
    renderTable({ customers: MANY });
    const select = screen.getByRole('combobox', { name: 'Filas por página' });
    expect(select).toHaveClass('h-8', 'w-[70px]');

    await userEvent.click(select);
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual([
      '10',
      '25',
      '50',
    ]);
    await userEvent.click(screen.getByRole('option', { name: '25' }));

    expect(bodyRows()).toHaveLength(25);
    expect(screen.getByText('1–25 de 25 clientes')).toBeInTheDocument();
    // Con 25 filas en una página el selector y los botones ya no hacen falta.
    expect(screen.queryByRole('combobox', { name: 'Filas por página' })).not.toBeInTheDocument();
  });

  it('el pie mide 48 px, con borde superior y los controles a la derecha', () => {
    renderTable();

    const footer = screen.getByText('1–3 de 3 clientes').parentElement!;
    expect(footer).toHaveClass(
      'border-t',
      'px-4',
      'h-12',
      'flex',
      'items-center',
      'justify-between',
    );
  });
});

describe('CustomersTable: estados', () => {
  it('cargando muestra 6 filas de esqueleto y ningún cliente', () => {
    renderTable({ customers: [], loading: true });

    expect(bodyRows()).toHaveLength(6);
    expect(bodyRows().every((row) => row.querySelector('[data-slot="skeleton"]') !== null)).toBe(
      true,
    );
    expect(screen.queryByText('Aún no tienes clientes')).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
  });

  it('una búsqueda sin resultados lo dice y ofrece limpiarla', async () => {
    const props = renderTable({ customers: [], searching: true });

    expect(screen.getByText('No se encontraron clientes')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));

    expect(props.onClearSearch).toHaveBeenCalledOnce();
  });

  it('sin resultados por filtros ofrece limpiar los filtros', async () => {
    const props = renderTable({ customers: [], searching: false, filtered: true });

    expect(screen.getByText('No se encontraron clientes')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    expect(props.onClearFilters).toHaveBeenCalledOnce();
  });

  it('sin clientes invita a crear el primero', async () => {
    const props = renderTable({ customers: [] });

    expect(screen.getByText('Aún no tienes clientes')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo cliente' }));

    expect(props.onCreate).toHaveBeenCalledOnce();
  });

  it('en los estados vacíos no hay pie de paginación', () => {
    renderTable({ customers: [] });

    expect(screen.queryByRole('combobox', { name: 'Filas por página' })).not.toBeInTheDocument();
  });
});
