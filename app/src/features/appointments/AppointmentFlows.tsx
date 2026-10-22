import type { components } from '@/shared/api/schema';
import type { LocalDate } from '@/shared/lib/dates';
import { AppointmentDetailDialog } from './AppointmentDetailDialog';
import { CancelAppointmentDialog } from './CancelAppointmentDialog';
import { CreateAppointmentDialog } from './CreateAppointmentDialog';
import { MoveAppointmentDialog } from './MoveAppointmentDialog';
import { ReassignDialog } from './ReassignDialog';

type Appointment = components['schemas']['Appointment'];
type Technician = components['schemas']['Technician'];

/** Diálogo de cita abierto. Es estado local de la agenda: no vive en la URL ni en un store. */
export type AppointmentFlow =
  | { kind: 'create'; day?: LocalDate; technicianId?: string }
  | { kind: 'detail' | 'move' | 'reassign' | 'cancel'; id: string };

type AppointmentFlowsProps = {
  flow: AppointmentFlow | null;
  appointments: Appointment[];
  technicians: Technician[];
  timeZone: string;
  /** Día de la vista de la agenda, con el que arranca una cita nueva si no se indica otro. */
  defaultDay: LocalDate;
  onFlowChange(flow: AppointmentFlow | null): void;
  /** Un comando terminó bien: quien lo recibe cierra el diálogo y anuncia el resultado. */
  onDone(message: string): void;
};

/**
 * Elige el diálogo de cita que corresponde al estado de la agenda. Cada diálogo se monta solo
 * mientras está abierto y se identifica con una `key`, para que cada apertura parta limpia.
 */
export function AppointmentFlows({
  flow,
  appointments,
  technicians,
  timeZone,
  defaultDay,
  onFlowChange,
  onDone,
}: AppointmentFlowsProps) {
  if (!flow) return null;
  const close = () => onFlowChange(null);

  if (flow.kind === 'create') {
    return (
      <CreateAppointmentDialog
        key={`create-${flow.day ?? ''}-${flow.technicianId ?? ''}`}
        timeZone={timeZone}
        technicians={technicians}
        initialDay={flow.day ?? defaultDay}
        initialTechnicianId={flow.technicianId}
        onClose={close}
        onCreated={() => onDone('Cita creada.')}
      />
    );
  }

  const appointment = appointments.find((candidate) => candidate.id === flow.id);
  if (!appointment) return null;
  const key = `${flow.kind}-${appointment.id}`;

  switch (flow.kind) {
    case 'detail':
      return (
        <AppointmentDetailDialog
          key={key}
          appointment={appointment}
          timeZone={timeZone}
          onClose={close}
          onAction={(action) => onFlowChange({ kind: action, id: appointment.id })}
        />
      );
    case 'move':
      return (
        <MoveAppointmentDialog
          key={key}
          appointment={appointment}
          timeZone={timeZone}
          technicians={technicians}
          onClose={close}
          onMoved={() => onDone('Cita movida.')}
        />
      );
    case 'reassign':
      return (
        <ReassignDialog
          key={key}
          appointment={appointment}
          timeZone={timeZone}
          technicians={technicians}
          onClose={close}
          onReassigned={() => onDone('Cita reasignada.')}
        />
      );
    case 'cancel':
      return (
        <CancelAppointmentDialog
          key={key}
          appointment={appointment}
          timeZone={timeZone}
          onClose={close}
          onCancelled={() => onDone('Cita cancelada.')}
        />
      );
  }
}
