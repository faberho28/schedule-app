/** Tokens de inyección de Nest para los puertos del agendamiento. */
export const CLOCK = Symbol('SCHEDULING_CLOCK');
export const COMMAND_EXECUTOR = Symbol('SCHEDULING_COMMAND_EXECUTOR');
export const READ_PORTS = Symbol('SCHEDULING_READ_PORTS');
/** Puerto de lecturas agregadas; va aparte de `SchedulingPorts` para que los comandos no lo vean. */
export const AGENDA_READ_MODEL = Symbol('SCHEDULING_AGENDA_READ_MODEL');
