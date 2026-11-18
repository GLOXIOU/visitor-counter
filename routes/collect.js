const fs = require('fs');
const path = require('path');
const express = require('express');
const store = require('../lib/store');
const auth = require('../lib/auth');
const { collect, normalizePath } = require('../lib/collect');

const router = express.Router();
const TRACKER_FILE = path.join(__dirname, '..', 'tracker', 'tag.js');
let tracker = { mtime: 0, body: '' };

function trackerSource() {
  const stat = fs.statSync(TRACKER_FILE);
  if (stat.mtimeMs !== tracker.mtime) tracker = { mtime: stat.mtimeMs, body: fs.readFileSync(TRACKER_FILE, 'utf8') };
  return tracker.body;
}

function cors(req, res, next) {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cross-Origin-Resource-Policy': 'cross-origin'
  });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

router.get('/tag.js', cors, function (req, res) {
  res.set({
    'Content-Type': 'application/javascript; charset=utf-8',
    'Cache-Control': 'public, max-age=600',
    'X-Content-Type-Options': 'nosniff'
  });
  res.send(trackerSource());
});

router.options('/api/collect', cors);
router.post('/api/collect', cors, express.text({ type: () => true, limit: '32kb' }), function (req, res) {
  res.set('Cache-Control', 'no-store').status(204).end();
  try {
    collect(req, typeof req.body === 'string' ? req.body : '');
  } catch (e) {
    console.error('Donnée de suivi ignorée :', e.message);
  }
});

router.options('/api/heatmap/:tag', cors);
router.get('/api/heatmap/:tag', cors, function (req, res) {
  const tagId = req.params.tag;
  if (!store.isValidTag(tagId) || !auth.checkToken(String(req.query.token || ''), 'heatmap.' + tagId)) {
    return res.status(403).json({ error: 'Lien de heatmap invalide ou expiré' });
  }
  const entry = store.get(tagId);
  if (!entry) return res.status(404).json({ error: 'Balise inconnue' });
  const page = normalizePath(req.query.path || '/');
  res.set('Cache-Control', 'no-store');
  res.json({ page, clicks: entry.data.clicks[page] || [] });
});

router.get('/api/ping', function (req, res) {
  res.set('Cache-Control', 'no-store').json({ ok: true, time: Date.now() });
});

module.exports = router;
