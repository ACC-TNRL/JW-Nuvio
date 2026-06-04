#!/usr/bin/env node
// Genereert mock cache data voor lokaal testen zonder JustWatch API
// Gebruik: node scripts/generate-mock-cache.js

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "..", "cache");

const MOCK_MOVIES = [
  { id: "tt0111161", type: "movie", name: "The Shawshank Redemption", poster: "https://images.metahub.space/poster/medium/tt0111161/img" },
  { id: "tt0068646", type: "movie", name: "The Godfather", poster: "https://images.metahub.space/poster/medium/tt0068646/img" },
  { id: "tt0468569", type: "movie", name: "The Dark Knight", poster: "https://images.metahub.space/poster/medium/tt0468569/img" },
  { id: "tt0071562", type: "movie", name: "The Godfather Part II", poster: "https://images.metahub.space/poster/medium/tt0071562/img" },
  { id: "tt0050083", type: "movie", name: "12 Angry Men", poster: "https://images.metahub.space/poster/medium/tt0050083/img" },
  { id: "tt0108052", type: "movie", name: "Schindler's List", poster: "https://images.metahub.space/poster/medium/tt0108052/img" },
  { id: "tt0167260", type: "movie", name: "The Lord of the Rings: The Return of the King", poster: "https://images.metahub.space/poster/medium/tt0167260/img" },
  { id: "tt0110912", type: "movie", name: "Pulp Fiction", poster: "https://images.metahub.space/poster/medium/tt0110912/img" },
  { id: "tt0060196", type: "movie", name: "The Good, the Bad and the Ugly", poster: "https://images.metahub.space/poster/medium/tt0060196/img" },
  { id: "tt0137523", type: "movie", name: "Fight Club", poster: "https://images.metahub.space/poster/medium/tt0137523/img" },
];

const MOCK_SERIES = [
  { id: "tt0944947", type: "series", name: "Game of Thrones", poster: "https://images.metahub.space/poster/medium/tt0944947/img" },
  { id: "tt0903747", type: "series", name: "Breaking Bad", poster: "https://images.metahub.space/poster/medium/tt0903747/img" },
  { id: "tt5491994", type: "series", name: "Planet Earth II", poster: "https://images.metahub.space/poster/medium/tt5491994/img" },
  { id: "tt0185906", type: "series", name: "Band of Brothers", poster: "https://images.metahub.space/poster/medium/tt0185906/img" },
  { id: "tt0795176", type: "series", name: "Planet Earth", poster: "https://images.metahub.space/poster/medium/tt0795176/img" },
  { id: "tt1475582", type: "series", name: "Sherlock", poster: "https://images.metahub.space/poster/medium/tt1475582/img" },
  { id: "tt2861424", type: "series", name: "Rick and Morty", poster: "https://images.metahub.space/poster/medium/tt2861424/img" },
  { id: "tt0386676", type: "series", name: "The Office", poster: "https://images.metahub.space/poster/medium/tt0386676/img" },
  { id: "tt4574334", type: "series", name: "Stranger Things", poster: "https://images.metahub.space/poster/medium/tt4574334/img" },
  { id: "tt2085059", type: "series", name: "Black Mirror", poster: "https://images.metahub.space/poster/medium/tt2085059/img" },
];

fs.mkdirSync(CACHE_DIR, { recursive: true });

const moviePath = path.join(CACHE_DIR, "justwatch.nl.trending_30_day.movies.json");
const seriesPath = path.join(CACHE_DIR, "justwatch.nl.trending_30_day.series.json");

fs.writeFileSync(moviePath, JSON.stringify({ metas: MOCK_MOVIES }, null, 2));
fs.writeFileSync(seriesPath, JSON.stringify({ metas: MOCK_SERIES }, null, 2));

console.log(`✅ Mock cache geschreven:`);
console.log(`   ${moviePath} (${MOCK_MOVIES.length} movies)`);
console.log(`   ${seriesPath} (${MOCK_SERIES.length} series)`);
