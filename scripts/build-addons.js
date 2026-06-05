#!/usr/bin/env node
// Build all Stremio/Nuvio addon subdirectories from cached catalog JSON.
//
// Why subdirectories? Stremio/Nuvio derives catalog request URLs by stripping
// the literal `manifest.json` suffix from the transport (manifest) URL. A file
// named `manifest-fv.json` therefore breaks base-URL resolution and catalogs
// fail to load. So every addon must live in its own folder containing a file
// literally named `manifest.json` plus its own catalog/ tree.
//
// Output layout (served as-is by GitHub Pages):
//   /manifest.json            + /catalog/...           → NL full (default)
//   /nl/manifest.json         + /nl/catalog/...        → NL full
//   /nl-monthly/manifest.json + catalog/               → NL monthly
//   /nl-weekly/manifest.json  + catalog/               → NL weekly
//   /us/manifest.json         + /us/catalog/...        → US full
//   /us-monthly/...                                    → US monthly
//   /us-weekly/...                                     → US weekly
//   /fv/manifest.json         + /fv/catalog/...        → FilmVandaag popular

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CACHE_DIR = path.join(ROOT, "cache");

function cacheExists(id) {
  return fs.existsSync(path.join(CACHE_DIR, `${id}.json`));
}

// Write one addon: manifest.json + catalog/{movie,series}/<id>.json into subdir.
// Pass subdir = "" to publish at repository root.
function writeAddon(subdir, manifest) {
  // Give every catalog a required "genre" extra.  Stremio/Nuvio skips
  // catalogs with required extras on the home screen (they need user input)
  // but still shows them in Discover/Collections.
  for (const cat of manifest.catalogs) {
    cat.extra = [{ name: "genre", isRequired: true, options: ["All"] }];
  }

  const dir = subdir ? path.join(ROOT, subdir) : ROOT;
  fs.mkdirSync(path.join(dir, "catalog", "movie"), { recursive: true });
  fs.mkdirSync(path.join(dir, "catalog", "series"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf-8"
  );
  for (const cat of manifest.catalogs) {
    const src = path.join(CACHE_DIR, `${cat.id}.json`);
    const dest = path.join(dir, "catalog", cat.type, `${cat.id}.json`);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);

      // Also generate the extra-resolved path that Stremio/Nuvio will
      // request once the user picks "All" in Discover.
      const extraDest = path.join(dir, "catalog", cat.type, cat.id, "genre=All.json");
      fs.mkdirSync(path.dirname(extraDest), { recursive: true });
      fs.copyFileSync(src, extraDest);
    }
  }
  console.log(`  📁 ${subdir || "(root)"}/ → manifest.json + ${manifest.catalogs.length} catalog(s) + extra-resolved paths`);
}

function jwCatalog(country, period, type) {
  const days = period === "monthly" ? 30 : 7;
  const kind = type === "movie" ? "movies" : "series";
  const id = `justwatch.${country}.trending_${days}_day.${kind}`;
  const periodLabel = period === "monthly" ? "Monthly" : "Weekly";
  const typeLabel = type === "movie" ? "Movies" : "Series";
  return {
    type,
    id,
    name: `JustWatch ${country.toUpperCase()} Trending ${typeLabel} ${periodLabel}`,
  };
}

function jwManifest(country, period /* "monthly" | "weekly" | "all" */) {
  const cu = country.toUpperCase();
  const periods = period === "all" ? ["monthly", "weekly"] : [period];
  const catalogs = [];
  for (const p of periods) {
    for (const t of ["movie", "series"]) {
      const cat = jwCatalog(country, p, t);
      if (cacheExists(cat.id)) catalogs.push(cat);
    }
  }
  const suffix = period === "all" ? "" : `.${period}`;
  const nameSuffix = period === "all" ? "" : ` — ${period === "monthly" ? "Monthly" : "Weekly"}`;
  return {
    id: `custom.justwatch.charts.${country}${suffix}`,
    version: "0.1.0",
    name: `JustWatch Charts ${cu}${nameSuffix}`,
    description: `Private cached JustWatch ${cu} trending catalogs for Nuvio/Stremio`,
    resources: ["catalog"],
    types: [...new Set(catalogs.map((c) => c.type))],
    catalogs,
    idPrefixes: ["tt"],
  };
}

function fvManifest() {
  const catalogs = [];
  if (cacheExists("filmvandaag.nl.popular.movies")) {
    catalogs.push({ type: "movie", id: "filmvandaag.nl.popular.movies", name: "FilmVandaag Popular Movies" });
  }
  if (cacheExists("filmvandaag.nl.popular.series")) {
    catalogs.push({ type: "series", id: "filmvandaag.nl.popular.series", name: "FilmVandaag Popular Series" });
  }
  return {
    id: "custom.filmvandaag.popular",
    version: "0.1.0",
    name: "FilmVandaag Popular",
    description: "Popular movies & series from FilmVandaag.nl for Nuvio/Stremio",
    resources: ["catalog"],
    types: [...new Set(catalogs.map((c) => c.type))],
    catalogs,
    idPrefixes: ["tt"],
  };
}

function main() {
  console.log("🏗  Building addon subdirectories from cache/\n");

  const addons = [
    ["nl", jwManifest("nl", "all")],
    ["nl-monthly", jwManifest("nl", "monthly")],
    ["nl-weekly", jwManifest("nl", "weekly")],
    ["us", jwManifest("us", "all")],
    ["us-monthly", jwManifest("us", "monthly")],
    ["us-weekly", jwManifest("us", "weekly")],
    ["fv", fvManifest()],
  ];

  for (const [subdir, manifest] of addons) {
    if (manifest.catalogs.length === 0) {
      console.log(`  ⏭  ${subdir}/ skipped (no cached catalogs)`);
      continue;
    }
    writeAddon(subdir, manifest);
  }

  // NL full is the default addon → also publish at repository root.
  const nlFull = jwManifest("nl", "all");
  if (nlFull.catalogs.length > 0) writeAddon("", nlFull);

  console.log("\n✨ Done.");
}

main();
