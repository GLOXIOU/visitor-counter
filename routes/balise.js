const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

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
    return { tagId: tagId, created: Date.now(), visits: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return { tagId: tagId, created: Date.now(), visits: [] };
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

router.post('/:id/track', function(req, res) {
  var tagId = req.params.id;
  var visit = req.body;
  
  if (!visit || !visit.timestamp) {
    return res.status(400).json({ error: 'Invalid visit data' });
  }

  var data = cleanOldData(loadTagData(tagId));
  
  // Récupération de l'IP
  var ip = req.ip || req.connection.remoteAddress;
  // Nettoyage format IPv6 local ::1 ou ::ffff:
  if (ip && ip.includes('::ffff:')) {
    ip = ip.split('::ffff:')[1];
  }

  data.visits.push({
    visitorId: visit.visitorId || 'anon',
    page: visit.page || '/',
    referrer: visit.referrer || '',
    referrerType: visit.referrerType || 'direct',
    device: visit.device || 'desktop',
    browser: visit.browser || 'other',
    language: visit.language || 'unknown',
    timestamp: visit.timestamp,
    ip: ip // Stockage de l'IP pour la map
  });

  saveTagData(tagId, data);
  res.json({ success: true });
});

router.post('/:id/reset', function(req, res) {
  var tagId = req.params.id;
  var data = loadTagData(tagId);
  data.visits = [];
  data.created = Date.now();
  saveTagData(tagId, data);
  res.json({ success: true });
});

router.get('/:id/stats', function(req, res) {
  var tagId = req.params.id;
  var data = cleanOldData(loadTagData(tagId));
  
  var todayStart = new Date().setHours(0, 0, 0, 0);
  var monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  var yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();

  var todayVisits = data.visits.filter(function(v) { return v.timestamp >= todayStart; });
  var monthVisits = data.visits.filter(function(v) { return v.timestamp >= monthStart; });
  var yearVisits = data.visits.filter(function(v) { return v.timestamp >= yearStart; });

  function countUnique(list) {
    var s = new Set();
    list.forEach(function(v) { if(v.visitorId) s.add(v.visitorId); });
    return s.size;
  }

  var pages = {};
  data.visits.forEach(function(v) {
    if (!pages[v.page]) pages[v.page] = { views: 0, visitors: new Set() };
    pages[v.page].views++;
    if(v.visitorId) pages[v.page].visitors.add(v.visitorId);
  });

  var topPages = Object.keys(pages).map(function(url) {
    return { url: url, views: pages[url].views, uniques: pages[url].visitors.size };
  }).sort(function(a, b) { return b.views - a.views; }).slice(0, 10).map(function(p, i) {
    return { rank: i + 1, url: p.url, views: p.views, uniques: p.uniques };
  });

  var devices = { mobile: 0, desktop: 0, tablet: 0 };
  var browsers = { chrome: 0, safari: 0, firefox: 0, edge: 0, other: 0 };
  var languages = {};
  
  // Collecte des IPs uniques pour la map côté client
  var uniqueIps = new Set();

  data.visits.forEach(function(v) {
    if (devices[v.device] !== undefined) devices[v.device]++;
    if (browsers[v.browser] !== undefined) browsers[v.browser]++; else browsers.other++;
    
    var lang = v.language ? v.language.split('-')[0].toUpperCase() : '??';
    if(!languages[lang]) languages[lang] = 0;
    languages[lang]++;
    
    if (v.ip && v.ip !== '::1' && v.ip !== '127.0.0.1') {
        uniqueIps.add(v.ip);
    }
  });

  var topLanguages = Object.keys(languages).map(function(k){
    return { code: k, count: languages[k] };
  }).sort(function(a,b){ return b.count - a.count; }).slice(0, 5);

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
  
  // Pour l'export CSV
  var rawVisits = data.visits.map(function(v){
      return { 
          timestamp: new Date(v.timestamp).toISOString(), 
          page: v.page, 
          device: v.device, 
          browser: v.browser,
          visitorId: v.visitorId,
          country: "Unknown" // Sera enrichi coté client éventuellement ou laissé tel quel
      };
  });

  res.json({
    tagId: tagId,
    created: data.created,
    stats: { 
      today: { views: todayVisits.length, visitors: countUnique(todayVisits) }, 
      month: { views: monthVisits.length, visitors: countUnique(monthVisits) }, 
      year: { views: yearVisits.length, visitors: countUnique(yearVisits) }, 
      total: data.visits.length
    },
    topPages: topPages,
    devices: devices,
    browsers: browsers,
    languages: topLanguages,
    charts: { hourly: hourlyData, daily: dailyData, monthly: monthlyData },
    ips: Array.from(uniqueIps), // Envoi des IPs pour la map
    rawVisits: rawVisits // Pour l'export CSV
  });
});

router.get('/:id', function(req, res) {
  var data = loadTagData(req.params.id);
  res.json({ tagId: req.params.id, created: data.created, totalVisits: data.visits.length });
});

router.post('/:id', function(req, res) {
  var tagId = req.params.id;
  var data = loadTagData(tagId);
  data.name = req.body.name || tagId;
  data.created = data.created || Date.now();
  saveTagData(tagId, data);
  res.json({ success: true, tagId: tagId, name: data.name });
});

router.delete('/:id', function(req, res) {
  var filePath = getTagFilePath(req.params.id);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ success: true });
});

module.exports = router;