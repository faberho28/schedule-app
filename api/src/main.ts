import { createApplication } from './bootstrap';
import { type Env, ENV } from './config/env';

async function main(): Promise<void> {
  const app = await createApplication();
  await app.listen(app.get<Env>(ENV).PORT);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
