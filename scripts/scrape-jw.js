#!/usr/bin/env node
// Scraper: gebruikt JustWatch streamingCharts GraphQL (zelfde query als ERDB)
// Geeft IMDb IDs direct — geen TMDB API nodig
// Schrijft Stremio-compatible cache JSON

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "..", "cache");

// ── Config ──────────────────────────────────────────────────────────────────

const COUNTRY = (process.env.JUSTWATCH_COUNTRY || "US").toUpperCase();
const LANGUAGE = process.env.JUSTWATCH_LANGUAGE || "en";
const CATALOG_LIMIT = parseInt(process.env.CATALOG_LIMIT || "50", 10);
const ERDB_TOKEN = process.env.ERDB_TOKEN || "";
const ERDB_BASE_URL = (process.env.ERDB_BASE_URL || "https://easyratingsdb.com").replace(/\/+$/, "");

const JW_GRAPHQL = "https://apis.justwatch.com/graphql";

// Zelfde query als ERDB (lib/routeConfig.ts)
const STREAMING_CHARTS_QUERY = `
query GetStreamingChartInfo($countryStreamingCharts: Country, $country: Country!, $language: Language!, $filter: StreamingChartsFilter, $first: Int!, $after: String) {
  streamingCharts(
    country: $countryStreamingCharts
    filter: $filter
    first: $first
    after: $after
  ) {
    edges {
      streamingChartInfo {
        rank
      }
      node {
        ... on MovieOrShowOrSeason {
          content(country: $country, language: $language) {
            title
            fullPath
            originalReleaseYear
            externalIds {
              imdbId
              tmdbId
            }
          }
        }
      }
    }
  }
}
`;

function buildPosterUrl(imdbId) {
  if (ERDB_TOKEN) {
    return `${ERDB_BASE_URL}/${ERDB_TOKEN}/poster/${imdbId}.jpg`;
  }
  return `https://images.metahub.space/poster/medium/${imdbId}/img`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchStreamingChart(objectType, category = "MONTHLY_POPULARITY_SAME_CONTENT_TYPE") {
  const body = {
    operationName: "GetStreamingChartInfo",
    query: STREAMING_CHARTS_QUERY,
    variables: {
      country: COUNTRY,
      countryStreamingCharts: COUNTRY,
      language: LANGUAGE,
      first: CATALOG_LIMIT,
      filter: {
        objectType,
        category,
      },
    },
  };

  for (let attempt = 0; attempt <= 3; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(2000 * Math.pow(2, attempt), 15000);
      console.log(`  retry ${attempt}/3 after ${delay}ms…`);
      await sleep(delay);
    }
    try {
      const res = await fetch(JW_GRAPHQL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Platform": "WEB",
          "User-Agent": "Mozilla/5.0",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        if (res.status === 429) continue;
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      const edges = json?.data?.streamingCharts?.edges;

      if (!Array.isArray(edges)) {
        console.warn("  Unexpected response:", JSON.stringify(json).slice(0, 300));
        return [];
      }

      const metas = [];
      for (const edge of edges) {
        const content = edge?.node?.content;
        const imdbId = content?.externalIds?.imdbId;
        if (!imdbId || !/^tt\d+$/.test(imdbId)) continue;

        metas.push({
          id: imdbId,
          type: objectType === "MOVIE" ? "movie" : "series",
          name: content.title || "Unknown",
          poster: buildPosterUrl(imdbId),
        });
      }

      return metas;
    } catch (err) {
      if (attempt >= 3) throw err;
    }
  }
  return [];
}

function readCacheCount(file) {
  try {
    const raw = fs.readFileSync(path.join(CACHE_DIR, file), "utf-8");
    return JSON.parse(raw).metas?.length || 0;
  } catch {
    return 0;
  }
}

function writeCache(filename, metas) {
  if (!metas || metas.length === 0) {
    console.log(`  ⚠️  0 items — keeping existing cache`);
    return;
  }
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, filename);
  fs.writeFileSync(file, JSON.stringify({ metas }, null, 2), "utf-8");
  console.log(`  ✅ ${metas.length} items → ${filename}`);
}

async function main() {
  const label = COUNTRY === "GLOBAL" ? "US (global)" : COUNTRY;
  console.log(`🔄 JustWatch Streaming Charts — ${label}`);
  console.log(`   Same data source as ERDB ranking badges\n`);

  const catalogs = [
    { type: "MOVIE", file: "justwatch.us.trending_30_day.movies.json", category: "MONTHLY_POPULARITY_SAME_CONTENT_TYPE", label: "Monthly" },
    { type: "SHOW", file: "justwatch.us.trending_30_day.series.json", category: "MONTHLY_POPULARITY_SAME_CONTENT_TYPE", label: "Monthly" },
    { type: "MOVIE", file: "justwatch.us.trending_7_day.movies.json", category: "WEEKLY_POPULARITY_SAME_CONTENT_TYPE", label: "Weekly" },
    { type: "SHOW", file: "justwatch.us.trending_7_day.series.json", category: "WEEKLY_POPULARITY_SAME_CONTENT_TYPE", label: "Weekly" },
  ];

  for (const catalog of catalogs) {
    const typeLabel = catalog.type === "MOVIE" ? "Movies" : "Series";
    console.log(`📡 Fetching ${typeLabel} (${catalog.label})…`);
    try {
      const metas = await fetchStreamingChart(catalog.type, catalog.category);
      writeCache(catalog.file, metas);
    } catch (err) {
      console.error(`  ❌ Failed: ${err.message}`);
    }
    if (catalog !== catalogs[catalogs.length - 1]) {
      await sleep(2000);
    }
  }

  const movieMonthly = readCacheCount(catalogs[0].file);
  const seriesMonthly = readCacheCount(catalogs[1].file);
  const movieWeekly = readCacheCount(catalogs[2].file);
  const seriesWeekly = readCacheCount(catalogs[3].file);
  console.log(`\n✨ Done! Monthly — Movies: ${movieMonthly}, Series: ${seriesMonthly} | Weekly — Movies: ${movieWeekly}, Series: ${seriesWeekly}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
