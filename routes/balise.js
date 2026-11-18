const express = require('express');
const store = require('../lib/store');
const stats = require('../lib/stats');
const auth = require('../lib/auth');
const { normalizePath } = require('../lib/collect');

const router = express.Router();
const HEATMAP_TOKEN_MS = 2 * 3600000;

function cleanName(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

function load(req, res) {
  const entry = store.get(req.params.id);
  if (!entry) {
    res.status(404).json({ error: 'Balise inconnue' });
    return null;
  }
  return entry;
}

router.get('/', function (req, res) {
  res.json(store.list().map(stats.summary));
});

router.post('/:id', function (req, res) {
  const tagId = req.params.id;
  if (!store.isValidTag(tagId)) return res.status(400).json({ error: 'Code de balise invalide' });
  const name = cleanName(req.body && req.body.name) || tagId;
  const existing = store.get(tagId);
  const clash = store.list().find(e => e.data.tagId !== tagId && e.data.name.toLowerCase() === name.toLowerCase());
  if (clash) return res.status(409).json({ error: 'Une balise avec ce nom existe déjà.' });
  const entry = store.create(tagId, name);
  res.status(existing ? 200 : 201).json({ success: true, tagId, name: entry.data.name, created: entry.data.created });
});

router.get('/:id', function (req, res) {
  const entry = load(req, res);
  if (!entry) return;
  res.json(stats.summary(entry));
});

router.delete('/:id', function (req, res) {
  if (!store.isValidTag(req.params.id)) return res.status(400).json({ error: 'Code de balise invalide' });
  store.remove(req.params.id);
  res.json({ success: true });
});

router.post('/:id/reset', function (req, res) {
  const entry = load(req, res);
  if (!entry) return;
  store.reset(entry);
  res.json({ success: true });
});

router.get('/:id/stats', function (req, res) {
  const entry = load(req, res);
  if (!entry) return;
  res.set('Cache-Control', 'no-store');
  res.json(stats.report(entry, { range: String(req.query.range || '30d'), page: req.query.page ? String(req.query.page) : '' }));
});

router.get('/:id/export.csv', function (req, res) {
  const entry = load(req, res);
  if (!entry) return;
  const range = String(req.query.range || '30d');
  const file = `visites-${entry.data.tagId}-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${file}"`,
    'Cache-Control': 'no-store'
  });
  res.send(stats.csv(entry, { range, page: req.query.page ? String(req.query.page) : '' }));
});

router.post('/:id/heatmap-token', function (req, res) {
  const entry = load(req, res);
  if (!entry) return;
  res.json({ token: auth.makeToken('heatmap.' + entry.data.tagId, HEATMAP_TOKEN_MS), expiresIn: HEATMAP_TOKEN_MS });
});

router.get('/:id/heatmap', function (req, res) {
  const entry = load(req, res);
  if (!entry) return;
  const page = normalizePath(req.query.path || '/');
  res.json({ page, clicks: entry.data.clicks[page] || [] });
});

module.exports = router;
