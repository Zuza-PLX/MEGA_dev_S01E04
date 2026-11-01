# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
a morning digest of what ran overnight.

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
```

Working on it with an agent: start at [AGENTS.md](AGENTS.md).

`GET /digest/:night` (for example, `/digest/2026-10-28`) shows one row per
job, sorted by job name, with high retries and failures highlighted. Log
timestamps keep their original offsets, and malformed lines are counted on
the page. Empty nights show "nothing ran"; missing nights return 404 and
invalid dates return 400.
