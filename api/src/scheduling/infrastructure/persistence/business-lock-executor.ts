import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { TransactionRunner } from '../../../database/transaction-runner';
import { NotFoundError } from '../../domain/errors';
import type { CommandExecutor, SchedulingPorts } from '../../domain/ports/command-executor';
import { createKyselyPorts } from './kysely-scheduling-ports';

/**
 * Ejecutor de comandos (D1): abre una transacción `READ COMMITTED` y bloquea la fila del
 * negocio con `SELECT id FROM businesses WHERE id = $1 FOR UPDATE` antes de ejecutar el
 * comando. Las escrituras de agenda de un negocio quedan serializadas, así que dos comandos
 * nunca razonan sobre la misma foto de la agenda. Negocios distintos no se bloquean entre sí.
 * `appointments_no_overlap` sigue siendo la última defensa.
 */
@Injectable()
export class BusinessLockExecutor implements CommandExecutor {
  constructor(private readonly runner: TransactionRunner) {}

  execute<T>(businessId: string, work: (ports: SchedulingPorts) => Promise<T>): Promise<T> {
    return this.runner.run(businessId, async (trx) => {
      const { rows } = await sql<{
        id: string;
      }>`SELECT id FROM businesses WHERE id = ${businessId} FOR UPDATE`.execute(trx);
      if (rows.length === 0) throw new NotFoundError('El negocio no existe');
      return work(createKyselyPorts(trx));
    });
  }
}
