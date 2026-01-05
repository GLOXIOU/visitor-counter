const express = require('express');
const baliseRoute = require('./routes/balise'); // Assurez-vous que le dossier 'routes' existe
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

app.get('/tag.js', function(req, res) {
  var tagId = req.query.tag;
  
  if (!tagId) {
    return res.status(400).send('// Missing tag parameter');
  }

  var host = req.protocol + '://' + req.get('host');

  // Construction du script corrigée (plus lisible et sans erreur de syntaxe)
  var script = `
(function(){
  var TAG_ID="${tagId}";
  var API_URL="${host}/api";

  function getDeviceType(){
    var ua=navigator.userAgent;
    if(/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) return "tablet";
    if(/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) return "mobile";
    return "desktop";
  }

  function getBrowser(){
    var ua=navigator.userAgent;
    if(ua.indexOf("Firefox")>-1) return "firefox";
    if(ua.indexOf("Chrome")>-1) return "chrome";
    if(ua.indexOf("Safari")>-1) return "safari";
    if(ua.indexOf("Edge")>-1) return "edge";
    return "other";
  }

  function getReferrerType(){
    var ref=document.referrer;
    if(!ref) return "direct";
    if(ref.indexOf("google")>-1||ref.indexOf("bing")>-1||ref.indexOf("yahoo")>-1) return "search";
    if(ref.indexOf("facebook")>-1||ref.indexOf("twitter")>-1||ref.indexOf("instagram")>-1) return "social";
    return "referral";
  }

  var data={
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

  fetch(API_URL+"/balise/"+TAG_ID+"/track", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(data)
  }).then(function(){ console.log("Tracked!"); }).catch(function(e){ console.error("Track error:",e); });

  var startTime=Date.now();
  var isVisible=!document.hidden;

  document.addEventListener("visibilitychange", function(){
    if(document.hidden && isVisible){
      var t=Date.now()-startTime;
      navigator.sendBeacon(API_URL+"/balise/"+TAG_ID+"/time", JSON.stringify({page:window.location.pathname, time:t}));
      isVisible=false;
    } else if(!document.hidden){
      startTime=Date.now();
      isVisible=true;
    }
  });

  window.addEventListener("beforeunload", function(){
    if(isVisible){
      var t=Date.now()-startTime;
      navigator.sendBeacon(API_URL+"/balise/"+TAG_ID+"/time", JSON.stringify({page:window.location.pathname, time:t}));
    }
  });
})();
`;

  res.setHeader('Content-Type', 'application/javascript');
  res.send(script);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Important pour supporter navigator.sendBeacon qui envoie parfois du text/plain
app.use(express.text({ type: 'text/plain' }));

app.use(function(req, res, next) {
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

app.get('/', function(req, res) {
  // Redirection ou message d'accueil si pas de fichier index.html
  res.send('Server is running. Access /tag.js?tag=MYTAG to get the script.');
});

app.use(function(req, res) {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(port, '0.0.0.0', function() {
  console.log('Server running on http://localhost:' + port);
});