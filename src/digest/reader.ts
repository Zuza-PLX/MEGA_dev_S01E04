import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DigestReadResult, DigestRow, DigestStatus } from './types.js';

type RunRecord = {
  at: string;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error?: string;
};

function isRunRecord(value: unknown): value is RunRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

  const record = value as Record<string, unknown>;
  return (
    typeof record.at === 'string' &&
    typeof record.job === 'string' &&
    (record.status === 'ok' || record.status === 'retry' || record.status === 'fail') &&
    (record.owner === null || typeof record.owner === 'string') &&
    (record.error === undefined || typeof record.error === 'string')
  );
}

function isNight(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function readNight(runsDir: string, night: string): Promise<DigestReadResult> {
  if (!isNight(night)) throw new TypeError('night must be a valid YYYY-MM-DD date');

  const content = await readFile(join(runsDir, `${night}.jsonl`), 'utf8');
  const rows = new Map<string, DigestRow>();
  let malformedLines = 0;

  for (const line of content.split(/\r?\n/)) {
    if (line.trim() === '') continue;

    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      malformedLines += 1;
      continue;
    }

    if (!isRunRecord(value)) {
      malformedLines += 1;
      continue;
    }

    const existing = rows.get(value.job);
    if (existing === undefined) {
      rows.set(value.job, {
        job: value.job,
        owner: value.owner,
        runs: 1,
        retries: value.status === 'retry' ? 1 : 0,
        lastStatus: value.status,
        lastError: value.error ?? null,
        firstAt: value.at,
        lastAt: value.at,
      });
      continue;
    }

    rows.set(value.job, {
      ...existing,
      owner: value.owner,
      runs: existing.runs + 1,
      retries: existing.retries + (value.status === 'retry' ? 1 : 0),
      lastStatus: value.status,
      lastError: value.error ?? null,
      lastAt: value.at,
    });
  }

  return { rows: [...rows.values()], malformedLines };
}
