# PVA — Private JustWatch → Nuvio/Stremio Dynamic Catalog Addon

## Doel

We bouwen een private Stremio-compatible catalog addon die gebruikt kan worden in Nuvio.
De addon maakt dynamische collecties op basis van JustWatch trending/popular rankings voor Nederland.

Voor nu is dit alleen privégebruik. Later kan dit eventueel community-ready worden gemaakt, maar de eerste versie moet simpel, stabiel en cache-based zijn.

## Waarom dit project?

In Nuvio wil ik collecties kunnen tonen zoals:

- JustWatch NL Trending Movies
- JustWatch NL Trending Series
- eventueel later provider-specifiek, zoals Netflix NL Trending, Prime NL Trending, Disney+ NL Trending

Ik gebruik EasyRatingsDB / ERDB voor posters met rating/ranking overlays. ERDB kan per media-ID een poster renderen, maar ERDB genereert niet automatisch de catalog-lijst zelf. Daarom moet deze addon de lijst met titels leveren.

De addon moet dus:

```txt
JustWatch ranking data ophalen
→ IMDb/TMDB IDs extraheren
→ Stremio catalog response maken
→ Nuvio gebruikt deze catalog als collectiebron
→ posters optioneel via ERDB laten renderen
```

## Belangrijke context

- Stremio/Nuvio addons werken via HTTP endpoints.
- Een addon heeft minimaal een `/manifest.json`.
- Catalogs worden geserveerd via routes zoals `/catalog/{type}/{id}.json`.
- Catalog responses bevatten een `metas` array.
- Elk item in `metas` bevat minimaal:
  - `id`
  - `type`
  - `name`
  - optioneel `poster`

Voorbeeld:

```json
{
  "metas": [
    {
      "id": "tt1234567",
      "type": "series",
      "name": "Example Title",
      "poster": "https://easyratingsdb.com/Tk-xxx/poster/tt1234567.jpg"
    }
  ]
}
```

## Data source

Voor de MVP gebruiken we de unofficial/undocumented JustWatch GraphQL endpoint:

```txt
https://apis.justwatch.com/graphql
```

Belangrijk:

- Dit is geen officiële publieke API.
- JustWatch heeft wel een officiële partner/content API, maar daarvoor is een partner token/contract nodig.
- De unofficial GraphQL route kan veranderen of breken.
- Daarom moet deze addon cache-based werken en niet op elke catalog request live JustWatch aanroepen.

## Architectuur

```txt
Manual refresh / later daily refresh
→ JustWatch GraphQL popular/trending data ophalen
→ data omzetten naar Stremio metas
→ JSON cache opslaan
→ Nuvio/Stremio catalog endpoints lezen alleen cache
```

Catalog requests mogen dus niet telkens JustWatch belasten.

## Eerste versie

Maak een Node.js project met Express.

Bestanden:

```txt
package.json
server.js
.env.example
README.md
cache/.gitkeep
```

## Environment variables

Maak `.env.example`:

```env
PORT=7000
ADMIN_KEY=change-me
ERDB_TOKEN=
ERDB_BASE_URL=https://easyratingsdb.com
JUSTWATCH_COUNTRY=NL
JUSTWATCH_LANGUAGE=nl
CATALOG_LIMIT=50
```

Gedrag:

- Als `ERDB_TOKEN` leeg is, gebruik een fallback poster URL.
- Als `ERDB_TOKEN` gevuld is, gebruik:

```txt
{ERDB_BASE_URL}/{ERDB_TOKEN}/poster/{imdbId}.jpg
```

Voorbeeld:

```txt
https://easyratingsdb.com/Tk-abc123/poster/tt1234567.jpg
```

## Catalogs voor MVP

Maak deze catalogs:

```txt
justwatch.nl.trending_30_day.movies
justwatch.nl.trending_30_day.series
```

Manifest entries:

```json
[
  {
    "type": "movie",
    "id": "justwatch.nl.trending_30_day.movies",
    "name": "JustWatch NL Trending Movies"
  },
  {
    "type": "series",
    "id": "justwatch.nl.trending_30_day.series",
    "name": "JustWatch NL Trending Series"
  }
]
```

## Endpoints

De addon moet deze endpoints hebben:

```txt
GET /manifest.json
GET /catalog/movie/justwatch.nl.trending_30_day.movies.json
GET /catalog/series/justwatch.nl.trending_30_day.series.json
POST /admin/refresh
```

Ook moet CLI-refresh werken:

```bash
npm run refresh
```

## Manifest

`GET /manifest.json` moet ongeveer dit teruggeven:

```json
{
  "id": "custom.justwatch.charts",
  "version": "0.1.0",
  "name": "JustWatch Charts NL",
  "description": "Private cached JustWatch trending catalogs for Nuvio/Stremio",
  "resources": ["catalog"],
  "types": ["movie", "series"],
  "catalogs": [
    {
      "type": "movie",
      "id": "justwatch.nl.trending_30_day.movies",
      "name": "JustWatch NL Trending Movies"
    },
    {
      "type": "series",
      "id": "justwatch.nl.trending_30_day.series",
      "name": "JustWatch NL Trending Series"
    }
  ],
  "idPrefixes": ["tt"]
}
```

## Cache-bestanden

Gebruik file-based JSON cache. Geen database voor MVP.

Cache-bestanden:

```txt
cache/movie.justwatch.nl.trending_30_day.movies.json
cache/series.justwatch.nl.trending_30_day.series.json
```

## Cachegedrag

Belangrijk:

1. Catalog endpoints lezen alleen uit cache.
2. Catalog endpoints doen geen live JustWatch request.
3. `/admin/refresh` haalt nieuwe data op en schrijft cache.
4. `npm run refresh` haalt nieuwe data op en schrijft cache.
5. Als refresh faalt, bestaande cache niet verwijderen.
6. Als cache ontbreekt, return:

```json
{
  "metas": []
}
```

7. Errors duidelijk loggen.

## Admin refresh security

`POST /admin/refresh` moet beveiligd zijn met `x-admin-key` als `ADMIN_KEY` is ingesteld.

Voorbeeld:

```bash
curl -X POST http://localhost:7000/admin/refresh \
  -H "x-admin-key: change-me"
```

## JustWatch fetching

Maak een functie:

```js
async function fetchJustWatchCatalog(catalog) {}
```

Deze functie moet:

- bepalen of het om movie of series gaat
- Stremio `movie` mappen naar JustWatch `MOVIE`
- Stremio `series` mappen naar JustWatch `SHOW`
- country uit env gebruiken, default `NL`
- language uit env gebruiken, default `nl`
- limit uit env gebruiken, default `50`
- JustWatch GraphQL call doen
- response defensief parsen
- IMDb IDs extraheren
- items zonder IMDb ID overslaan
- Stremio-compatible metas teruggeven

Voor MVP alleen items met IMDb ID opnemen.

## Defensief parsen

Omdat JustWatch GraphQL undocumented is, moet parsing flexibel zijn.

Check bijvoorbeeld meerdere plekken:

```js
node.content?.externalIds?.imdbId
node.externalIds?.imdbId
node.scoring?.imdbId
```

Gebruik alleen geldige IMDb IDs:

```txt
tt gevolgd door cijfers
```

Als de response shape anders is, log tijdelijk de eerste node zodat we kunnen debuggen.

## Poster URL logic

Maak functie:

```js
function buildPosterUrl(imdbId) {}
```

Gedrag:

```js
if (ERDB_TOKEN) {
  return `${ERDB_BASE_URL}/${ERDB_TOKEN}/poster/${imdbId}.jpg`;
}

return `https://images.metahub.space/poster/medium/${imdbId}/img`;
```

ERDB base URL moet trailing slash normaliseren.

## package.json

Gebruik:

```json
{
  "name": "justwatch-nuvio-addon",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "node server.js",
    "refresh": "node server.js --refresh"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.18.3"
  }
}
```

## Local development in GitHub Codespaces

Stappen:

```bash
npm install
cp .env.example .env
npm run refresh
npm start
```

Test daarna:

```txt
http://localhost:7000/manifest.json
http://localhost:7000/catalog/movie/justwatch.nl.trending_30_day.movies.json
http://localhost:7000/catalog/series/justwatch.nl.trending_30_day.series.json
```

In GitHub Codespaces:

1. Forward port `7000`.
2. Zet port visibility op public als je wil testen vanuit Nuvio/Stremio.
3. Gebruik de public forwarded URL + `/manifest.json` als addon URL.

## Nuvio sources

Movies:

```json
{
  "type": "movie",
  "genre": "",
  "addonId": "custom.justwatch.charts",
  "provider": "addon",
  "catalogId": "justwatch.nl.trending_30_day.movies"
}
```

Series:

```json
{
  "type": "series",
  "genre": "",
  "addonId": "custom.justwatch.charts",
  "provider": "addon",
  "catalogId": "justwatch.nl.trending_30_day.series"
}
```

## README moet bevatten

Schrijf een README met:

- Wat de addon doet.
- Dat het een private/experimental addon is.
- Dat JustWatch GraphQL unofficial/undocumented is en kan breken.
- Hoe je lokaal draait.
- Hoe je cache ververst.
- Hoe je `ERDB_TOKEN` gebruikt.
- Hoe je de manifest URL in Stremio/Nuvio gebruikt.
- Hoe je later kunt deployen.

## Later uitbreiden

Na MVP eventueel toevoegen:

```txt
justwatch.nl.popular.movies
justwatch.nl.popular.series
justwatch.nl.netflix.movies
justwatch.nl.netflix.series
justwatch.nl.prime.movies
justwatch.nl.prime.series
justwatch.nl.disney.movies
justwatch.nl.disney.series
```

Ook later:

- Cloudflare Worker deploy
- Vercel deploy
- GitHub Actions daily refresh
- Static JSON hosting
- Provider filter support
- Region selector
- More countries
- Cache metadata met lastUpdated
- Health endpoint

## Definition of Done

De MVP is klaar als:

- `/manifest.json` geldige addon manifest teruggeeft.
- `npm run refresh` cachebestanden aanmaakt.
- Catalog endpoints cached metas teruggeven.
- Items geldige IMDb IDs hebben.
- Nuvio/Stremio de catalogs kan zien.
- ERDB posters werken als `ERDB_TOKEN` is ingevuld.
- Zonder ERDB token werkt fallback poster.
- Refresh failure bestaande cache niet wist.
- README duidelijk uitlegt hoe dit werkt.

## Belangrijke designregels

- Simpel houden.
- Geen database voor MVP.
- Geen live JustWatch calls bij normale catalog requests.
- JustWatch niet overbelasten.
- Cache-first.
- Fallback als refresh faalt.
- Private use first.
- Later pas community-ready maken.
