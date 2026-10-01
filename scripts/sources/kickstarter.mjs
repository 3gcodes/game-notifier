// Kickstarter campaigns, via Kicktraq's tabletop-games listing.
// Kickstarter itself serves a Cloudflare challenge to non-browser clients, so
// we read Kicktraq's category pages (robots.txt allows it, Crawl-Delay: 6) and
// map each project's slug back to its kickstarter.com URL.

import { getText, sleep } from '../lib/http.mjs';
import { addDays } from '../lib/dates.mjs';

export const LIST_URL = 'https://www.kicktraq.com/categories/games/tabletop%20games/?sort=new';
export const KICKSTARTER_BASE = 'https://www.kickstarter.com/projects/';
export const CRAWL_DELAY_MS = 6_000;
const MAX_PAGES = 40;

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

export function decodeEntities(s) {
  return (s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const pad = (n) => String(n).padStart(2, '0');

/** "October 1st -> October 31st (2026)" -> { startDate, endDate } as YYYY-MM-DD. */
export function parseCampaignDates(text) {
  const m = /([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*-(?:&gt;|>)\s*([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*\((\d{4})\)/.exec(text || '');
  if (!m) return null;
  const sm = MONTHS[m[1].toLowerCase()];
  const em = MONTHS[m[3].toLowerCase()];
  if (!sm || !em) return null;
  const endYear = Number(m[5]);
  const startYear = sm > em ? endYear - 1 : endYear;
  return {
    startDate: `${startYear}-${pad(sm)}-${pad(Number(m[2]))}`,
    endDate: `${endYear}-${pad(em)}-${pad(Number(m[4]))}`,
  };
}

const num = (s) => (s == null ? null : Number(String(s).replace(/[^\d.]/g, '')));

/** Parse one Kicktraq category page into raw project records. */
export function parsePage(html) {
  const chunks = html.split('<div class="project-image">').slice(1);
  const projects = [];
  for (const chunk of chunks) {
    const link = /href="\/projects\/([^/"]+)\/([^/"?#]+)\/?"/.exec(chunk);
    if (!link) continue;
    const [, creator, slug] = link;
    const title = decodeEntities(/<h2>\s*<a[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/.exec(chunk)?.[1]);
    const blurb = decodeEntities(/<\/h2>\s*<div>([\s\S]*?)<\/div>/.exec(chunk)?.[1]);
    const thumb = /<img[^>]+src="([^"]+)"/.exec(chunk)?.[1] || null;
    const backers = num(/Backers:\s*([\d,]+)/.exec(chunk)?.[1]);
    const percent = num(/([\d,.]+)%\s*funded/.exec(chunk)?.[1]);
    const funding = decodeEntities(/Funding:\s*([\s\S]*?)\s*\(/.exec(chunk)?.[1]);
    const [raised, goal] = funding ? funding.split(/\s+of\s+/) : [null, null];
    const dates = parseCampaignDates(/Campaign Dates:\s*([^<]+)/.exec(chunk)?.[1]);
    const timeLeft = decodeEntities(/Time left:\s*([^<]+)/.exec(chunk)?.[1]) || null;
    projects.push({
      creator, slug, title, blurb,
      thumb: thumb ? decodeEntities(thumb) : null,
      backers, percent, raised, goal, timeLeft, ...(dates || { startDate: null, endDate: null }),
    });
  }
  return projects;
}

export function toItem(p) {
  return {
    id: `kickstarter:${p.creator}/${p.slug}`,
    source: 'kickstarter',
    title: p.title,
    subtitle: null,
    publisher: p.creator,
    blurb: p.blurb || '',
    thumb: p.thumb,
    url: `${KICKSTARTER_BASE}${p.creator}/${p.slug}`,
    date: p.startDate,
    startDate: p.startDate ? `${p.startDate}T00:00:00Z` : null,
    endDate: p.endDate ? `${p.endDate}T23:59:59Z` : null,
    backers: p.backers ?? 0,
    goal: p.goal,
    raised: p.raised,
    currency: null,
    percent: p.percent,
  };
}

/**
 * @param {object} opts
 * @param {string} opts.today          YYYY-MM-DD (UTC)
 * @param {number} opts.windowDays
 * @param {number} opts.minBackers        show if backers >= this ...
 * @param {number} opts.minPercent        ... or percent funded >= this ...
 * @param {number} opts.fundedMinBackers  ... with at least this many backers (filters out $25-goal "funded" projects)
 * @param {(msg: string) => void} [opts.log]
 */
export async function fetchKickstarter({
  today, windowDays, minBackers = 100, minPercent = 100, fundedMinBackers = 25, log = () => {},
}) {
  const cutoff = addDays(today, -windowDays);
  const all = [];
  let pagesFetched = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    if (page > 1) await sleep(CRAWL_DELAY_MS);
    const html = await getText(`${LIST_URL}&page=${page}`);
    const projects = parsePage(html);
    pagesFetched++;
    if (projects.length === 0) {
      log(`kicktraq page ${page}: no projects, stopping`);
      break;
    }
    all.push(...projects);
    const dated = projects.map((p) => p.startDate).filter(Boolean).sort();
    const oldest = dated[0];
    log(`kicktraq page ${page}: ${projects.length} projects, oldest launch ${oldest || 'n/a'}`);
    if (oldest && oldest < cutoff) break;
  }

  const seen = new Set();
  const items = [];
  for (const p of all) {
    const item = toItem(p);
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    if (!p.startDate || !p.endDate || !p.title) continue;
    if (p.startDate < cutoff) continue;
    if (p.endDate < today) continue;
    const backers = p.backers ?? 0;
    const popular = backers >= minBackers || ((p.percent ?? 0) >= minPercent && backers >= fundedMinBackers);
    if (!popular) continue;
    items.push(item);
  }

  return { items, rawCount: all.length, pagesFetched };
}
