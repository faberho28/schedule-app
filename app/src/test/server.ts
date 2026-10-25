import { setupServer } from 'msw/node';

/** Servidor MSW compartido. Cada prueba agrega sus handlers con `server.use(...)`. */
export const server = setupServer();
