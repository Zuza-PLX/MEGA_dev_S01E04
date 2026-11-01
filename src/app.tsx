import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { loadConfig, type RigConfig } from './config.js';
import { readNight } from './digest/reader.js';
import type { DigestReadResult } from './digest/types.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { DigestPage } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/api/digest/:night', async (c) => {
    try {
      const { rows } = await readNight(config.runsDir, c.req.param('night'));
      return c.json(rows.toSorted((a, b) => a.job.localeCompare(b.job)));
    } catch (error) {
      if (error instanceof TypeError && error.message === 'night must be a valid YYYY-MM-DD date') {
        throw new HTTPException(400, { message: error.message });
      }
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
        throw new HTTPException(404, { message: 'Night not found' });
      }
      throw error;
    }
  });

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', async (c) => {
    const night = c.req.param('night');
    let digest: DigestReadResult;
    try {
      digest = await readNight(config.runsDir, night);
    } catch (error) {
      if (error instanceof TypeError && error.message === 'night must be a valid YYYY-MM-DD date') {
        return c.text(error.message, 400);
      }
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return c.text('night not found', 404);
      }
      throw error;
    }

    return c.html(
      <Layout title={`digest · ${night}`} lane={lane()}>
        <DigestPage night={night} digest={digest} />
      </Layout>,
    );
  });

  return app;
}
