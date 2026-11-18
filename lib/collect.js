const store = require('./store');
const geo = require('./geo');

const ID_RE = /^[a-z0-9]{8,32}$/i;
const EVENT_KINDS = new Set(['link', 'outbound', 'mail', 'tel', 'download', 'button', 'click', 'form', 'view', 'media', 'copy', 'print', 'custom']);
const DEVICES = new Set(['d', 'm', 't']);
const MAX_EVENTS_PER_VISIT = 150;
const MAX_CLICKS_PER_VISIT = 300;
const UPDATE_WINDOW_MS = 86400000;

const BOT_UA = /bot\b|bot\/|crawl|spider|slurp|scrape|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|slack|skype|headless|phantom|puppeteer|playwright|selenium|webdriver|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|python|curl|wget|httpclient|go-http|okhttp|java\/|axios|node-fetch|scrapy|ahrefs|semrush|mj12|bytespider|petalbot|yandex|baidu|applebot|bingpreview|google-inspectiontool|cypress/i;

const SOURCES = [
  [/(^|\.)linkedin\.|^lnkd\.in$/, 'LinkedIn'],
  [/(^|\.)google\.|^googleads|gemini\.google/, 'Google'],
  [/(^|\.)bing\.com$/, 'Bing'],
  [/duckduckgo/, 'DuckDuckGo'],
  [/(^|\.)qwant\./, 'Qwant'],
  [/(^|\.)ecosia\./, 'Ecosia'],
  [/(^|\.)yahoo\./, 'Yahoo'],
  [/(^|\.)yandex\./, 'Yandex'],
  [/chatgpt|openai|perplexity|claude\.ai|copilot|mistral\.ai/, 'IA (ChatGPT, Claude…)'],
  [/(^|\.)github\.(com|io)$/, 'GitHub'],
  [/instagram/, 'Instagram'],
  [/(^|\.)facebook\.|^fb\.|^m\.facebook|messenger\.com/, 'Facebook'],
  [/^t\.co$|(^|\.)twitter\.com$|(^|\.)x\.com$/, 'X / Twitter'],
  [/(^|\.)youtube\.|youtu\.be/, 'YouTube'],
  [/discord/, 'Discord'],
  [/whatsapp/, 'WhatsApp'],
  [/snapchat/, 'Snapchat'],
  [/tiktok/, 'TikTok'],
  [/reddit/, 'Reddit'],
  [/pinterest/, 'Pinterest'],
  [/(^|\.)mail\.|outlook\.|gmail|proton|webmail|zimbra/, 'E-mail'],
  [/^qr$|qrcode/, 'QR code']
];

const IN_APP = [
  [/LinkedInApp/i, 'LinkedIn'],
  [/Instagram/i, 'Instagram'],
  [/FBAN|FBAV|FB_IAB/i, 'Facebook'],
  [/Snapchat/i, 'Snapchat'],
  [/musical_ly|TikTok|BytedanceWebview/i, 'TikTok'],
  [/Discord/i, 'Discord']
];

function text(value, max) {
  const s = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : '';
}

function int(value, min, max) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : null;
}

function normalizePath(p) {
  let s = String(p || '/').split('#')[0].split('?')[0];
  try { s = decodeURI(s); } catch (e) {}
  s = s.replace(/[\u0000-\u001f\u007f]/g, '');
  if (!s.startsWith('/')) s = '/' + s;
  s = s.replace(/\/{2,}/g, '/').replace(/\/index\.(html?|php)$/i, '/');
  return s.slice(0, 300) || '/';
}

function parseUa(ua, touch) {
  let browser = 'Autre';
  let os = 'Autre';
  const app = IN_APP.find(([re]) => re.test(ua));
  if (app) browser = `${app[1]} (appli)`;
  else if (/Edg(e|A|iOS)?\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser/.test(ua)) browser = 'Samsung Internet';
  else if (/Vivaldi/.test(ua)) browser = 'Vivaldi';
  else if (/YaBrowser/.test(ua)) browser = 'Yandex';
  else if (/Firefox|FxiOS/.test(ua)) browser = 'Firefox';
  else if (/CriOS|Chrome|Chromium/.test(ua)) browser = 'Chrome';
  else if (/Safari/.test(ua)) browser = 'Safari';
  else if (/MSIE|Trident/.test(ua)) browser = 'Internet Explorer';

  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch)) os = 'iPadOS';
  else if (/iPhone|iPod/.test(ua)) os = 'iOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  let device = 'other';
  if (os === 'iPadOS' || /tablet|playbook|silk/i.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) device = 'tablet';
  else if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) device = 'mobile';
  else if (/Windows|Macintosh|Linux|CrOS/i.test(ua)) device = 'desktop';

  return { browser, os, device };
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (e) {
    return '';
  }
}

function classify(refHost, utmSource, ua) {
  if (utmSource) {
    const v = utmSource.toLowerCase();
    const match = SOURCES.find(([re]) => re.test(v));
    return match ? match[1] : text(utmSource, 40);
  }
  if (refHost) {
    const match = SOURCES.find(([re]) => re.test(refHost));
    return match ? match[1] : refHost.replace(/^www\./, '').slice(0, 60);
  }
  const app = IN_APP.find(([re]) => re.test(ua));
  return app ? app[1] : 'Direct';
}

function clientIp(req) {
  let ip = String(req.get('cf-connecting-ip') || req.get('x-real-ip') || req.ip || (req.socket && req.socket.remoteAddress) || '');
  if (ip.includes(',')) ip = ip.split(',')[0];
  ip = ip.trim().replace(/^::ffff:/, '');
  if (ip === '::1') ip = '127.0.0.1';
  return ip;
}

function anonymizeIp(ip) {
  if (!ip) return 'unknown';
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      parts[3] = '0';
      return parts.join('.');
    }
  }
  if (ip.includes(':')) {
    const parts = ip.split(':');
    if (parts.length > 3) return parts.slice(0, 3).join(':') + '::';
  }
  return 'unknown';
}

const buckets = new Map();
function rateLimited(ip) {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || b.reset < now) {
    b = { n: 0, reset: now + 10 * 60000 };
    buckets.set(ip, b);
  }
  b.n += 1;
  if (buckets.size > 20000) {
    for (const [key, value] of buckets) if (value.reset < now) buckets.delete(key);
  }
  return b.n > 900;
}

function recordView(req, entry, data, ip) {
  if (entry.byId.has(data.id)) return;
  const ua = String(req.get('user-agent') || '');
  if (!ua || BOT_UA.test(ua) || text(data.b, 40)) {
    entry.data.bots += 1;
    store.touch(entry);
    return;
  }
  const now = Date.now();
  const host = text(data.h, 120).toLowerCase();
  const rawRef = hostOf(data.r);
  const internal = Boolean(rawRef && host && rawRef === host);
  const refHost = internal ? '' : rawRef;
  const utm = data.u && typeof data.u === 'object' ? data.u : {};
  const utmSource = text(utm.s, 100);
  const { browser, os, device } = parseUa(ua, Number(data.tc) > 1);
  const sw = int(data.sw, 0, 20000);
  const sh = int(data.sh, 0, 20000);
  let origin = text(data.o, 200);
  if (!/^https?:\/\/[^/\s]+$/i.test(origin)) origin = '';

  const visit = {
    id: data.id,
    visitor: /^[a-z0-9]{6,40}$/i.test(String(data.vid || '')) ? String(data.vid) : data.id,
    ts: now,
    lastSeen: now,
    page: normalizePath(data.p),
    host,
    origin,
    title: text(data.ti, 140),
    referrer: refHost,
    source: internal ? 'Navigation interne' : classify(refHost, utmSource, ua),
    entry: !internal,
    utm: utmSource || utm.m || utm.c ? { source: utmSource, medium: text(utm.m, 100), campaign: text(utm.c, 100) } : null,
    device,
    browser,
    os,
    screen: sw && sh ? `${sw}×${sh}` : '',
    language: text(data.l, 16),
    timezone: text(data.z, 64),
    dark: data.dk === 1 ? true : data.dk === 0 ? false : null,
    isNew: Boolean(data.n),
    duration: 0,
    scroll: int(data.s, 0, 100) || 0,
    events: 0,
    clicks: 0,
    ip: anonymizeIp(ip),
    country: '',
    countryCode: '',
    city: '',
    lat: null,
    lon: null
  };

  store.addVisit(entry, visit);
  geo.lookup(ip).then(place => {
    if (!place) return;
    Object.assign(visit, place);
    store.touch(entry);
  }).catch(() => {});
}

function recordPing(entry, data) {
  const visit = entry.byId.get(data.id);
  if (!visit || Date.now() - visit.ts > UPDATE_WINDOW_MS) return;
  visit.duration = Math.max(visit.duration || 0, int(data.d, 0, 4 * 3600000) || 0);
  visit.scroll = Math.max(visit.scroll || 0, int(data.s, 0, 100) || 0);
  visit.lastSeen = Date.now();
  if (Array.isArray(data.c) && data.c.length) {
    const room = MAX_CLICKS_PER_VISIT - (visit.clicks || 0);
    const points = [];
    for (const c of data.c.slice(0, Math.max(0, Math.min(room, 60)))) {
      if (!Array.isArray(c)) continue;
      const x = Number(c[0]);
      const y = Math.round(Number(c[1]));
      if (!(x >= 0 && x <= 1) || !(y >= 0 && y <= 200000)) continue;
      points.push([Math.round(x * 1000) / 1000, y, DEVICES.has(c[2]) ? c[2] : 'd']);
    }
    visit.clicks = (visit.clicks || 0) + points.length;
    store.addClicks(entry, visit.page, points);
  }
  store.touch(entry);
}

function recordEvent(entry, data) {
  const visit = entry.byId.get(data.id);
  if (!visit || Date.now() - visit.ts > UPDATE_WINDOW_MS) return;
  const kind = String(data.k || '');
  const label = text(data.l, 120);
  if (!EVENT_KINDS.has(kind) || !label) return;
  if ((visit.events || 0) >= MAX_EVENTS_PER_VISIT) return;
  visit.events = (visit.events || 0) + 1;
  visit.lastSeen = Date.now();
  store.addEvent(entry, {
    visit: visit.id,
    visitor: visit.visitor,
    page: visit.page,
    ts: Date.now(),
    kind,
    label
  });
}

function collect(req, body) {
  let data;
  try {
    data = JSON.parse(body);
  } catch (e) {
    return;
  }
  if (!data || typeof data !== 'object' || !ID_RE.test(String(data.id || ''))) return;
  if (!store.isValidTag(data.tag)) return;
  const entry = store.get(data.tag);
  if (!entry) return;
  const ip = clientIp(req);
  if (rateLimited(ip)) return;
  if (data.t === 'v') return recordView(req, entry, data, ip);
  if (data.t === 'p') return recordPing(entry, data);
  if (data.t === 'e') return recordEvent(entry, data);
}

module.exports = { collect, normalizePath, clientIp };
