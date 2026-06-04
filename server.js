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

const PORT = process.env.PORT || 7000;
const ADMIN_KEY = process.env.ADMIN_KEY || "";

const CACHE_DIR = path.join(__dirname, "cache");

// ── Catalog definitions ──────────────────────────────────────────────────────

const CATALOGS = [
  { type: "movie", id: "justwatch.us.trending_30_day.movies", name: "JustWatch US Trending Movies" },
  { type: "series", id: "justwatch.us.trending_30_day.series", name: "JustWatch US Trending Series" },
];

const MANIFEST = {
  id: "custom.justwatch.charts",
  version: "0.1.0",
  name: "JustWatch Charts US",
  description: "Private cached JustWatch US trending catalogs for Nuvio/Stremio",
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
  res.type("html").send(`<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"><title>JustWatch Nuvio Addon</title>
<style>body{font-family:system-ui,sans-serif;max-width:600px;margin:40px auto;padding:20px;background:#111;color:#eee}a{color:#fb0}</style></head>
<body>
<h1>🎬 JustWatch Charts NL</h1>
<p>Stremio/Nuvio catalog addon — draaiend ✅</p>
<h2>Gebruik in Nuvio</h2>
<p>Voeg deze URL toe als addon:</p>
<code style="background:#222;padding:8px;display:block;word-break:break-all">${_req.protocol}://${_req.get("host")}/manifest.json</code>
<h2>Endpoints</h2>
<ul>
<li><a href="/manifest.json">/manifest.json</a></li>
<li><a href="/catalog/movie/justwatch.nl.trending_30_day.movies.json">/catalog/movie/...movies.json</a> (${readCache("justwatch.nl.trending_30_day.movies")?.metas?.length || 0} items)</li>
<li><a href="/catalog/series/justwatch.nl.trending_30_day.series.json">/catalog/series/...series.json</a> (${readCache("justwatch.nl.trending_30_day.series")?.metas?.length || 0} items)</li>
<li><a href="/health">/health</a></li>
</ul>
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
