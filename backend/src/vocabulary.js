import { concepts as seededConcepts } from './config.js';

/**
 * The live concept vocabulary.
 *
 * The seed in config/concepts.json is only a starting point: concepts are
 * discovered from uploaded documents and written to the `concepts` table, so
 * the authoritative list lives in the database and changes while the server
 * runs. Everything that constrains the model - the JSON Schema enum and the
 * prompt's concept list - is therefore rebuilt per request rather than frozen
 * at startup.
 *
 * A short TTL keeps per-segment extraction from issuing a query each time
 * without letting a newly discovered concept wait for a restart.
 */
const TTL_MS = 2000;
let cache = { at: 0, map: new Map(seededConcepts) };

export async function loadConcepts(pool, { force = false } = {}) {
  if (!force && Date.now() - cache.at < TTL_MS) return cache.map;
  const { rows } = await pool.query('SELECT id,label,unit,direction,aliases FROM concepts ORDER BY id');
  cache = { at: Date.now(), map: new Map(rows.map(r => [r.id, r])) };
  return cache.map;
}

/** Drops the cache so the next read reflects a write made in this request. */
export function invalidateConcepts() {
  cache = { at: 0, map: cache.map };
}

/** Synchronous view for code paths that cannot await; may be one TTL stale. */
export function cachedConcepts() {
  return cache.map;
}
