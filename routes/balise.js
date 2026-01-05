const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Remonte d'un cran pour stocker les data à la racine du projet
const DATA_DIR = path.join(__dirname, '..', 'data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getTagFilePath(tagId) {
  return path.join(DATA_DIR, 'tag_' + tagId + '.json');
}

function loadTagData(tagId) {
  ensureDataDir();
  var filePath = getTagFilePath(tagId);
  if (!fs.existsSync(filePath)) {
    return { tagId: tagId, created: Date.now(), visits: [], pageTime: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return { tagId: tagId, created: Date.now(), visits: [], pageTime: {} };
  }
}

function saveTagData(tagId, data) {
  ensureDataDir();
  fs.writeFileSync(getTagFilePath(tagId), JSON.stringify(data, null, 2));
}

function cleanOldData(data) {
  var oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
  if (data.visits) {
    data.visits = data.visits.filter(function(v) { return v.timestamp >= oneYearAgo; });
  }
  return data;
}

// Route: /:id/track
router.post('/:id/track', function(req, res) {
  var tagId = req.params.id;
  var visit = req.body;
  console.log('Track:', tagId, visit);
  
  if (!visit || !visit.timestamp) {
    return res.status(400).json({ error: 'Invalid visit data' });
  }

  var data = cleanOldData(loadTagData(tagId));
  
  data.visits.push({
    page: visit.page || '/',
    referrer: visit.referrer || '',
    referrerType: visit.referrerType || 'direct',
    device: visit.device || 'desktop',
    browser: visit.browser || 'other',
    screenWidth: visit.screenWidth || 0,
    screenHeight: visit.screenHeight || 0,
    language: visit.language || 'unknown',
    timestamp: visit.timestamp
  });

  saveTagData(tagId, data);
  res.json({ success: true, total: data.visits.length });
});

// Route: /:id/time
router.post('/:id/time', function(req, res) {
  var tagId = req.params.id;
  var body = req.body;
  
  // sendBeacon envoie souvent du texte brut, on tente de parser
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ error: 'Invalid JSON' }); }
  }
  
  if (!body.page || typeof body.time !== 'number') {
    return res.status(400).json({ error: 'Invalid time data' });
  }

  var data = loadTagData(tagId);
  if (!data.pageTime) data.pageTime = {}; // Sécurité
  
  if (!data.pageTime[body.page]) {
    data.pageTime[body.page] = { totalTime: 0, count: 0 };
  }
  data.pageTime[body.page].totalTime += body.time;
  data.pageTime[body.page].count += 1;
  saveTagData(tagId, data);
  res.json({ success: true });
});

// Route: /:id/stats
router.get('/:id/stats', function(req, res) {
  var tagId = req.params.id;
  var data = cleanOldData(loadTagData(tagId));
  
  var todayStart = new Date().setHours(0, 0, 0, 0);
  var monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  var yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();

  var todayVisits = data.visits.filter(function(v) { return v.timestamp >= todayStart; });
  var monthVisits = data.visits.filter(function(v) { return v.timestamp >= monthStart; });
  var yearVisits = data.visits.filter(function(v) { return v.timestamp >= yearStart; });

  var pages = {};
  data.visits.forEach(function(v) {
    if (!pages[v.page]) pages[v.page] = { views: 0, timestamps: [] };
    pages[v.page].views++;
    pages[v.page].timestamps.push(v.timestamp);
  });

  var topPages = Object.keys(pages).map(function(url) {
    var avgTime = (data.pageTime && data.pageTime[url]) ? Math.round(data.pageTime[url].totalTime / data.pageTime[url].count / 1000) : 0;
    return { url: url, views: pages[url].views, uniques: pages[url].timestamps.length, avgTime: avgTime + 's' };
  }).sort(function(a, b) { return b.views - a.views; }).slice(0, 10).map(function(p, i) {
    return { rank: i + 1, url: p.url, views: p.views, uniques: p.uniques, avgTime: p.avgTime };
  });

  var devices = { mobile: 0, desktop: 0, tablet: 0 };
  var browsers = { chrome: 0, safari: 0, firefox: 0, edge: 0, other: 0 };

  data.visits.forEach(function(v) {
    if (devices[v.device] !== undefined) devices[v.device]++;
    if (browsers[v.browser] !== undefined) browsers[v.browser]++;
    else browsers.other++;
  });

  var hourlyData = new Array(24).fill(0);
  todayVisits.forEach(function(v) { hourlyData[new Date(v.timestamp).getHours()]++; });

  var dailyData = [];
  for (var i = 29; i >= 0; i--) {
    var dayStart = todayStart - i * 86400000;
    var dayEnd = dayStart + 86400000;
    var count = 0;
    data.visits.forEach(function(v) { if (v.timestamp >= dayStart && v.timestamp < dayEnd) count++; });
    dailyData.push(count);
  }

  var monthlyData = [];
  for (var j = 11; j >= 0; j--) {
    var d = new Date();
    d.setMonth(d.getMonth() - j);
    var mStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    var mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    var mcount = 0;
    data.visits.forEach(function(v) { if (v.timestamp >= mStart && v.timestamp < mEnd) mcount++; });
    monthlyData.push(mcount);
  }

  res.json({
    tagId: tagId,
    created: data.created,
    stats: { today: { visitors: todayVisits.length }, month: { visitors: monthVisits.length }, year: { visitors: yearVisits.length }, total: data.visits.length, pages: topPages.length },
    topPages: topPages,
    devices: devices,
    browsers: browsers,
    charts: { hourly: hourlyData, daily: dailyData, monthly: monthlyData }
  });
});

// Route: /:id (GET info)
router.get('/:id', function(req, res) {
  var data = loadTagData(req.params.id);
  res.json({ tagId: req.params.id, created: data.created, totalVisits: data.visits.length });
});

// Route: /:id (POST update info)
router.post('/:id', function(req, res) {
  var tagId = req.params.id;
  var data = loadTagData(tagId);
  data.name = req.body.name || tagId;
  data.created = data.created || Date.now();
  saveTagData(tagId, data);
  res.json({ success: true, tagId: tagId, name: data.name });
});

// Route: /:id (DELETE)
router.delete('/:id', function(req, res) {
  var filePath = getTagFilePath(req.params.id);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ success: true });
});

module.exports = router;