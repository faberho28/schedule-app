import { Body, Controller, Get, Post, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CustomerAnonymizedError,
  DomainError,
  NotFoundError,
  ScheduleOverlapError,
  SlotTakenError,
} from '../../scheduling/domain/errors';
import { DomainProblemError } from './domain-problem';
import { ProblemDetailsFilter } from './problem-details.filter';
import { createValidationPipe } from './validation';

class ProbeDto {
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  name!: string;

  @IsInt({ message: 'La duración debe ser un entero' })
  @Min(1, { message: 'La duración debe ser mayor que 0' })
  duration!: number;
}

@Controller('probe')
class ProbeController {
  @Get('domain/:code')
  domain(): never {
    throw new SlotTakenError();
  }

  @Get('invalid-transition')
  invalidTransition(): never {
    throw new DomainError('invalid_transition', 'No se puede cambiar de estado');
  }

  @Get('with-extensions')
  withExtensions(): never {
    throw new DomainProblemError('schedule_conflict', 'Hay citas afectadas', {
      affected: [{ id: 'a' }],
      fully_resolvable: false,
      status: 200,
      code: 'overridden',
    });
  }

  @Get('overlap')
  overlap(): never {
    throw new ScheduleOverlapError();
  }

  @Get('anonymized')
  anonymized(): never {
    throw new CustomerAnonymizedError();
  }

  @Get('missing')
  missing(): never {
    throw new NotFoundError('Servicio no encontrado');
  }

  @Get('unmapped')
  unmapped(): never {
    throw new DomainError('code_without_status');
  }

  @Get('boom')
  boom(): never {
    throw new Error('connection string postgres://secret@host/db');
  }

  @Post('validate')
  validate(@Body() body: ProbeDto): ProbeDto {
    return body;
  }
}

describe('ProblemDetailsFilter (BS-R1)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [ProbeController] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalFilters(new ProblemDetailsFilter());
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde application/problem+json con el code y el estado de un DomainError', async () => {
    const response = await request(app.getHttpServer()).get('/probe/domain/x').expect(409);

    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body).toMatchObject({
      status: 409,
      code: 'slot_taken',
      title: 'Cupo ocupado',
      detail: 'El cupo ya está ocupado',
    });
  });

  it('mapea cada código de dominio a su estado documentado', async () => {
    const transition = await request(app.getHttpServer())
      .get('/probe/invalid-transition')
      .expect(422);
    expect(transition.body).toMatchObject({ status: 422, code: 'invalid_transition' });

    const missing = await request(app.getHttpServer()).get('/probe/missing').expect(404);
    expect(missing.body).toMatchObject({
      status: 404,
      code: 'not_found',
      detail: 'Servicio no encontrado',
    });
  });

  it('agrega los miembros de extensión de un DomainProblemError sin pisar los estándar', async () => {
    const response = await request(app.getHttpServer()).get('/probe/with-extensions').expect(409);

    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body).toEqual({
      type: 'about:blank',
      title: 'Conflicto de horario',
      status: 409,
      detail: 'Hay citas afectadas',
      code: 'schedule_conflict',
      affected: [{ id: 'a' }],
      fully_resolvable: false,
    });
  });

  it('schedule_overlap responde 409 con su título', async () => {
    const response = await request(app.getHttpServer()).get('/probe/overlap').expect(409);
    expect(response.body).toMatchObject({
      status: 409,
      code: 'schedule_overlap',
      title: 'Horario solapado',
    });
  });

  it('customer_anonymized responde 409 con su título', async () => {
    const response = await request(app.getHttpServer()).get('/probe/anonymized').expect(409);
    expect(response.body).toMatchObject({
      status: 409,
      code: 'customer_anonymized',
      title: 'Cliente eliminado',
      detail: 'El cliente fue eliminado y no admite cambios',
    });
  });

  it('responde 404 problem+json en una ruta inexistente', async () => {
    const response = await request(app.getHttpServer()).delete('/probe/nothing').expect(404);

    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body).toMatchObject({ status: 404, code: 'not_found' });
  });

  it('responde 400 con los errores por campo de un DTO inválido', async () => {
    const response = await request(app.getHttpServer())
      .post('/probe/validate')
      .send({ name: '', duration: 0 })
      .expect(400);

    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body).toMatchObject({ status: 400, code: 'validation_error' });
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        { field: 'name', messages: ['El nombre es obligatorio'] },
        { field: 'duration', messages: ['La duración debe ser mayor que 0'] },
      ]),
    );
    expect(response.body.errors).toHaveLength(2);
  });

  it('rechaza propiedades desconocidas del cuerpo', async () => {
    const response = await request(app.getHttpServer())
      .post('/probe/validate')
      .send({ name: 'ok', duration: 5, timezone: 'America/Mexico_City' })
      .expect(400);

    expect(response.body.errors).toEqual([
      { field: 'timezone', messages: ['La propiedad no está permitida'] },
    ]);
  });

  it('acepta un cuerpo válido (el filtro no interfiere con las respuestas correctas)', async () => {
    const response = await request(app.getHttpServer())
      .post('/probe/validate')
      .send({ name: 'ok', duration: 5 })
      .expect(201);
    expect(response.body).toEqual({ name: 'ok', duration: 5 });
  });

  it('responde 400 problem+json con un JSON mal formado', async () => {
    const response = await request(app.getHttpServer())
      .post('/probe/validate')
      .set('Content-Type', 'application/json')
      .send('{"name":')
      .expect(400);
    expect(response.body).toMatchObject({ status: 400, code: 'bad_request' });
  });

  it('un error inesperado responde 500 genérico sin filtrar el mensaje interno', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await request(app.getHttpServer()).get('/probe/boom').expect(500);

    expect(response.body).toMatchObject({ status: 500, code: 'internal_error' });
    expect(JSON.stringify(response.body)).not.toContain('postgres://');
    spy.mockRestore();
  });

  it('un DomainError sin estado asignado se trata como 500 y no como éxito', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await request(app.getHttpServer()).get('/probe/unmapped').expect(500);
    expect(response.body).toMatchObject({ status: 500, code: 'code_without_status' });
    spy.mockRestore();
  });
});
