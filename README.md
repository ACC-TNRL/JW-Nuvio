# JustWatch Nuvio Addon

Private/experimental Stremio-compatible catalog addon die JustWatch NL trending data als dynamische collecties aanbiedt voor gebruik in [Nuvio](https://nuvio.tv/).

## Hoe het werkt

1. Een **scraper** (`scripts/scrape-jw.js`) downloadt de JustWatch NL trending pagina's
2. Extraheert TMDB IDs en titels uit de Apollo GraphQL state in de HTML
3. Converteert TMDB IDs → IMDb IDs via de TMDB API (gratis)
4. Schrijft Stremio-compatible cache JSON-bestanden
5. De Express server leest alleen uit cache — geen live API calls
6. **GitHub Actions** draait de scraper dagelijks en commit de cache naar de repo

## ⚠️ Belangrijk

- Dit is een **private/experimental** addon
- De JustWatch GraphQL API is unofficial/undocumented
- De scraper gebruikt de publieke JustWatch webpagina's (geen API key nodig)
- Voor IMDb ID conversie is een **gratis TMDB API key** nodig

## Setup

### 1. TMDB API key (nodig voor IMDb IDs)

1. Ga naar [https://www.themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)
2. Registreer een gratis account
3. Vraag een API key aan (type: Developer)
4. Zet in `.env`: `TMDB_API_KEY=jouw-key`

### 2. Lokaal draaien

```bash
npm install
cp .env.example .env
# Zet TMDB_API_KEY in .env
npm run refresh   # scrape JustWatch + update cache
npm start         # server starten op poort 7000
```

### 3. GitHub Actions (dagelijkse refresh)

1. Ga naar repo **Settings → Secrets and variables → Actions**
2. Voeg **Repository secret** toe: `TMDB_API_KEY` = jouw TMDB API key
3. Optioneel: `ERDB_TOKEN` als je ERDB posters wilt
4. De workflow draait dagelijks om 08:00 NL tijd

Handmatig triggeren: **Actions → Daily Refresh JustWatch NL → Run workflow**

## Endpoints

- `GET /manifest.json` — Stremio manifest
- `GET /catalog/movie/justwatch.nl.trending_30_day.movies.json` — Movies catalog
- `GET /catalog/series/justwatch.nl.trending_30_day.series.json` — Series catalog
- `POST /admin/refresh` — Refresh cache (vereist `x-admin-key` header)
- `GET /health` — Health check

## Nuvio source configuratie

**Movies:**

```json
{
  "type": "movie",
  "genre": "",
  "addonId": "custom.justwatch.charts",
  "provider": "addon",
  "catalogId": "justwatch.nl.trending_30_day.movies"
}
```

**Series:**

```json
{
  "type": "series",
  "genre": "",
  "addonId": "custom.justwatch.charts",
  "provider": "addon",
  "catalogId": "justwatch.nl.trending_30_day.series"
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
| `TMDB_API_KEY` | (leeg) | TMDB API key voor IMDb ID conversie |
| `ERDB_TOKEN` | (leeg) | ERDB token voor poster URLs |
| `ERDB_BASE_URL` | `https://easyratingsdb.com` | ERDB base URL |
| `JUSTWATCH_COUNTRY` | `NL` | JustWatch landcode |
| `JUSTWATCH_LANGUAGE` | `nl` | JustWatch taal |
| `CATALOG_LIMIT` | `50` | Aantal titels per catalog |