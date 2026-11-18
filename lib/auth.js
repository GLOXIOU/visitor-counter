const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./store');

const PASSWORD = process.env.ADMIN_PASSWORD || '';
const COOKIE = 'vc_session';
const SESSION_MS = 30 * 86400000;
const PASSWORD_TAG = crypto.createHash('sha256').update('vc|' + PASSWORD).digest('base64url').slice(0, 12);

function loadSecret() {
  if (process.env.SECRET) return process.env.SECRET;
  const file = path.join(DATA_DIR, '.secret');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch (e) {}
  const secret = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

const SECRET = loadSecret();

function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function makeToken(scope, ttlMs) {
  const exp = (Date.now() + ttlMs).toString(36);
  return exp + '.' + sign(scope + '.' + exp);
}

function checkToken(token, scope) {
  if (typeof token !== 'string') return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig) return false;
  const expires = parseInt(exp, 36);
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  return safeEqual(sig, sign(scope + '.' + exp));
}

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    if (key) out[key] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function isAuthenticated(req) {
  if (!PASSWORD) return true;
  return checkToken(cookies(req)[COOKIE], 'session.' + PASSWORD_TAG);
}

function requireAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  res.status(401).json({ error: 'auth' });
}

const attempts = new Map();

function login(req, res) {
  if (!PASSWORD) return res.json({ success: true, authRequired: false });
  const key = req.ip || 'unknown';
  const now = Date.now();
  let a = attempts.get(key);
  if (!a || a.reset < now) {
    a = { n: 0, reset: now + 15 * 60000 };
    attempts.set(key, a);
  }
  if (a.n >= 10) return res.status(429).json({ error: 'Trop de tentatives, réessaie dans quelques minutes.' });
  const given = String((req.body && req.body.password) || '');
  const ok = safeEqual(
    crypto.createHash('sha256').update(given).digest('hex'),
    crypto.createHash('sha256').update(PASSWORD).digest('hex')
  );
  if (!ok) {
    a.n += 1;
    return res.status(401).json({ error: 'Mot de passe incorrect.' });
  }
  attempts.delete(key);
  const token = makeToken('session.' + PASSWORD_TAG, SESSION_MS);
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${secure}`);
  res.json({ success: true });
}

function logout(req, res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.json({ success: true });
}

module.exports = {
  enabled: Boolean(PASSWORD),
  requireAuth,
  isAuthenticated,
  makeToken,
  checkToken,
  login,
  logout
};
