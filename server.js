try {
  process.loadEnvFile();
} catch (e) {}

const path = require('path');
const express = require('express');
const store = require('./lib/store');
const geo = require('./lib/geo');
const auth = require('./lib/auth');
const collectRoute = require('./routes/collect');
const baliseRoute = require('./routes/balise');

const app = express();
const port = Number(process.env.PORT) || 3000;
const publicUrl = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const trustProxy = process.env.TRUST_PROXY;

app.set('trust proxy', trustProxy === undefined ? true : /^(true|1|yes)$/i.test(trustProxy) ? true : /^(false|0|no)$/i.test(trustProxy) ? false : trustProxy);
app.disable('x-powered-by');

app.use(collectRoute);

app.use(express.json({ limit: '1mb' }));

app.get('/api/config', function (req, res) {
  res.set('Cache-Control', 'no-store').json({
    authRequired: auth.enabled,
    authenticated: auth.isAuthenticated(req),
    publicUrl: publicUrl || req.protocol + '://' + req.get('host')
  });
});

app.post('/api/auth/login', auth.login);
app.post('/api/auth/logout', auth.logout);

app.get('/api/status', auth.requireAuth, function (req, res) {
  res.set('Cache-Control', 'no-store').json({
    uptime: Math.round(process.uptime()),
    storage: store.storageInfo(),
    geo: geo.status,
    authRequired: auth.enabled
  });
});

app.use('/api/balise', auth.requireAuth, baliseRoute);

app.use('/api', function (req, res) {
  res.status(404).json({ error: 'Route introuvable' });
});

app.get('/', function (req, res) {
  res.redirect('/index/index.html');
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.use(function (req, res) {
  res.status(404).json({ error: 'Route introuvable' });
});

app.use(function (err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  if (res.headersSent) return next(err);
  res.status(status).json({ error: status === 413 ? 'Requête trop volumineuse' : status < 500 ? 'Requête invalide' : 'Erreur serveur' });
});

app.listen(port, function () {
  console.log('Visitor Counter : http://localhost:' + port);
  if (!auth.enabled) console.log('Aucun ADMIN_PASSWORD défini : le dashboard est accessible sans mot de passe.');
});
