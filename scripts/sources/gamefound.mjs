// Gamefound campaigns via the documented public API:
// https://help.gamefound.com/article/425-gamefound-public-api

import { getJson } from '../lib/http.mjs';

export const ACTIVE_PROJECTS_URL =
  'https://gamefound.com/api/public/projects/getActiveCrowdfundingProjects';

export function normalize(p) {
  const goal = Number(p.campaignGoal) || 0;
  const raised = Number(p.fundsGathered) || 0;
  return {
    id: `gamefound:${p.creatorUrlName}/${p.projectUrlName}`,
    source: 'gamefound',
    title: (p.projectName || '').trim(),
    subtitle: null,
    publisher: p.creatorName || null,
    blurb: (p.shortDescription || '').trim(),
    thumb: p.projectImageUrl || null,
    url: p.projectHomeUrl,
    date: (p.campaignStartDate || '').slice(0, 10),
    startDate: p.campaignStartDate,
    endDate: p.campaignEndDate,
    backers: Number(p.backerCount) || 0,
    goal,
    raised,
    currency: p.currencyShortName || null,
    percent: goal > 0 ? Math.round((raised / goal) * 100) : null,
  };
}

/**
 * @param {object} opts
 * @param {Date} opts.now
 * @param {number} opts.windowDays
 */
export async function fetchGamefound({ now, windowDays }) {
  const raw = await getJson(ACTIVE_PROJECTS_URL);
  if (!Array.isArray(raw)) throw new Error('Unexpected Gamefound payload (not an array)');

  const cutoff = new Date(now.getTime() - windowDays * 86_400_000);
  const items = raw
    .map(normalize)
    .filter((it) => it.url && it.title && it.startDate && it.endDate)
    .filter((it) => new Date(it.startDate) >= cutoff && new Date(it.endDate) >= now);

  return { items, rawCount: raw.length };
}
