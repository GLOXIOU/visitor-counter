const RANGES = { '24h': 1, '7d': 7, '30d': 30, '90d': 90, '365d': 365, all: 0 };
const TZ = process.env.STATS_TZ || 'Europe/Paris';
const LIVE_MS = 45000;
const UPDATE_LOOKBACK = 86400000;
const MAX_DURATION = 30 * 60000;

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23'
});
const partCache = new Map();

function parts(ts) {
  const slot = Math.floor(ts / 900000);
  let p = partCache.get(slot);
  if (!p) {
    p = {};
    for (const x of formatter.formatToParts(new Date(slot * 900000))) p[x.type] = x.value;
    if (partCache.size > 50000) partCache.clear();
    partCache.set(slot, p);
  }
  return p;
}

const keyFns = {
  hour: ts => { const p = parts(ts); return `${p.year}-${p.month}-${p.day} ${p.hour}`; },
  day: ts => { const p = parts(ts); return `${p.year}-${p.month}-${p.day}`; },
  month: ts => { const p = parts(ts); return `${p.year}-${p.month}`; }
};

function sum(list, fn) {
  let s = 0;
  for (const x of list) s += fn(x);
  return s;
}

function lowerBound(list, ts) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].ts < ts) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function between(list, from, to) {
  return list.slice(lowerBound(list, from), lowerBound(list, to + 1));
}

function kpis(rows, eventsByVisit) {
  const visitors = new Set(rows.map(r => r.visitor));
  const durations = rows.map(r => Math.min(r.duration || 0, MAX_DURATION)).filter(d => d > 0);
  const newVisitors = new Set(rows.filter(r => r.isNew).map(r => r.visitor));
  const bounces = rows.filter(r => (r.duration || 0) < 10000 && !eventsByVisit.get(r.id)).length;
  let actions = 0;
  for (const r of rows) actions += eventsByVisit.get(r.id) || 0;
  return {
    views: rows.length,
    visitors: visitors.size,
    avgDuration: durations.length ? Math.round(sum(durations, d => d) / durations.length) : 0,
    avgScroll: rows.length ? Math.round(sum(rows, r => r.scroll || 0) / rows.length) : 0,
    bounceRate: rows.length ? Math.round((bounces / rows.length) * 100) : 0,
    newRate: visitors.size ? Math.round((newVisitors.size / visitors.size) * 100) : 0,
    pagesPerVisitor: visitors.size ? Math.round((rows.length / visitors.size) * 10) / 10 : 0,
    actions
  };
}

function group(rows, keyOf, extra) {
  const map = new Map();
  for (const r of rows) {
    const key = keyOf(r);
    if (key === null || key === undefined || key === '') continue;
    let g = map.get(key);
    if (!g) {
      g = { label: key, views: 0, set: new Set(), ...(extra ? extra(r) : {}) };
      map.set(key, g);
    }
    g.views += 1;
    g.set.add(r.visitor);
  }
  return [...map.values()]
    .map(({ set, ...g }) => ({ ...g, visitors: set.size }))
    .sort((a, b) => b.visitors - a.visitors || b.views - a.views);
}

function top(list, n) {
  if (list.length <= n) return list;
  const head = list.slice(0, n);
  const rest = list.slice(n);
  head.push({ label: 'Autres', other: true, views: sum(rest, g => g.views), visitors: sum(rest, g => g.visitors) });
  return head;
}

function series(rows, from, to, granularity) {
  const keyOf = keyFns[granularity];
  const step = granularity === 'hour' ? 3600000 : granularity === 'day' ? 43200000 : 15 * 86400000;
  const keys = [];
  const seen = new Set();
  for (let t = from; t <= to + step; t += step) {
    const k = keyOf(Math.min(t, to));
    if (!seen.has(k)) {
      seen.add(k);
      keys.push(k);
    }
  }
  const index = new Map(keys.map((k, i) => [k, i]));
  const views = keys.map(() => 0);
  const visitors = keys.map(() => new Set());
  for (const r of rows) {
    const i = index.get(keyOf(r.ts));
    if (i === undefined) continue;
    views[i] += 1;
    visitors[i].add(r.visitor);
  }
  return { granularity, keys, views, visitors: visitors.map(s => s.size) };
}

function pagesReport(rows, clicks) {
  const map = new Map();
  for (const r of rows) {
    let p = map.get(r.page);
    if (!p) {
      p = { page: r.page, views: 0, set: new Set(), durations: [], scroll: 0, origin: '', title: '', last: 0 };
      map.set(r.page, p);
    }
    p.views += 1;
    p.set.add(r.visitor);
    if (r.duration > 0) p.durations.push(Math.min(r.duration, MAX_DURATION));
    p.scroll += r.scroll || 0;
    if (r.ts >= p.last) {
      p.last = r.ts;
      if (r.origin) p.origin = r.origin;
      if (r.title) p.title = r.title;
    }
  }
  return [...map.values()]
    .map(p => ({
      page: p.page,
      title: p.title,
      origin: p.origin,
      views: p.views,
      visitors: p.set.size,
      avgDuration: p.durations.length ? Math.round(sum(p.durations, d => d) / p.durations.length) : 0,
      avgScroll: Math.round(p.scroll / p.views),
      clicks: Array.isArray(clicks[p.page]) ? clicks[p.page].length : 0
    }))
    .sort((a, b) => b.views - a.views || b.visitors - a.visitors)
    .slice(0, 50);
}

function eventsReport(events) {
  const map = new Map();
  for (const e of events) {
    if (e.kind === 'view') continue;
    const key = e.kind + '|' + e.label;
    let g = map.get(key);
    if (!g) {
      g = { kind: e.kind, label: e.label, count: 0, set: new Set(), pages: new Map() };
      map.set(key, g);
    }
    g.count += 1;
    g.set.add(e.visitor);
    g.pages.set(e.page, (g.pages.get(e.page) || 0) + 1);
  }
  return [...map.values()]
    .map(g => ({
      kind: g.kind,
      label: g.label,
      count: g.count,
      visitors: g.set.size,
      page: [...g.pages.entries()].sort((a, b) => b[1] - a[1])[0][0],
      pages: g.pages.size
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 60);
}

function sectionsReport(events, rows) {
  const pageViews = new Map();
  for (const r of rows) pageViews.set(r.page, (pageViews.get(r.page) || 0) + 1);
  const map = new Map();
  for (const e of events) {
    if (e.kind !== 'view') continue;
    const key = e.page + '|' + e.label;
    let g = map.get(key);
    if (!g) {
      g = { page: e.page, label: e.label, visits: new Set() };
      map.set(key, g);
    }
    g.visits.add(e.visit);
  }
  return [...map.values()]
    .map(g => {
      const total = pageViews.get(g.page) || 0;
      return { page: g.page, label: g.label, views: g.visits.size, rate: total ? Math.min(100, Math.round((g.visits.size / total) * 100)) : 0 };
    })
    .sort((a, b) => (pageViews.get(b.page) || 0) - (pageViews.get(a.page) || 0) || a.page.localeCompare(b.page) || b.rate - a.rate)
    .slice(0, 60);
}

function publicVisit(r, events) {
  return {
    id: r.id,
    ts: r.ts,
    lastSeen: r.lastSeen,
    page: r.page,
    title: r.title,
    source: r.source,
    referrer: r.referrer,
    device: r.device,
    browser: r.browser,
    os: r.os,
    screen: r.screen,
    language: r.language,
    country: r.country,
    countryCode: r.countryCode,
    city: r.city,
    duration: r.duration || 0,
    scroll: r.scroll || 0,
    isNew: Boolean(r.isNew),
    visitor: String(r.visitor || '').slice(0, 6),
    events: (events || []).slice(0, 12).map(e => ({ kind: e.kind, label: e.label }))
  };
}

function eventsIn(data, from, to, ids) {
  return between(data.events, from, to + MAX_DURATION * 4).filter(e => ids.has(e.visit));
}

function countByVisit(events) {
  const map = new Map();
  for (const e of events) {
    if (e.kind === 'view') continue;
    map.set(e.visit, (map.get(e.visit) || 0) + 1);
  }
  return map;
}

function select(data, rangeKey, page) {
  const now = Date.now();
  const range = Object.hasOwn(RANGES, rangeKey) ? rangeKey : '30d';
  const days = RANGES[range];
  const scoped = page ? data.visits.filter(v => v.page === page) : data.visits;
  let from;
  if (days) from = now - days * 86400000;
  else from = scoped.length ? Math.min(scoped[0].ts, now - 7 * 86400000) : now - 30 * 86400000;
  const rows = between(scoped, from, now);
  return { now, range, days, scoped, from, rows };
}

function report(entry, options) {
  const data = entry.data;
  const page = options.page ? String(options.page).slice(0, 300) : '';
  const { now, range, days, scoped, from, rows } = select(data, options.range, page);
  const ids = new Set(rows.map(r => r.id));
  const events = eventsIn(data, from, now, ids);
  const byVisit = countByVisit(events);
  const spanDays = (now - from) / 86400000;
  const granularity = spanDays <= 2 ? 'hour' : spanDays <= 120 ? 'day' : 'month';

  let previous = null;
  if (days) {
    const prevFrom = from - (now - from);
    const prevRows = between(scoped, prevFrom, from - 1);
    const prevIds = new Set(prevRows.map(r => r.id));
    previous = kpis(prevRows, countByVisit(eventsIn(data, prevFrom, from - 1, prevIds)));
  }

  const eventsByVisit = new Map();
  for (const e of events) {
    if (e.kind === 'view') continue;
    if (!eventsByVisit.has(e.visit)) eventsByVisit.set(e.visit, []);
    eventsByVisit.get(e.visit).push(e);
  }

  const liveRows = scoped.slice(lowerBound(scoped, now - UPDATE_LOOKBACK)).filter(v => now - (v.lastSeen || v.ts) <= LIVE_MS);
  const hours = Array(24).fill(0);
  for (const r of rows) hours[Number(parts(r.ts).hour)] += 1;

  const entries = rows.filter(r => r.entry !== false);
  const last = data.visits.length ? data.visits[data.visits.length - 1] : null;

  return {
    tagId: data.tagId,
    name: data.name,
    created: data.created,
    range,
    page,
    from,
    to: now,
    timezone: TZ,
    totalViews: data.visits.length,
    lastVisit: last ? last.ts : null,
    bots: data.bots || 0,
    kpis: kpis(rows, byVisit),
    previous,
    live: {
      visitors: new Set(liveRows.map(v => v.visitor)).size,
      pages: group(liveRows, r => r.page).slice(0, 10)
    },
    series: series(rows, from, now, granularity),
    pages: pagesReport(rows, data.clicks),
    hosts: group(rows, r => r.host || null),
    sources: top(group(entries, r => r.source || 'Direct'), 10),
    referrers: top(group(entries, r => r.referrer || null), 10),
    campaigns: top(group(entries, r => (r.utm ? [r.utm.source, r.utm.medium, r.utm.campaign].filter(Boolean).join(' · ') : null)), 8),
    devices: group(rows, r => r.device || 'other'),
    browsers: top(group(rows, r => r.browser || 'Autre'), 7),
    os: top(group(rows, r => r.os || 'Autre'), 7),
    screens: top(group(rows, r => r.screen || null), 7),
    languages: top(group(rows, r => (r.language ? r.language.split('-')[0].toLowerCase() : null)), 8),
    countries: top(group(rows, r => r.countryCode || null, r => ({ name: r.country })), 12),
    cities: top(group(rows, r => (r.city ? `${r.city}|${r.countryCode || ''}` : null), r => ({ city: r.city, countryCode: r.countryCode })), 10),
    map: group(rows.filter(r => r.lat !== null && r.lat !== undefined && r.lon !== null && r.lon !== undefined), r => `${r.lat},${r.lon}`, r => ({ lat: r.lat, lon: r.lon, city: r.city, country: r.country, countryCode: r.countryCode })),
    themes: group(rows, r => (r.dark === null || r.dark === undefined ? null : r.dark ? 'dark' : 'light')),
    loyalty: group(rows, r => (r.isNew ? 'new' : 'returning')),
    hours,
    events: eventsReport(events),
    sections: sectionsReport(events, rows),
    recent: rows.slice(-60).reverse().map(r => publicVisit(r, eventsByVisit.get(r.id)))
  };
}

function summary(entry) {
  const data = entry.data;
  const now = Date.now();
  const recent = between(data.visits, now - 30 * 86400000, now);
  const live = data.visits.slice(lowerBound(data.visits, now - UPDATE_LOOKBACK)).filter(v => now - (v.lastSeen || v.ts) <= LIVE_MS);
  const last = data.visits.length ? data.visits[data.visits.length - 1] : null;
  return {
    tagId: data.tagId,
    name: data.name,
    created: data.created,
    total: data.visits.length,
    views30: recent.length,
    visitors30: new Set(recent.map(v => v.visitor)).size,
    live: new Set(live.map(v => v.visitor)).size,
    lastVisit: last ? last.ts : null,
    hosts: [...new Set(recent.map(v => v.host).filter(Boolean))].slice(0, 5)
  };
}

function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return /[";\n\r]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}

function csv(entry, options) {
  const data = entry.data;
  const page = options.page ? String(options.page).slice(0, 300) : '';
  const { now, from, rows } = select(data, options.range, page);
  const ids = new Set(rows.map(r => r.id));
  const events = eventsIn(data, from, now, ids);
  const byVisit = new Map();
  for (const e of events) {
    if (!byVisit.has(e.visit)) byVisit.set(e.visit, []);
    byVisit.get(e.visit).push(e.kind === 'view' ? `vue:${e.label}` : `${e.kind}:${e.label}`);
  }
  const date = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'medium' });
  const header = ['Date', 'Site', 'Page', 'Titre', 'Source', 'Référent', 'Campagne', 'Appareil', 'Navigateur', 'Système', 'Écran', 'Langue', 'Pays', 'Ville', 'Durée (s)', 'Scroll (%)', 'Nouveau visiteur', 'Visiteur', 'Actions'];
  const lines = [header.map(csvCell).join(';')];
  for (const r of rows) {
    lines.push([
      date.format(new Date(r.ts)),
      r.host,
      r.page,
      r.title,
      r.source,
      r.referrer,
      r.utm ? [r.utm.source, r.utm.medium, r.utm.campaign].filter(Boolean).join(' · ') : '',
      r.device,
      r.browser,
      r.os,
      r.screen,
      r.language,
      r.country,
      r.city,
      Math.round((r.duration || 0) / 1000),
      r.scroll || 0,
      r.isNew ? 'oui' : 'non',
      String(r.visitor || '').slice(0, 8),
      (byVisit.get(r.id) || []).join(' | ')
    ].map(csvCell).join(';'));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

module.exports = { RANGES, report, summary, csv };
