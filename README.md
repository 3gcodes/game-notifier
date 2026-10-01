# game-notifier

A static GitHub Pages site listing new board games from the last 30 days:
retail releases plus active Kickstarter and Gamefound campaigns. A GitHub
Actions workflow refreshes the data nightly and commits it; there is no
database, just JSON files in `data/`.

## Sources

| Source | Endpoint | Notes |
|---|---|---|
| Retail | `https://api.geekdo.com/api/newreleases` (BGG's own JSON API behind [boardgamegeek.com/newreleases](https://boardgamegeek.com/newreleases)) | Weekly snapshot, no ship dates. The date shown is the day a game first appeared on the list. Undocumented API; may change. |
| Gamefound | [`getActiveCrowdfundingProjects`](https://help.gamefound.com/article/425-gamefound-public-api) | Documented public API. Active campaigns started within the window. |
| Kickstarter | [Kicktraq](https://www.kicktraq.com/categories/games/tabletop%20games/?sort=new) tabletop category pages | Kickstarter itself serves a Cloudflare challenge to non-browser clients. Kicktraq is crawled with its `Crawl-Delay: 6`. Only campaigns with 100+ backers, or funded with 25+ backers, are shown. |

Campaigns are listed only while still active. Retail items fall off 30 days
after first being seen.

## Layout

```
index.html                 the page (vanilla HTML/CSS/JS, no build step)
data/games.json            generated: everything the page renders
data/retail-seen.json      state: first-seen dates (and fields) for retail items
scripts/update.mjs         orchestrator; writes data/
scripts/sources/*.mjs      one module per source
scripts/lib/*.mjs          fetch + date helpers
test/                      parser tests with a saved Kicktraq page as fixture
.github/workflows/update.yml
```

## Running locally

Requires Node 20+. No dependencies.

```sh
npm test                               # parser tests
npm run update                         # full refresh (~2-3 min, mostly Kicktraq crawl delay)
SKIP_SOURCES=kickstarter npm run update   # quick refresh; skipped sources keep their previous data
npm run serve                          # http://localhost:8080
```

If a source fails, the run keeps that source's previous items, flags it as
stale in `games.json`, and the page shows a notice. The run only fails when
every source fails.

## Deploying

1. Push to GitHub.
2. Settings → Pages → Source: **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Actions → **Update releases** → Run workflow. It runs nightly at 08:15 UTC thereafter.

A `BGG_TOKEN` repository secret is passed through to the script but not
currently used; BGG's XML API has no new-releases endpoint.
