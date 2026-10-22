import type { components } from './schema';

export type ProblemDetails = components['schemas']['ProblemDetails'];
export type ErrorCode = ProblemDetails['code'];

/** Error de la API (`application/problem+json`) o respuesta de error que no sigue ese formato. */
export class ApiError extends Error {
  readonly problem: ProblemDetails | null;
  readonly status: number;

  constructor(body: unknown, status: number) {
    const problem = isProblemDetails(body) ? body : null;
    super(problem?.detail ?? `La API respondió con el estado ${status}`);
    this.name = 'ApiError';
    this.problem = problem;
    this.status = status;
  }

  /** Código estable del problema, o `null` si la respuesta no es un problema de la API. */
  get code(): ErrorCode | null {
    return this.problem?.code ?? null;
  }
}

function isProblemDetails(body: unknown): body is ProblemDetails {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { code?: unknown }).code === 'string' &&
    typeof (body as { detail?: unknown }).detail === 'string'
  );
}

type FetchResult<T> = { data?: T; error?: unknown; response: Response };

/**
 * Convierte el resultado de `openapi-fetch` en una promesa que rechaza con `ApiError`, para
 * usarlo directo como `queryFn` o `mutationFn` de TanStack Query.
 */
export async function unwrap<T>(request: Promise<FetchResult<T>>): Promise<T> {
  const { data, error, response } = await request;
  if (error !== undefined) throw new ApiError(error, response.status);
  return data as T;
}
