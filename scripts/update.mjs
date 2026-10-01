#!/usr/bin/env node
// Orchestrator: fetch all sources, merge, prune, and write data/games.json.
// A failing source falls back to the previous run's items for that source and
// is flagged as stale; the run only fails if every source fails.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { todayUTC } from './lib/dates.mjs';
import { fetchRetail } from './sources/bgg.mjs';
import { fetchGamefound } from './sources/gamefound.mjs';
import { fetchKickstarter } from './sources/kickstarter.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const GAMES_FILE = path.join(DATA_DIR, 'games.json');
const SEEN_FILE = path.join(DATA_DIR, 'retail-seen.json');

const WINDOW_DAYS = 30;
const KEEP_DAYS = 60;
const KS_MIN_BACKERS = 100; // always show campaigns with this many backers ...
const KS_MIN_PERCENT = 100; // ... or funded campaigns ...
const KS_FUNDED_MIN_BACKERS = 25; // ... that also have at least this many backers

// Comma-separated source names to skip (treated as failed -> stale fallback).
// Handy for local runs (the Kicktraq crawl takes ~2-3 minutes) and for testing the stale path.
const SKIP = new Set((process.env.SKIP_SOURCES || '').split(',').map((s) => s.trim()).filter(Boolean));

const log = (msg) => console.log(`[update] ${msg}`);

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const now = new Date();
  const today = todayUTC();
  const nowIso = now.toISOString();

  const previous = readJson(GAMES_FILE, { sources: {}, items: [] });
  const seen = readJson(SEEN_FILE, {});

  const runners = {
    retail: () => fetchRetail({ seen, today, windowDays: WINDOW_DAYS, keepDays: KEEP_DAYS }),
    gamefound: () => fetchGamefound({ now, windowDays: WINDOW_DAYS }),
    kickstarter: () =>
      fetchKickstarter({
        today, windowDays: WINDOW_DAYS, minBackers: KS_MIN_BACKERS, minPercent: KS_MIN_PERCENT,
        fundedMinBackers: KS_FUNDED_MIN_BACKERS, log,
      }),
  };

  const names = Object.keys(runners);
  const results = await Promise.allSettled(
    names.map((n) => (SKIP.has(n) ? Promise.reject(new Error(`skipped via SKIP_SOURCES`)) : runners[n]())),
  );

  const sources = {};
  let items = [];
  let nextSeen = seen;
  let failures = 0;

  names.forEach((name, i) => {
    const r = results[i];
    const prevStatus = previous.sources?.[name] || {};
    if (r.status === 'fulfilled') {
      const { items: got, rawCount, seen: updatedSeen } = r.value;
      if (updatedSeen) nextSeen = updatedSeen;
      items.push(...got);
      sources[name] = { ok: true, count: got.length, rawCount, fetchedAt: nowIso };
      log(`${name}: ${got.length} items (from ${rawCount} raw)`);
    } else {
      failures++;
      const stale = previous.items.filter((it) => it.source === name);
      items.push(...stale);
      sources[name] = {
        ok: false,
        count: stale.length,
        error: String(r.reason?.message || r.reason),
        fetchedAt: prevStatus.fetchedAt || null,
        staleSince: prevStatus.staleSince || prevStatus.fetchedAt || nowIso,
      };
      log(`${name}: FAILED (${sources[name].error}); reusing ${stale.length} previous items`);
    }
  });

  // Drop any campaign that has ended, even if it came from stale data.
  items = items.filter((it) => !it.endDate || new Date(it.endDate) >= now);

  items.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.title.localeCompare(b.title));

  writeJson(GAMES_FILE, { updatedAt: nowIso, windowDays: WINDOW_DAYS, sources, items });
  writeJson(SEEN_FILE, nextSeen);
  log(`wrote ${items.length} items to ${path.relative(ROOT, GAMES_FILE)}`);

  if (failures === names.length) {
    console.error('[update] every source failed');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[update] fatal:', err);
  process.exit(1);
});
