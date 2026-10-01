// Retail releases from BoardGameGeek's "New Releases" list.
// The endpoint is BGG's own (undocumented) JSON API that powers
// https://boardgamegeek.com/newreleases. It is a weekly snapshot with no
// per-item ship date, so we record the day each game first appears and
// treat that as its release date.

import { getJson } from '../lib/http.mjs';
import { addDays } from '../lib/dates.mjs';

export const NEW_RELEASES_URL = 'https://api.geekdo.com/api/newreleases';
const BGG_BASE = 'https://boardgamegeek.com';

export function normalize(entry) {
  const it = entry.item || {};
  const year = (it.descriptors || []).find((d) => d.name === 'yearpublished')?.displayValue || null;
  const title = (it.name || '').trim();
  const edition = (entry.itemName || '').trim();
  return {
    id: `retail:${it.id}`,
    source: 'retail',
    title,
    subtitle: edition && edition !== title ? edition : null,
    publisher: entry.publisherName || null,
    blurb: (entry.description || '').trim(),
    yearPublished: year,
    thumb: entry.image?.src || null,
    thumb2x: entry.image?.['src@2x'] || null,
    url: it.href ? BGG_BASE + it.href : null,
  };
}

/**
 * @param {object} opts
 * @param {Record<string, object>} opts.seen  previous state: id -> { firstSeen, ...fields }
 * @param {string} opts.today                 YYYY-MM-DD (UTC)
 * @param {number} opts.windowDays            items shown on the page
 * @param {number} opts.keepDays              items kept in the state file
 */
export async function fetchRetail({ seen, today, windowDays, keepDays }) {
  const raw = await getJson(NEW_RELEASES_URL);
  if (!Array.isArray(raw)) throw new Error('Unexpected newreleases payload (not an array)');

  const next = { ...seen };
  for (const entry of raw) {
    const item = normalize(entry);
    if (!item.url || !item.title) continue;
    const prev = next[item.id];
    // Refresh rendering fields each run, preserve the first-seen date.
    next[item.id] = { ...item, firstSeen: prev?.firstSeen || today };
  }

  const keepCutoff = addDays(today, -keepDays);
  for (const [id, v] of Object.entries(next)) {
    if (!v.firstSeen || v.firstSeen < keepCutoff) delete next[id];
  }

  const showCutoff = addDays(today, -windowDays);
  const items = Object.values(next)
    .filter((v) => v.firstSeen >= showCutoff)
    .map(({ firstSeen, ...fields }) => ({ ...fields, date: firstSeen }));

  return { items, seen: next, rawCount: raw.length };
}
