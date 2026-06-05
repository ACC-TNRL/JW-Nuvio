# JustWatch Nuvio Addon

Private/experimental Stremio-compatible catalog addon die JustWatch trending data (monthly & weekly) als dynamische collecties aanbiedt voor gebruik in [Nuvio](https://nuvio.tv/).

Standaard land: **US**. Stel `JUSTWATCH_COUNTRY=NL` in voor Nederlandse rankings.

## Hoe het werkt

1. Een **scraper** (`scripts/scrape-jw.js`) gebruikt de JustWatch GraphQL API (streamingCharts)
2. Haalt IMDb IDs direct uit de GraphQL response — geen TMDB API nodig
3. Schrijft Stremio-compatible cache JSON-bestanden (monthly + weekly)
4. De Express server leest alleen uit cache — geen live API calls
5. **GitHub Actions** draait de scraper dagelijks en commit de cache naar de repo

## ⚠️ Belangrijk

- Dit is een **private/experimental** addon
- De JustWatch GraphQL API is unofficial/undocumented
- IMDb IDs komen direct uit de GraphQL API — geen TMDB API key nodig

## Setup

### 1. Lokaal draaien

```bash
npm install
cp .env.example .env
# Zet TMDB_API_KEY in .env
npm run refresh   # scrape JustWatch + update cache
npm start         # server starten op poort 7000
```

### 2. GitHub Actions (dagelijkse refresh)

1. Optioneel: voeg `ERDB_TOKEN` toe als **Repository secret** voor ERDB posters
2. De workflow draait dagelijks om 08:00 NL tijd

Handmatig triggeren: **Actions → Daily Refresh JustWatch NL → Run workflow**

## Endpoints

- `GET /manifest.json` — Stremio manifest
- `GET /catalog/movie/justwatch.{country}.trending_30_day.movies.json` — Movies (Monthly)
- `GET /catalog/movie/justwatch.{country}.trending_7_day.movies.json` — Movies (Weekly)
- `GET /catalog/series/justwatch.{country}.trending_30_day.series.json` — Series (Monthly)
- `GET /catalog/series/justwatch.{country}.trending_7_day.series.json` — Series (Weekly)
- `POST /admin/refresh` — Refresh cache (vereist `x-admin-key` header)
- `GET /health` — Health check

## Nuvio source configuratie

Vervang `{country}` door `us`, `nl`, etc.

**Movies (Monthly):**

```json
{
  "type": "movie",
  "addonId": "custom.justwatch.charts",
  "provider": "addon",
  "catalogId": "justwatch.{country}.trending_30_day.movies"
}
```

**Movies (Weekly):**

```json
{
  "type": "movie",
  "addonId": "custom.justwatch.charts",
  "provider": "addon",
  "catalogId": "justwatch.{country}.trending_7_day.movies"
}
```

**Series (Monthly):**

```json
{
  "type": "series",
  "addonId": "custom.justwatch.charts",
  "provider": "addon",
  "catalogId": "justwatch.{country}.trending_30_day.series"
}
```

**Series (Weekly):**

```json
{
  "type": "series",
  "addonId": "custom.justwatch.charts",
  "provider": "addon",
  "catalogId": "justwatch.{country}.trending_7_day.series"
}
```

## ERDB Posters

Zet in `.env` of GitHub Secrets:

```env
ERDB_TOKEN=Tk-jouwtoken
```

De poster URLs worden dan: `https://easyratingsdb.com/{token}/poster/{imdbId}.jpg`

## Deployen

De addon is een simpele Node.js Express app. Omdat de cache in de repo staat (via GitHub Actions), kun je deployen naar:

- **GitHub Pages** — statische JSON files via `/cache/` map
- **Railway / Render / Fly.io** — gratis tiers
- **VPS** — via PM2 of systemd

## Environment variables

| Variable | Default | Beschrijving |
|---|---|---|
| `PORT` | `7000` | Server poort |
| `ADMIN_KEY` | `change-me` | Key voor `/admin/refresh` |
| `ERDB_TOKEN` | (leeg) | ERDB token voor poster URLs |
| `ERDB_BASE_URL` | `https://easyratingsdb.com` | ERDB base URL |
| `JUSTWATCH_COUNTRY` | `US` | JustWatch landcode |
| `JUSTWATCH_LANGUAGE` | `en` | JustWatch taal |
| `CATALOG_LIMIT` | `50` | Aantal titels per catalog |