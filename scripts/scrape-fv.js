#!/usr/bin/env node
// Scraper: FilmVandaag.nl popular movies & series
// Scrapes the list pages, then detail pages for IMDb IDs
// Writes Stremio-compatible cache JSON

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "..", "cache");

// ── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = "https://www.filmvandaag.nl";
const ERDB_TOKEN = process.env.ERDB_TOKEN || "";
const ERDB_BASE_URL = (process.env.ERDB_BASE_URL || "https://easyratingsdb.com").replace(/\/+$/, "");
const CONCURRENCY = parseInt(process.env.FV_CONCURRENCY || "4", 10);
const LIMIT = parseInt(process.env.FV_LIMIT || "50", 10);

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildPosterUrl(imdbId) {
  if (ERDB_TOKEN) return `${ERDB_BASE_URL}/${ERDB_TOKEN}/poster/${imdbId}.jpg`;
  return `https://images.metahub.space/poster/medium/${imdbId}/img`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(2000 * Math.pow(2, attempt));
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; NuvioAddon/1.0)" },
      });
      if (!res.ok) {
        if (res.status === 429) continue;
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.text();
    } catch (err) {
      if (attempt >= retries) throw err;
    }
  }
  return "";
}

// ── Scraping ─────────────────────────────────────────────────────────────────

/** Extract film/series URLs and titles from list page */
function extractItems(html, detailPrefix) {
  const items = [];
  const seen = new Set();
  // Strategy: find class="title">Title< and look backwards for href
  const titleRe = /class="title"[^>]*>([^<]+)</g;
  let match;
  while ((match = titleRe.exec(html)) !== null) {
    const titleRaw = match[1].trim();
    // Look backwards up to 300 chars for the href
    const before = html.substring(Math.max(0, match.index - 300), match.index);
    const hrefMatch = before.match(new RegExp(`href="(${detailPrefix}/\\d+-[^"]+)"[^>]*$`));
    if (hrefMatch) {
      const url = hrefMatch[1];
      if (!seen.has(url)) {
        seen.add(url);
        // Strip year suffix: "Title (2026)" or "Title (2026&#8209;&nbsp;)"
        const name = titleRaw.replace(/\s*\(\d{4}[^)]*\)\s*$/, "").trim();
        items.push({ url, name });
        if (items.length >= LIMIT) break;
      }
    }
  }
  return items;
}

/** Extract IMDb ID from a detail page */
function extractImdbId(html) {
  const match = html.match(/imdb\.com\/title\/(tt\d+)/);
  return match ? match[1] : null;
}

async function scrapeItems(listPath, detailPrefix, label) {
  console.log(`📡 Fetching ${label} list…`);
  const listHtml = await fetchWithRetry(`${BASE_URL}${listPath}/populair`);
  const items = extractItems(listHtml, detailPrefix);
  console.log(`  Found ${items.length} ${label.toLowerCase()} on list page`);

  const metas = [];
  let completed = 0;

  // Process in batches with controlled concurrency
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (item) => {
        try {
          const detailHtml = await fetchWithRetry(`${BASE_URL}${item.url}`, 2);
          const imdbId = extractImdbId(detailHtml);
          if (imdbId && /^tt\d+$/.test(imdbId)) {
            return {
              id: imdbId,
              type: listPath === "/films" ? "movie" : "series",
              name: item.name,
              poster: buildPosterUrl(imdbId),
            };
          }
          console.warn(`  ⚠️  No IMDb ID for: ${item.name}`);
          return null;
        } catch (err) {
          console.warn(`  ⚠️  Failed ${item.name}: ${err.message}`);
          return null;
        }
      })
    );

    for (const r of results) {
      if (r) metas.push(r);
    }
    completed += batch.length;

    if (completed % 10 === 0 || completed >= items.length) {
      process.stdout.write(`\r  Scraped ${completed}/${items.length} detail pages…`);
    }

    // Small delay between batches
    if (i + CONCURRENCY < items.length) await sleep(1000);
  }
  console.log("");

  return metas;
}

// ── Cache & Manifest ────────────────────────────────────────────────────────

function writeCache(filename, metas) {
  if (!metas || metas.length === 0) {
    console.log(`  ⚠️  0 items — skipping`);
    return;
  }
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, filename);
  fs.writeFileSync(file, JSON.stringify({ metas }, null, 2), "utf-8");
  console.log(`  ✅ ${metas.length} items → ${filename}`);
}

function writeManifest(subdir, name, description, catalogs) {
  const manifest = {
    id: "custom.filmvandaag.popular",
    version: "0.1.0",
    name,
    description,
    resources: ["catalog"],
    types: [...new Set(catalogs.map((c) => c.type))],
    catalogs,
    idPrefixes: ["tt"],
  };

  // Each addon lives in its own folder with a file literally named
  // `manifest.json` plus its own catalog/ tree, so Stremio/Nuvio can derive
  // catalog URLs by stripping `manifest.json` from the transport URL.
  const dir = path.join(__dirname, "..", subdir);
  fs.mkdirSync(path.join(dir, "catalog", "movie"), { recursive: true });
  fs.mkdirSync(path.join(dir, "catalog", "series"), { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  for (const cat of catalogs) {
    const src = path.join(CACHE_DIR, `${cat.id}.json`);
    const dest = path.join(dir, "catalog", cat.type, `${cat.id}.json`);
    if (fs.existsSync(src)) fs.copyFileSync(src, dest);
  }
  console.log(`  📁 ${subdir}/ (manifest.json + catalog/)`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔄 FilmVandaag.nl Popular Scraper\n");

  // Scrape movies
  const movieMetas = await scrapeItems("/films", "/film", "Movies");
  writeCache("filmvandaag.nl.popular.movies.json", movieMetas);

  // Scrape series
  await sleep(2000);
  const seriesMetas = await scrapeItems("/series", "/serie", "Series");
  writeCache("filmvandaag.nl.popular.series.json", seriesMetas);

  // Write manifest
  const catalogs = [];
  if (movieMetas.length > 0) {
    catalogs.push({
      type: "movie",
      id: "filmvandaag.nl.popular.movies",
      name: "FilmVandaag Popular Movies",
    });
  }
  if (seriesMetas.length > 0) {
    catalogs.push({
      type: "series",
      id: "filmvandaag.nl.popular.series",
      name: "FilmVandaag Popular Series",
    });
  }

  if (catalogs.length > 0) {
    writeManifest(
      "fv",
      "FilmVandaag Popular",
      "Popular movies & series from FilmVandaag.nl for Nuvio/Stremio",
      catalogs
    );
  }

  console.log(`\n✨ Done! Movies: ${movieMetas.length}, Series: ${seriesMetas.length}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
