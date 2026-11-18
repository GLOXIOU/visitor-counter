const TTL_MS = 24 * 3600 * 1000;
const MAX_ENTRIES = 5000;
const ENABLED = !/^(0|off|false|no)$/i.test(process.env.GEOIP || 'on');

const cache = new Map();
const pending = new Map();
const status = { enabled: ENABLED, lastSuccess: 0, lastError: 0, lookups: 0 };
let ipApiPausedUntil = 0;

function isPrivate(ip) {
  if (!ip) return true;
  if (ip === '::1' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return true;
  if (/^(fc|fd|fe80)/i.test(ip)) return true;
  return !/^[0-9a-f:.]+$/i.test(ip);
}

function round(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function text(value, max) {
  const s = String(value ?? '').trim();
  return s ? s.slice(0, max) : '';
}

async function fromIpApi(ip) {
  if (Date.now() < ipApiPausedUntil) return null;
  const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,city,lat,lon&lang=fr`, {
    signal: AbortSignal.timeout(2500)
  });
  if (res.status === 429 || res.headers.get('x-rl') === '0') {
    ipApiPausedUntil = Date.now() + (Number(res.headers.get('x-ttl')) || 60) * 1000;
  }
  if (!res.ok) return null;
  const d = await res.json();
  if (d.status !== 'success') return null;
  return {
    country: text(d.country, 80),
    countryCode: text(d.countryCode, 2).toUpperCase(),
    city: text(d.city, 100),
    lat: round(d.lat),
    lon: round(d.lon)
  };
}

async function fromIpWho(ip) {
  const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?lang=fr&fields=success,country,country_code,city,latitude,longitude`, {
    signal: AbortSignal.timeout(2500)
  });
  if (!res.ok) return null;
  const d = await res.json();
  if (!d.success) return null;
  return {
    country: text(d.country, 80),
    countryCode: text(d.country_code, 2).toUpperCase(),
    city: text(d.city, 100),
    lat: round(d.latitude),
    lon: round(d.longitude)
  };
}

async function resolve(ip) {
  for (const provider of [fromIpApi, fromIpWho]) {
    const value = await provider(ip).catch(() => null);
    if (value) return value;
  }
  return null;
}

async function lookup(ip) {
  if (!ENABLED || isPrivate(ip)) return null;
  const cached = cache.get(ip);
  if (cached && cached.expires > Date.now()) return cached.value;
  if (pending.has(ip)) return pending.get(ip);
  const job = resolve(ip).then(value => {
    pending.delete(ip);
    status.lookups += 1;
    if (value) {
      status.lastSuccess = Date.now();
      if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
      cache.set(ip, { value, expires: Date.now() + TTL_MS });
    } else {
      status.lastError = Date.now();
    }
    return value;
  });
  pending.set(ip, job);
  return job;
}

module.exports = { lookup, isPrivate, status };
