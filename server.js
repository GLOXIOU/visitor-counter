const express = require('express');
const baliseRoute = require('./routes/balise');
const heatmapRoute = require('./routes/heatmap');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.static('public'));

app.use('/api/balise', baliseRoute);
app.use('/api/heatmap', heatmapRoute);

app.get('/tag.js', (req, res) => {
  const tagId = req.query.tag;
  
  if (!tagId) {
    return res.status(400).send('// Missing tag parameter');
  }

  const trackingScript = `
(function() {
  const TAG_ID = '${tagId}';
  const API_URL = '${req.protocol}://${req.get('host')}/api';
  
  function getDeviceType() {
    const ua = navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
      return 'tablet';
    }
    if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
      return 'mobile';
    }
    return 'desktop';
  }

  function getBrowser() {
    const ua = navigator.userAgent;
    if (ua.indexOf('Firefox') > -1) return 'firefox';
    if (ua.indexOf('Chrome') > -1) return 'chrome';
    if (ua.indexOf('Safari') > -1) return 'safari';
    if (ua.indexOf('Edge') > -1) return 'edge';
    return 'other';
  }

  function getReferrerType() {
    const ref = document.referrer;
    if (!ref) return 'direct';
    if (ref.includes('google') || ref.includes('bing') || ref.includes('yahoo')) return 'search';
    if (ref.includes('facebook') || ref.includes('twitter') || ref.includes('instagram')) return 'social';
    return 'referral';
  }

  const data = {
    tag: TAG_ID,
    page: window.location.pathname + window.location.search,
    referrer: document.referrer,
    referrerType: getReferrerType(),
    device: getDeviceType(),
    browser: getBrowser(),
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    language: navigator.language,
    timestamp: Date.now()
  };

  fetch(API_URL + '/balise/' + TAG_ID + '/track', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  }).catch(function(err) {
    console.error('Visitor Counter tracking error:', err);
  });

  let startTime = Date.now();
  let isVisible = !document.hidden;

  document.addEventListener('visibilitychange', function() {
    if (document.hidden && isVisible) {
      const timeSpent = Date.now() - startTime;
      navigator.sendBeacon(
        API_URL + '/balise/' + TAG_ID + '/time',
        JSON.stringify({ page: window.location.pathname, time: timeSpent })
      );
      isVisible = false;
    } else if (!document.hidden) {
      startTime = Date.now();
      isVisible = true;
    }
  });

  window.addEventListener('beforeunload', function() {
    if (isVisible) {
      const timeSpent = Date.now() - startTime;
      navigator.sendBeacon(
        API_URL + '/balise/' + TAG_ID + '/time',
        JSON.stringify({ page: window.location.pathname, time: timeSpent })
      );
    }
  });
})();
`;

  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(trackingScript);
});

app.get('/', (req, res) => {
  res.redirect('/index/index.html');
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Visitor Counter server running on http://localhost:${port}`);
  console.log(`📊 Dashboard: http://localhost:${port}/index/index.html`);
});