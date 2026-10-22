import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  DEFAULT_BUSINESS_ID: z.string().uuid('DEFAULT_BUSINESS_ID debe ser un UUID'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Valida y normaliza las variables de entorno. Falla al iniciar si falta alguna
 * variable obligatoria o tiene un formato inválido.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuración de entorno inválida: ${details}`);
  }
  return result.data;
}

export const ENV = Symbol('ENV');
