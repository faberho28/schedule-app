import { randomBytes, randomInt } from 'node:crypto';
import { NotFoundError } from '../domain/errors';
import type { Clock } from '../domain/model/clock';
import type { CommandExecutor } from '../domain/ports/command-executor';
import { CUSTOMER_ALIAS_WORDS, generateAlias } from '../domain/services/alias';
import { NEUTRAL_REASON_TEXT, anonymizedPhone } from '../domain/services/customer-anonymization';

/** Motivo con el que se anulan los seguimientos pendientes de un cliente anonimizado. */
export const CUSTOMER_ERASED_REASON = 'customer_erased';

const PHONE_TOKEN_BYTES = 13; // 13 bytes = 26 caracteres hexadecimales

/** Fuente de aleatoriedad de la anonimización; criptográfica por defecto. */
export interface AnonymizationRandom {
  /** Entero aleatorio en `[0, maxExclusive)`. */
  int(maxExclusive: number): number;
  /** 26 caracteres hexadecimales en minúscula. */
  hexToken(): string;
}

const cryptoRandom: AnonymizationRandom = {
  int: (maxExclusive) => randomInt(maxExclusive),
  hexToken: () => randomBytes(PHONE_TOKEN_BYTES).toString('hex'),
};

/**
 * Supresión de un cliente como anonimización en sitio (CR-R2, D4). En una sola transacción, bajo el
 * bloqueo del negocio: anula los seguimientos pendientes y reemplaza todo dato personal de la ficha
 * y de su historial por valores neutros y aleatorios, conservando el `id` y todas las filas. No se
 * guarda ninguna correspondencia entre la persona y el alias. Es idempotente: sobre un cliente ya
 * anonimizado no cambia nada.
 */
export class AnonymizeCustomer {
  constructor(
    private readonly executor: CommandExecutor,
    private readonly clock: Clock,
    private readonly random: AnonymizationRandom = cryptoRandom,
  ) {}

  execute(businessId: string, customerId: string): Promise<void> {
    return this.executor.execute(businessId, async (ports) => {
      const customer = await ports.customers.find(businessId, customerId);
      if (!customer) throw new NotFoundError('El cliente no existe');
      if (customer.anonymizedAt !== null) return;

      const taken = new Set(await ports.customers.listAliases(businessId));
      const alias = generateAlias({
        words: CUSTOMER_ALIAS_WORDS,
        taken,
        random: (max) => this.random.int(max),
      });

      await ports.followups.cancelPending(businessId, customerId, CUSTOMER_ERASED_REASON);
      await ports.customers.anonymize(businessId, customerId, {
        alias,
        phone: anonymizedPhone(this.random.hexToken()),
        anonymizedAt: this.clock.now(),
        neutralText: NEUTRAL_REASON_TEXT,
      });
    });
  }
}
