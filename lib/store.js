const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
const TAG_RE = /^[A-Za-z0-9_-]{3,64}$/;
const RETENTION_MS = (Number(process.env.RETENTION_DAYS) || 365) * 86400000;
const INDEX_MS = 2 * 86400000;
const MAX_CLICKS_PER_PAGE = 5000;
const FLUSH_MS = 4000;

const cache = new Map();

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function isValidTag(tagId) {
  return typeof tagId === 'string' && TAG_RE.test(tagId);
}

function fileOf(tagId) {
  return path.join(DATA_DIR, 'tag_' + tagId + '.json');
}

function legacySource(type, referrer) {
  if (type === 'search') return 'Moteur de recherche';
  if (type === 'social') return 'Réseaux sociaux';
  if (type === 'referral') {
    try { return new URL(referrer).hostname.replace(/^www\./, ''); } catch (e) { return 'Autre site'; }
  }
  return 'Direct';
}

function migrateVisit(v) {
  if (v.ts) return v;
  let refHost = '';
  try { refHost = v.referrer ? new URL(v.referrer).hostname : ''; } catch (e) {}
  return {
    id: v.id || Math.random().toString(36).slice(2, 14),
    visitor: v.visitorId || 'anon',
    ts: Number(v.timestamp) || Date.now(),
    lastSeen: Number(v.timestamp) || Date.now(),
    page: String(v.page || '/').split('?')[0] || '/',
    host: '',
    origin: '',
    title: '',
    referrer: refHost,
    source: legacySource(v.referrerType, v.referrer),
    entry: true,
    utm: null,
    device: v.device || 'desktop',
    browser: v.browser ? v.browser.charAt(0).toUpperCase() + v.browser.slice(1) : 'Autre',
    os: 'Autre',
    screen: '',
    language: v.language || '',
    timezone: '',
    dark: null,
    isNew: false,
    duration: 0,
    scroll: 0,
    events: 0,
    clicks: 0,
    ip: v.ip || 'unknown',
    country: '',
    countryCode: '',
    city: '',
    lat: null,
    lon: null
  };
}

function normalize(tagId, raw) {
  const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  data.tagId = tagId;
  data.name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : tagId;
  data.created = Number(data.created) || Date.now();
  data.visits = Array.isArray(data.visits)
    ? data.visits.filter(v => v && (v.ts || v.timestamp)).map(migrateVisit)
    : [];
  data.visits.sort((a, b) => a.ts - b.ts);
  data.events = Array.isArray(data.events) ? data.events.filter(e => e && e.ts) : [];
  data.events.sort((a, b) => a.ts - b.ts);
  data.clicks = data.clicks && typeof data.clicks === 'object' && !Array.isArray(data.clicks) ? data.clicks : {};
  data.bots = Number(data.bots) || 0;
  return data;
}

function buildIndex(entry) {
  entry.byId = new Map();
  const limit = Date.now() - INDEX_MS;
  for (let i = entry.data.visits.length - 1; i >= 0; i--) {
    const v = entry.data.visits[i];
    if (v.ts < limit) break;
    entry.byId.set(v.id, v);
  }
}

function prune(entry) {
  const limit = Date.now() - RETENTION_MS;
  const d = entry.data;
  let changed = false;
  if (d.visits.length && d.visits[0].ts < limit) {
    d.visits = d.visits.filter(v => v.ts >= limit);
    changed = true;
  }
  if (d.events.length && d.events[0].ts < limit) {
    d.events = d.events.filter(e => e.ts >= limit);
    changed = true;
  }
  for (const page of Object.keys(d.clicks)) {
    const list = d.clicks[page];
    if (!Array.isArray(list) || !list.length) {
      delete d.clicks[page];
      changed = true;
    } else if (list.length > MAX_CLICKS_PER_PAGE) {
      d.clicks[page] = list.slice(-MAX_CLICKS_PER_PAGE);
      changed = true;
    }
  }
  if (changed) entry.dirty = true;
  for (const [id, v] of entry.byId) {
    if (v.ts < Date.now() - INDEX_MS) entry.byId.delete(id);
  }
}

function readFile(tagId) {
  const file = fileOf(tagId);
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    try { fs.copyFileSync(file, file + '.corrupt-' + Date.now()); } catch (err) {}
    console.error('Fichier de données illisible, sauvegardé à côté :', file);
    return null;
  }
}

function get(tagId) {
  if (!isValidTag(tagId)) return null;
  let entry = cache.get(tagId);
  if (entry) return entry;
  const raw = readFile(tagId);
  if (raw === undefined) return null;
  entry = { data: normalize(tagId, raw), dirty: false, byId: new Map(), prunedAt: Date.now() };
  buildIndex(entry);
  prune(entry);
  cache.set(tagId, entry);
  return entry;
}

function create(tagId, name) {
  if (!isValidTag(tagId)) return null;
  let entry = get(tagId);
  if (!entry) {
    entry = { data: normalize(tagId, { name: name || tagId, created: Date.now() }), dirty: true, byId: new Map(), prunedAt: Date.now() };
    cache.set(tagId, entry);
  } else if (name && name !== entry.data.name) {
    entry.data.name = name;
    entry.dirty = true;
  }
  write(entry);
  return entry;
}

function list() {
  ensureDir();
  const ids = new Set(cache.keys());
  for (const f of fs.readdirSync(DATA_DIR)) {
    const m = /^tag_([A-Za-z0-9_-]{3,64})\.json$/.exec(f);
    if (m) ids.add(m[1]);
  }
  return [...ids].map(get).filter(Boolean).sort((a, b) => b.data.created - a.data.created);
}

function remove(tagId) {
  if (!isValidTag(tagId)) return false;
  cache.delete(tagId);
  const file = fileOf(tagId);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return true;
}

function reset(entry) {
  entry.data.visits = [];
  entry.data.events = [];
  entry.data.clicks = {};
  entry.data.bots = 0;
  entry.data.created = Date.now();
  entry.byId = new Map();
  entry.dirty = true;
  write(entry);
}

function addVisit(entry, visit) {
  entry.data.visits.push(visit);
  entry.byId.set(visit.id, visit);
  entry.dirty = true;
}

function addEvent(entry, event) {
  entry.data.events.push(event);
  entry.dirty = true;
}

function addClicks(entry, page, points) {
  if (!points.length) return;
  const list = entry.data.clicks[page] || (entry.data.clicks[page] = []);
  for (const p of points) list.push(p);
  if (list.length > MAX_CLICKS_PER_PAGE * 1.2) entry.data.clicks[page] = list.slice(-MAX_CLICKS_PER_PAGE);
  entry.dirty = true;
}

function touch(entry) {
  entry.dirty = true;
}

function write(entry) {
  ensureDir();
  const file = fileOf(entry.data.tagId);
  const tmp = file + '.tmp';
  const json = JSON.stringify(entry.data);
  try {
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.writeFileSync(file, json);
  }
  entry.dirty = false;
}

function flushAll() {
  for (const entry of cache.values()) {
    if (Date.now() - entry.prunedAt > 3600000) {
      entry.prunedAt = Date.now();
      prune(entry);
    }
    if (!entry.dirty) continue;
    try {
      write(entry);
    } catch (e) {
      console.error('Écriture impossible pour la balise', entry.data.tagId, e.message);
    }
  }
}

function storageInfo() {
  try {
    ensureDir();
    let size = 0;
    for (const f of fs.readdirSync(DATA_DIR)) {
      if (f.endsWith('.json')) size += fs.statSync(path.join(DATA_DIR, f)).size;
    }
    fs.accessSync(DATA_DIR, fs.constants.W_OK);
    return { ok: true, size };
  } catch (e) {
    return { ok: false, size: 0 };
  }
}

setInterval(flushAll, FLUSH_MS).unref();

let exiting = false;
function onExit(code) {
  if (exiting) return;
  exiting = true;
  flushAll();
  if (typeof code === 'number') process.exit(code);
}
process.on('SIGINT', () => onExit(0));
process.on('SIGTERM', () => onExit(0));
process.on('exit', () => onExit());

module.exports = {
  DATA_DIR,
  isValidTag,
  get,
  create,
  list,
  remove,
  reset,
  addVisit,
  addEvent,
  addClicks,
  touch,
  flushAll,
  storageInfo
};
