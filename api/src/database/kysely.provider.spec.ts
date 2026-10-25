import { describe, expect, it } from 'vitest';
import { createDatabase } from './kysely.provider';

describe('createDatabase', () => {
  it('no conecta al crear la instancia (pool de conexión diferida)', async () => {
    // Puerto 1 en loopback: si se intentara conectar, la creación fallaría o colgaría.
    const db = createDatabase('postgres://nobody:nothing@127.0.0.1:1/none');
    expect(typeof db.selectFrom).toBe('function');
    await expect(db.destroy()).resolves.toBeUndefined();
  });

  it('falla en la primera consulta, no en la creación, cuando la base no responde', async () => {
    const db = createDatabase('postgres://nobody:nothing@127.0.0.1:1/none');
    await expect(db.selectNoFrom((eb) => eb.val(1).as('one')).execute()).rejects.toThrow();
    await db.destroy();
  });
});
