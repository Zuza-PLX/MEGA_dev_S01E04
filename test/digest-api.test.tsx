import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import * as reader from '../src/digest/reader.js';

describe('digest JSON API', () => {
  let runsDir: string;

  beforeEach(async () => {
    runsDir = resolve(`.test-digest-api-${randomUUID()}`);
    await mkdir(runsDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(runsDir, { recursive: true, force: true });
  });

  function app() {
    return createApp({
      adapter: 'shim',
      installed: '2026-10-29T14:06:00+01:00',
      beatEverySeconds: 60,
      runsDir,
    });
  }

  it('returns the reader rows as a job-sorted array without metadata', async () => {
    await writeFile(join(runsDir, '2026-10-28.jsonl'), [
      JSON.stringify({ at: '2026-10-28T23:00:00+01:00', job: 'z/job', owner: null, status: 'retry' }),
      'malformed',
      JSON.stringify({ at: '2026-10-29T01:00:00+01:00', job: 'a/job', owner: 'rook', status: 'ok' }),
      JSON.stringify({ at: '2026-10-29T02:00:00+01:00', job: 'z/job', owner: null, status: 'fail', error: 'failed' }),
    ].join('\n'));
    const expected = await reader.readNight(runsDir, '2026-10-28');
    const res = await app().request('/api/digest/2026-10-28');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const rows = await res.json();
    expect(rows).toEqual(expected.rows.toSorted((a, b) => a.job.localeCompare(b.job)));
    expect(rows.map((row: { job: string }) => row.job)).toEqual(['a/job', 'z/job']);
    expect(rows[1]).toMatchObject({ owner: null, runs: 2, retries: 1, lastStatus: 'fail', lastError: 'failed' });
  });

  it('returns an empty array for an empty valid night', async () => {
    await writeFile(join(runsDir, '2026-10-28.jsonl'), '');
    const res = await app().request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns 404 for a missing night file', async () => {
    expect((await app().request('/api/digest/2026-10-28')).status).toBe(404);
  });

  it.each(['not-a-date', '2026-02-30', '2026-1-01'])('returns 400 for invalid night %s', async (night) => {
    const res = await app().request(`/api/digest/${encodeURIComponent(night)}`);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('valid YYYY-MM-DD');
  });

  it.each([
    Object.assign(new Error('Permission denied'), { code: 'EACCES' }),
    new TypeError('Unrelated type error'),
  ])('does not disguise unrelated reader errors as client errors', async (error) => {
    vi.spyOn(reader, 'readNight').mockRejectedValueOnce(error);
    const onError = vi.fn((_error: Error) => new Response('unexpected failure', { status: 500 }));
    const service = app();
    service.onError(onError);
    expect((await service.request('/api/digest/2026-10-28')).status).toBe(500);
    expect(onError.mock.calls[0][0]).toBe(error);
  });
});
