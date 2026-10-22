import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ApiError } from '@/shared/api/errors';
import type { components } from '@/shared/api/schema';
import { localDateOf, type LocalDate } from '@/shared/lib/dates';
import { fieldErrorsOf } from '@/shared/lib/error-messages';
import { technicianLabel } from '@/shared/lib/people';
import { FormField } from '@/shared/ui/FormField';
import {
  useBookableServices,
  useCreateAppointment,
  type CreateAppointmentBody,
} from './appointments-api';
import { CustomerPicker } from './CustomerPicker';
import { SlotsPanel } from './SlotsPanel';
import type { Slot } from './slot-groups';
import { SubmitError } from './SubmitError';

type Appointment = components['schemas']['Appointment'];
type Customer = components['schemas']['Customer'];
type Technician = components['schemas']['Technician'];

type CreateAppointmentDialogProps = {
  timeZone: string;
  technicians: Technician[];
  /** Día con el que arranca la consulta de cupos; por defecto, hoy en la zona del negocio. */
  initialDay?: LocalDate;
  /** Técnico de la columna desde la que se abrió el diálogo; se preselecciona si atiende el cupo. */
  initialTechnicianId?: string;
  onClose(): void;
  /** Se llama tras crear la cita; quien lo recibe cierra el diálogo. */
  onCreated(appointment: Appointment): void;
};

type ClientErrors = {
  customer?: string;
  service?: string;
  slot?: string;
  address?: string;
};

const AUTOMATIC = '';

/**
 * Nueva cita (UI-R4, AM-R1). La hora sale siempre de un cupo ofrecido por `GET /slots`; la
 * dirección es obligatoria y se precarga con la guardada del cliente. El técnico lo asigna la API
 * salvo que la persona elija uno de los disponibles en ese cupo. Se monta solo mientras está
 * abierto, así cada apertura parte de un formulario limpio.
 */
export function CreateAppointmentDialog({
  timeZone,
  technicians,
  initialDay,
  initialTechnicianId,
  onClose,
  onCreated,
}: CreateAppointmentDialogProps) {
  const services = useBookableServices();
  const create = useCreateAppointment();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [serviceId, setServiceId] = useState('');
  const [slot, setSlot] = useState<Slot | null>(null);
  const [technicianChoice, setTechnicianChoice] = useState(initialTechnicianId ?? AUTOMATIC);
  const [address, setAddress] = useState('');
  const [clientErrors, setClientErrors] = useState<ClientErrors>({});

  const nameOf = (id: string) => {
    const technician = technicians.find((candidate) => candidate.id === id);
    return technician ? technicianLabel(technician) : 'Técnico';
  };
  const apiFields = fieldErrorsOf(create.error);
  const errors: ClientErrors = {
    customer: clientErrors.customer ?? apiFields.customer_id,
    service: clientErrors.service ?? apiFields.service_id,
    slot: clientErrors.slot ?? apiFields.starts_at,
    address: clientErrors.address ?? apiFields.address,
  };
  const showGeneralError = create.isError && Object.keys(apiFields).length === 0;
  const chosenTechnician =
    slot && slot.available_technician_ids.includes(technicianChoice) ? technicianChoice : AUTOMATIC;

  function change(update: () => void) {
    update();
    setClientErrors({});
    create.reset();
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const found: ClientErrors = {};
    if (!customer) found.customer = 'Selecciona un cliente.';
    if (serviceId === '') found.service = 'Selecciona un servicio.';
    else if (!slot) found.slot = 'Elige un cupo de la lista.';
    if (address.trim() === '') found.address = 'La dirección es obligatoria.';
    setClientErrors(found);
    if (Object.keys(found).length > 0 || !customer || !slot) return;

    const body: CreateAppointmentBody = {
      customer_id: customer.id,
      service_id: serviceId,
      starts_at: slot.starts_at,
      address: address.trim(),
      ...(chosenTechnician !== AUTOMATIC && { technician_id: chosenTechnician }),
    };
    create.mutate(body, {
      onSuccess: onCreated,
      onError: (error) => {
        if (!(error instanceof ApiError)) return;
        if (error.code === 'slot_taken' || error.code === 'slot_not_offered') setSlot(null);
        if (error.code === 'customer_anonymized') setCustomer(null);
      },
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva cita</DialogTitle>
          <DialogDescription>
            Elige el cliente, el servicio y uno de los cupos ofrecidos. La cita queda confirmada.
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <CustomerPicker
            value={customer}
            error={errors.customer}
            onChange={(selected) =>
              change(() => {
                setCustomer(selected);
                setAddress(selected?.address ?? '');
              })
            }
          />

          <FormField label="Servicio" error={errors.service}>
            {(control) => (
              <Select
                {...control}
                value={serviceId}
                disabled={!services.data}
                onChange={(event) =>
                  change(() => {
                    setServiceId(event.target.value);
                    setSlot(null);
                  })
                }
              >
                <option value="">
                  {services.data ? 'Selecciona un servicio' : 'Cargando servicios…'}
                </option>
                {services.data?.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>

          {serviceId === '' ? (
            <p className="text-sm text-muted-foreground">Elige un servicio para ver los cupos.</p>
          ) : (
            <SlotsPanel
              serviceId={serviceId}
              initialFrom={initialDay ?? localDateOf(new Date().toISOString(), timeZone)}
              timeZone={timeZone}
              technicians={technicians}
              selected={slot?.starts_at ?? null}
              onSelect={(selected) => change(() => setSlot(selected))}
              error={errors.slot}
            />
          )}

          {slot ? (
            <FormField label="Técnico" error={apiFields.technician_id}>
              {(control) => (
                <Select
                  {...control}
                  value={chosenTechnician}
                  onChange={(event) => change(() => setTechnicianChoice(event.target.value))}
                >
                  <option value={AUTOMATIC}>
                    Asignación automática ({nameOf(slot.technician_id)})
                  </option>
                  {slot.available_technician_ids.map((id) => (
                    <option key={id} value={id}>
                      {nameOf(id)}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          ) : null}

          <FormField label="Dirección" error={errors.address}>
            {(control) => (
              <Input
                {...control}
                value={address}
                maxLength={300}
                autoComplete="street-address"
                onChange={(event) => change(() => setAddress(event.target.value))}
              />
            )}
          </FormField>

          {showGeneralError ? <SubmitError error={create.error} onRetry={() => submit()} /> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              Crear cita
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
