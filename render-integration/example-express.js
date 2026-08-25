import express from 'express';
import pg from 'pg';
import { createTrackerHandler, rawJsonOptions } from './tracker-handler.js';
import { createPostgresRepository } from './postgres-repository.js';

const app = express();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const repository = createPostgresRepository(pool);
// This must be the first JSON parser. Do not install another express.json() before it.
app.use(express.json(rawJsonOptions));
app.post('/tracker', createTrackerHandler({
  repository,
  secret: process.env.TRACKER_SHARED_SECRET,
  keyId: process.env.TRACKER_KEY_ID || 'gateway-v1',
}));
app.use((error, _req, res, next) => {
  if (error instanceof SyntaxError && error.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, code: 'INVALID_PAYLOAD' });
  }
  return next(error);
});

export default app;
