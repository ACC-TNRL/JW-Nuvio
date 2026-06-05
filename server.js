import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Setup ────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname, { extensions: ["json"], index: false }));

const PORT = process.env.PORT || 7000;
const ADMIN_KEY = process.env.ADMIN_KEY || "";

const CACHE_DIR = path.join(__dirname, "cache");

// ── Catalog definitions ──────────────────────────────────────────────────────

const COUNTRY = (process.env.JUSTWATCH_COUNTRY || "NL").toUpperCase();
const COUNTRY_LOWER = COUNTRY.toLowerCase();

const CATALOGS = [
  { type: "movie", id: `justwatch.${COUNTRY_LOWER}.trending_30_day.movies`, name: `JustWatch ${COUNTRY} Trending Movies Monthly` },
  { type: "series", id: `justwatch.${COUNTRY_LOWER}.trending_30_day.series`, name: `JustWatch ${COUNTRY} Trending Series Monthly` },
  { type: "movie", id: `justwatch.${COUNTRY_LOWER}.trending_7_day.movies`, name: `JustWatch ${COUNTRY} Trending Movies Weekly` },
  { type: "series", id: `justwatch.${COUNTRY_LOWER}.trending_7_day.series`, name: `JustWatch ${COUNTRY} Trending Series Weekly` },
];

const MANIFEST = {
  id: "custom.justwatch.charts",
  version: "0.1.0",
  name: `JustWatch Charts ${COUNTRY}`,
  description: `Private cached JustWatch ${COUNTRY} trending catalogs for Nuvio/Stremio`,
  resources: ["catalog"],
  types: ["movie", "series"],
  catalogs: CATALOGS.map((c) => ({ type: c.type, id: c.id, name: c.name })),
  idPrefixes: ["tt"],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Cache-pad voor een catalog */
function cachePath(catalogId) {
  return path.join(CACHE_DIR, `${catalogId}.json`);
}

/** Lees cache, retourneer `null` als niet aanwezig of corrupt */
function readCache(catalogId) {
  const file = cachePath(catalogId);
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, "utf-8");
    const data = JSON.parse(raw);
    if (Array.isArray(data?.metas)) return data;
    return null;
  } catch {
    return null;
  }
}

// ── Refresh via scraper ──────────────────────────────────────────────────────

async function refreshAll() {
  console.log("[refresh] running scraper…");
  const { spawn } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    const proc = spawn("node", [path.join(__dirname, "scripts", "scrape-jw.js")], {
      cwd: __dirname,
      stdio: "inherit",
      env: { ...process.env },
    });
    proc.on("close", (code) => {
      if (code === 0) {
        console.log("[refresh] scraper completed successfully");
        resolve();
      } else {
        console.error(`[refresh] scraper exited with code ${code}`);
        reject(new Error(`scraper exited with code ${code}`));
      }
    });
  });
}

// ── Endpoints ────────────────────────────────────────────────────────────────

// Root — vriendelijke info pagina
app.get("/", (_req, res) => {
  const baseUrl = `${_req.protocol}://${_req.get("host")}`;
  const catalogItems = CATALOGS.map((c) => {
    const count = readCache(c.id)?.metas?.length || 0;
    return `<li><a href="/catalog/${c.type}/${c.id}.json">/catalog/${c.type}/${c.id}.json</a> (${count} items) — ${c.name}</li>`;
  }).join("\n");

  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>JustWatch Nuvio Addon</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:20px;background:#111;color:#eee}a{color:#58a6ff}code{background:#222;padding:2px 6px;border-radius:4px;font-size:.9em}li{margin:6px 0}</style></head>
<body>
<h1>🎬 JustWatch Charts ${COUNTRY}</h1>
<p>Stremio/Nuvio catalog addon — running ✅</p>
<h2>Manifests</h2>
<ul>
<li><a href="/manifest.json"><code>/manifest.json</code></a> — NL default (monthly + weekly)</li>
<li><a href="/nl/manifest.json"><code>/nl/manifest.json</code></a> — NL (monthly + weekly)</li>
<li><a href="/us/manifest.json"><code>/us/manifest.json</code></a> — US (monthly + weekly)</li>
<li><a href="/nl-monthly/manifest.json"><code>/nl-monthly/manifest.json</code></a> — NL monthly</li>
<li><a href="/nl-weekly/manifest.json"><code>/nl-weekly/manifest.json</code></a> — NL weekly</li>
<li><a href="/us-monthly/manifest.json"><code>/us-monthly/manifest.json</code></a> — US monthly</li>
<li><a href="/us-weekly/manifest.json"><code>/us-weekly/manifest.json</code></a> — US weekly</li>
<li><a href="/fv/manifest.json"><code>/fv/manifest.json</code></a> — FilmVandaag popular</li>
</ul>
<h2>Catalogs (server default: ${COUNTRY})</h2>
<ul>
${catalogItems}
</ul>
<p style="margin-top:20px"><a href="/health">/health</a></p>
</body></html>`);
});

// Manifest
app.get("/manifest.json", (_req, res) => {
  res.json(MANIFEST);
});

// Catalog endpoints
for (const catalog of CATALOGS) {
  const route = `/catalog/${catalog.type}/${catalog.id}.json`;
  app.get(route, (_req, res) => {
    const cached = readCache(catalog.id);
    if (cached) {
      return res.json(cached);
    }
    console.warn(`[catalog] no cache for ${catalog.id}, returning empty`);
    return res.json({ metas: [] });
  });
}

// Admin refresh (POST met x-admin-key)
app.post("/admin/refresh", (req, res) => {
  if (ADMIN_KEY) {
    const key = req.headers["x-admin-key"];
    if (key !== ADMIN_KEY) {
      return res.status(401).json({ error: "unauthorized" });
    }
  }
  // Fire-and-forget voor snelle response (refresh kan even duren)
  refreshAll().catch((err) => console.error("[admin/refresh] error:", err));
  res.json({ status: "ok", message: "refresh started" });
});

// Health
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// ── Startup ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isRefreshMode = args.includes("--refresh");

if (isRefreshMode) {
  // CLI refresh mode — gebruikt de scraper
  console.log("[cli] refresh mode (scraper)");
  refreshAll()
    .then(() => {
      console.log("[cli] refresh complete, exiting.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[cli] refresh failed:", err);
      process.exit(1);
    });
} else {
  // Server mode — geen initial refresh, alleen cache lezen
  app.listen(PORT, () => {
    console.log(`[server] JustWatch Nuvio Addon running on http://localhost:${PORT}`);
    console.log(`[server] manifest: http://localhost:${PORT}/manifest.json`);
    console.log(`[server] catalogs: ${CATALOGS.map((c) => c.id).join(", ")}`);
    console.log(`[server] cache dir: ${CACHE_DIR}`);
    console.log(`[server] refresh: POST /admin/refresh or npm run refresh`);
  });
}
