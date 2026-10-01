import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parsePage, parseCampaignDates, toItem, decodeEntities } from '../scripts/sources/kickstarter.mjs';

const html = fs.readFileSync(new URL('./fixtures/kicktraq-page.html', import.meta.url), 'utf8');

test('parses every project block on a category page', () => {
  const projects = parsePage(html);
  assert.equal(projects.length, 15);
  for (const p of projects) {
    assert.ok(p.creator && p.slug, 'creator/slug present');
    assert.ok(p.title, 'title present');
    assert.match(p.startDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(p.endDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(p.startDate <= p.endDate);
  }
});

test('first project maps to its Kickstarter URL and dates', () => {
  const [p] = parsePage(html);
  assert.equal(p.creator, 'sketchsamurai');
  assert.equal(p.slug, 'vstage-tcg-asset-loading');
  assert.equal(p.title, 'VStage TCG - Asset Loading');
  assert.equal(p.startDate, '2026-10-01');
  assert.equal(p.endDate, '2026-10-31');
  assert.equal(p.backers, 0);
  assert.equal(p.percent, 0);
  assert.equal(p.goal, '$500');
  assert.match(p.thumb, /^https:\/\/i\.kickstarter\.com\//);
  const item = toItem(p);
  assert.equal(item.url, 'https://www.kickstarter.com/projects/sketchsamurai/vstage-tcg-asset-loading');
  assert.equal(item.source, 'kickstarter');
  assert.equal(item.date, '2026-10-01');
});

test('campaign dates spanning a year boundary put the start in the previous year', () => {
  assert.deepEqual(parseCampaignDates('December 20th -&gt; January 5th (2027)'), {
    startDate: '2026-12-20',
    endDate: '2027-01-05',
  });
  assert.deepEqual(parseCampaignDates('March 2nd -> March 30th (2026)'), {
    startDate: '2026-03-02',
    endDate: '2026-03-30',
  });
  assert.equal(parseCampaignDates('garbage'), null);
});

test('decodes HTML entities in titles', () => {
  assert.equal(decodeEntities('Aztec &amp; Mayan &#39;Minis&#39;'), "Aztec & Mayan 'Minis'");
});
