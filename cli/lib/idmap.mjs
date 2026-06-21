import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

// idmap.mjs lives at <project>/cli/lib/idmap.mjs
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const DB_DIR = path.join(PROJECT_ROOT, 'db');
const IDMAP_PATH = path.join(DB_DIR, 'idmap.yml');

const SHORT_LEN = 6;

/**
 * Compute the git-style short id for a full (immutable) Graph message id.
 * @param {string} fullId - full immutable Graph message id
 * @returns {string} first SHORT_LEN chars of SHA1(fullId)
 */
export function shortIdOf(fullId) {
    return createHash('sha1').update(fullId).digest('hex').substring(0, SHORT_LEN);
}

/**
 * Load the short→full id map from disk.
 * @returns {Promise<Record<string,string>>}
 */
export async function loadIdMap() {
    try {
        const data = await fs.readFile(IDMAP_PATH, 'utf8');
        return yaml.load(data) || {};
    } catch (error) {
        if (error.code === 'ENOENT') return {};
        throw error;
    }
}

/**
 * Persist the short→full id map to disk (creating db/ if needed).
 * @param {Record<string,string>} map
 */
export async function saveIdMap(map) {
    await fs.mkdir(DB_DIR, { recursive: true });
    const sorted = {};
    for (const key of Object.keys(map).sort()) sorted[key] = map[key];
    await fs.writeFile(IDMAP_PATH, yaml.dump(sorted, { lineWidth: -1 }), 'utf8');
}

/**
 * Upsert one full id into the map, returning its short id. Does not write to
 * disk — pass the returned map to saveIdMap (use upsertMany for batches).
 * @param {Record<string,string>} map
 * @param {string} fullId
 * @returns {string} short id
 */
export function upsert(map, fullId) {
    const short = shortIdOf(fullId);
    map[short] = fullId;
    return short;
}

/**
 * Upsert many full ids and persist the map once. Returns a parallel array of the
 * short ids (same order as input).
 * @param {string[]} fullIds
 * @returns {Promise<string[]>}
 */
export async function upsertMany(fullIds) {
    const map = await loadIdMap();
    const shorts = fullIds.map((fullId) => upsert(map, fullId));
    await saveIdMap(map);
    return shorts;
}

/**
 * Resolve a CLI id argument to a full immutable Graph id.
 * Accepts a short id, a unique prefix of a short id, or a full Graph id.
 * @param {string} partial
 * @returns {Promise<string|null>} full id, or null if not found
 * @throws if the prefix is ambiguous
 */
export async function resolveId(partial) {
    const normalized = partial.replace(/\.(md|yml)$/i, '').trim();
    const map = await loadIdMap();

    // Direct hit on a full Graph id already in the map.
    for (const full of Object.values(map)) {
        if (full === normalized) return full;
    }

    // Exact short-id match.
    if (map[normalized]) return map[normalized];

    // Longest-unique-prefix match against the short ids (git-style).
    const keys = Object.keys(map).filter((k) => k.startsWith(normalized.toLowerCase()));
    if (keys.length === 0) return null;
    if (keys.length === 1) return map[keys[0]];
    throw new Error(
        `Ambiguous id "${partial}". Matches: ${keys.join(', ')}`
    );
}

/**
 * Remove a stale entry by full id (e.g. after a Graph 404). Persists the map.
 * @param {string} fullId
 */
export async function removeByFullId(fullId) {
    const map = await loadIdMap();
    const short = shortIdOf(fullId);
    if (map[short]) {
        delete map[short];
        await saveIdMap(map);
    }
}
