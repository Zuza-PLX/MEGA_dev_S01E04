import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';
import type { DigestRow } from '../src/digest/types.js';

const night = '2026-10-30';

describe('digest routes', () => {
  let runsDir = '';

  beforeEach(async () => {
    runsDir = await mkdtemp(join(process.cwd(), 'test', '.digest-routes-'));
  });

  afterEach(async () => {
    if (runsDir !== '') await rm(runsDir, { recursive: true, force: true });
    runsDir = '';
  });

  function app() {
    const config: RigConfig = {
      adapter: 'test',
      installed: '2026-10-29T14:06:00+01:00',
      beatEverySeconds: 60,
      runsDir,
    };

    return createApp(config);
  }

  async function writeNight(contents: string) {
    await writeFile(join(runsDir, `${night}.jsonl`), contents, 'utf8');
  }

  it('renders sorted HTML and returns matching digest rows as JSON', async () => {
    await writeNight(
      [
        {
          at: '2026-10-30T00:00:00-04:00',
          job: 'zeta/job',
          status: 'ok',
          owner: null,
        },
        {
          at: '2026-10-30T00:01:00+05:30',
          job: 'beta/job',
          status: 'fail',
          owner: 'Bea',
          error: 'quota exceeded',
        },
        {
          at: '2026-10-30T00:02:00+05:30',
          job: 'alpha/job',
          status: 'retry',
          owner: 'Alice & Bob',
          error: 'temporary',
        },
        {
          at: '2026-10-30T00:03:00+05:30',
          job: 'alpha/job',
          status: 'retry',
          owner: 'Alice & Bob',
          error: 'temporary',
        },
        {
          at: '2026-10-30T00:04:00+05:30',
          job: 'alpha/job',
          status: 'retry',
          owner: 'Alice & Bob',
          error: 'temporary',
        },
        {
          at: '2026-10-30T00:05:00+05:30',
          job: 'alpha/job',
          status: 'ok',
          owner: 'Alice & Bob',
        },
      ]
        .map((record) => JSON.stringify(record))
        .join('\n'),
    );

    const htmlResponse = await app().request(`/digest/${night}`);
    const jsonResponse = await app().request(`/api/digest/${night}`);

    expect(htmlResponse.status).toBe(200);
    expect(htmlResponse.headers.get('content-type')).toContain('text/html');
    expect(jsonResponse.status).toBe(200);

    const html = await htmlResponse.text();
    const rows = (await jsonResponse.json()) as DigestRow[];

    const expectedRows: DigestRow[] = [
      {
        job: 'alpha/job',
        owner: 'Alice & Bob',
        runs: 4,
        retries: 3,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-10-30T00:02:00+05:30',
        lastAt: '2026-10-30T00:05:00+05:30',
      },
      {
        job: 'beta/job',
        owner: 'Bea',
        runs: 1,
        retries: 0,
        lastStatus: 'fail',
        lastError: 'quota exceeded',
        firstAt: '2026-10-30T00:01:00+05:30',
        lastAt: '2026-10-30T00:01:00+05:30',
      },
      {
        job: 'zeta/job',
        owner: null,
        runs: 1,
        retries: 0,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-10-30T00:00:00-04:00',
        lastAt: '2026-10-30T00:00:00-04:00',
      },
    ];

    expect(rows).toEqual(expectedRows);

    const visibleOrder = ['alpha/job', 'beta/job', 'zeta/job'].map((job) =>
      html.indexOf(job),
    );
    expect(visibleOrder.every((position) => position >= 0)).toBe(true);
    expect(visibleOrder[0]).toBeLessThan(visibleOrder[1]);
    expect(visibleOrder[1]).toBeLessThan(visibleOrder[2]);

    expect(html).toContain('—');
    expect(html).toContain('2026-10-30T00:02:00+05:30');
    expect(html).toContain('2026-10-30T00:05:00+05:30');
    expect(html).toContain('2026-10-30T00:00:00-04:00');

    const tableRows = html.match(/<tr\b[\s\S]*?<\/tr>/g) ?? [];
    const alphaRow = tableRows.find((row) => row.includes('alpha/job'));
    const betaRow = tableRows.find((row) => row.includes('beta/job'));
    const zetaRow = tableRows.find((row) => row.includes('zeta/job'));

    expect(alphaRow).toBeDefined();
    expect(alphaRow).toContain('3');
    expect(alphaRow).toMatch(/class="[^"]*\bwarn\b[^"]*"/);
    expect(alphaRow).toMatch(/<strong(?:\s[^>]*)?>/);
    expect(betaRow).toBeDefined();
    expect(betaRow).toContain('fail');
    expect(betaRow).toMatch(/class="[^"]*\bwarn\b[^"]*"/);
    expect(betaRow).toMatch(/<strong(?:\s[^>]*)?>/);
    expect(zetaRow).toBeDefined();
    expect(zetaRow).toContain('—');
  });

  it('returns 404 for a night with no file from both routes', async () => {
    const htmlResponse = await app().request(`/digest/${night}`);
    const jsonResponse = await app().request(`/api/digest/${night}`);

    expect(htmlResponse.status).toBe(404);
    expect(jsonResponse.status).toBe(404);
  });

  it('renders an empty night and returns an empty JSON array', async () => {
    await writeNight('');

    const htmlResponse = await app().request(`/digest/${night}`);
    const jsonResponse = await app().request(`/api/digest/${night}`);

    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);

    const html = await htmlResponse.text();
    const rows = (await jsonResponse.json()) as DigestRow[];

    expect(html).toMatch(/nothing ran/i);
    expect(rows).toEqual([]);
  });

  it('keeps a valid row visible and reports a malformed line', async () => {
    await writeNight(
      [
        JSON.stringify({
          at: '2026-10-30T10:15:00-07:00',
          job: 'valid/job',
          status: 'ok',
          owner: 'Ada',
        }),
        '{not valid json',
      ].join('\n'),
    );

    const htmlResponse = await app().request(`/digest/${night}`);
    const jsonResponse = await app().request(`/api/digest/${night}`);

    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);

    const html = await htmlResponse.text();
    const rows = (await jsonResponse.json()) as DigestRow[];

    expect(html).toContain('valid/job');
    expect(html).toMatch(
      /(?:\b1\b[\s\S]{0,80}\b(?:malformed|bad)\b|\b(?:malformed|bad)\b[\s\S]{0,80}\b1\b)/i,
    );
    expect(rows).toEqual([
      {
        job: 'valid/job',
        owner: 'Ada',
        runs: 1,
        retries: 0,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-10-30T10:15:00-07:00',
        lastAt: '2026-10-30T10:15:00-07:00',
      },
    ]);
  });

  it('escapes user-controlled values in the HTML page', async () => {
    await writeNight(
      JSON.stringify({
        at: '2026-10-30T10:15:00+02:00',
        job: '<script>alert(1)</script>',
        status: 'fail',
        owner: 'A & B',
        error: '<script>alert(1)</script>',
      }),
    );

    const response = await app().request(`/digest/${night}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('A &amp; B');
    expect(html).not.toContain('<script>');
  });
});
