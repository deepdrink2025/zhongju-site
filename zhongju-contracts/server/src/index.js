import { createPool, ensureSchema } from './db.js';
import { buildApp } from './app.js';

const PORT = Number(process.env.PORT || 8790);

const pool = await createPool();
await ensureSchema(pool);

const app = buildApp(pool);
app.listen(PORT, () => {
  console.log(`[contract-api] listening on :${PORT}`);
});
