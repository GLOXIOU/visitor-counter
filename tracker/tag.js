(function () {
  'use strict';
  var w = window, d = document, n = navigator, l = location;
  if (w.__visitorCounter) return;
  w.__visitorCounter = true;

  var script = d.currentScript || d.querySelector('script[src*="/tag.js"]');
  if (!script) return;
  var src;
  try { src = new URL(script.src, l.href); } catch (e) { return; }
  var TAG = script.getAttribute('data-tag') || src.searchParams.get('tag') || '';
  var API = (script.getAttribute('data-api') || src.origin).replace(/\/+$/, '');
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(TAG)) return;
  var ENDPOINT = API + '/api/collect';
  var INTERACTIVE = 'a[href],area[href],button,input[type=submit],input[type=button],input[type=reset],input[type=image],summary,[role=button],[role=link],[role=tab],[role=menuitem],[onclick]';

  function store(key, value) {
    try {
      if (value === undefined) return w.localStorage.getItem(key);
      if (value === null) w.localStorage.removeItem(key);
      else w.localStorage.setItem(key, value);
    } catch (e) {}
    return null;
  }

  function rid(len) {
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789', out = '', i;
    var c = w.crypto || w.msCrypto;
    if (c && c.getRandomValues) {
      var buf = new Uint8Array(len);
      c.getRandomValues(buf);
      for (i = 0; i < len; i++) out += chars[buf[i] % 36];
    } else {
      for (i = 0; i < len; i++) out += chars[Math.floor(Math.random() * 36)];
    }
    return out;
  }

  function onReady(fn) {
    if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function notice(text) {
    var box = d.createElement('div');
    box.textContent = text;
    box.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;background:#111;color:#fff;font:600 14px/1.4 system-ui,sans-serif;padding:12px 18px;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.25);max-width:90vw;text-align:center';
    (d.body || d.documentElement).appendChild(box);
    setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 4500);
  }

  function devClass() {
    var width = w.innerWidth || d.documentElement.clientWidth || 1024;
    return width < 768 ? 'm' : width < 1100 ? 't' : 'd';
  }

  function clean(value, max) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max || 120);
  }

  var heat = /(?:^#|&)vc-heatmap=([A-Za-z0-9._-]+)/.exec(l.hash);
  if (heat) {
    onReady(function () { showHeatmap(heat[1]); });
    return;
  }

  if (l.hash === '#vc-notrack' || l.hash === '#vc-track') {
    var off = l.hash === '#vc-notrack';
    store('vc_off', off ? '1' : null);
    try { history.replaceState(history.state, '', l.pathname + l.search); } catch (e) {}
    onReady(function () {
      notice(off ? 'Tes visites ne sont plus comptées sur cet appareil.' : 'Tes visites sont de nouveau comptées sur cet appareil.');
    });
  }
  if (store('vc_off') === '1') return;

  var flags = [];
  if (n.webdriver) flags.push('wd');
  if (/headless|phantom|puppeteer|playwright|selenium|lighthouse/i.test(n.userAgent)) flags.push('ua');
  if (w._phantom || w.callPhantom || w.__nightmare || w.domAutomation || w.Cypress) flags.push('auto');

  var VID_KEY = 'vc_vid_' + TAG;
  var vid = store(VID_KEY);
  var isNew = !vid;
  if (!vid) {
    vid = rid(16);
    store(VID_KEY, vid);
  }

  var pv = null;
  var visible = d.visibilityState !== 'hidden';
  var lastTick = Date.now();
  var lastAct = Date.now();
  var io = null;

  function newView(referrer) {
    pv = {
      id: rid(16),
      path: l.pathname,
      ref: referrer,
      started: false,
      active: 0,
      maxScroll: 0,
      lastSent: -1,
      events: 0,
      recent: {},
      seen: {},
      clicks: [],
      clickCount: 0
    };
  }

  function send(payload, beacon) {
    payload.tag = TAG;
    payload.id = pv.id;
    var body = JSON.stringify(payload);
    if (beacon && n.sendBeacon) {
      try { if (n.sendBeacon(ENDPOINT, body)) return; } catch (e) {}
    }
    try {
      fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, mode: 'no-cors', credentials: 'omit', headers: { 'Content-Type': 'text/plain' } }).catch(function () {});
    } catch (e) {}
  }

  function scrollPct() {
    var el = d.documentElement, b = d.body;
    var h = Math.max(el.scrollHeight, b ? b.scrollHeight : 0);
    var vh = w.innerHeight || el.clientHeight;
    if (h <= vh + 4) return 100;
    var y = w.pageYOffset || el.scrollTop || 0;
    return Math.max(0, Math.min(100, Math.round((y + vh) / h * 100)));
  }

  function tick() {
    var now = Date.now();
    if (pv.started && visible && now - lastAct < 180000) pv.active += Math.min(now - lastTick, 6000);
    lastTick = now;
    if (pv.started) pv.maxScroll = Math.max(pv.maxScroll, scrollPct());
  }

  function flush(beacon, force) {
    if (!pv || !pv.started) return;
    tick();
    if (!force && pv.active === pv.lastSent && !pv.clicks.length) return;
    pv.lastSent = pv.active;
    var payload = { t: 'p', d: pv.active, s: pv.maxScroll };
    if (pv.clicks.length) {
      payload.c = pv.clicks;
      pv.clicks = [];
    }
    send(payload, beacon);
  }

  function param(params, key) {
    return params ? params.get(key) || undefined : undefined;
  }

  function start() {
    if (pv.started || d.visibilityState === 'hidden' || d.prerendering) return;
    pv.started = true;
    lastTick = Date.now();
    lastAct = Date.now();
    var mq = w.matchMedia ? w.matchMedia('(prefers-color-scheme: dark)') : null;
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    var params = null;
    try { params = new URLSearchParams(l.search); } catch (e) {}
    pv.maxScroll = scrollPct();
    send({
      t: 'v',
      vid: vid,
      n: isNew ? 1 : 0,
      h: l.hostname,
      o: l.origin,
      p: l.pathname,
      ti: d.title,
      r: pv.ref !== undefined ? pv.ref : d.referrer,
      l: n.language || '',
      z: tz,
      sw: w.screen ? w.screen.width : 0,
      sh: w.screen ? w.screen.height : 0,
      tc: n.maxTouchPoints || 0,
      dk: mq ? (mq.matches ? 1 : 0) : undefined,
      s: pv.maxScroll,
      u: {
        s: param(params, 'utm_source') || param(params, 'ref') || param(params, 'src'),
        m: param(params, 'utm_medium'),
        c: param(params, 'utm_campaign')
      },
      b: flags.join(',')
    }, false);
    isNew = false;
    observeSections();
  }

  function track(kind, label, beacon) {
    if (!pv || !pv.started) return;
    label = clean(label, 120);
    if (!label) return;
    var key = kind + '|' + label, now = Date.now();
    if (pv.recent[key] && now - pv.recent[key] < 1500) return;
    pv.recent[key] = now;
    if (++pv.events > 150) return;
    lastAct = now;
    send({ t: 'e', k: kind, l: label }, beacon !== false);
  }

  function hrefOf(el) {
    var href = el.getAttribute('href') || el.getAttribute('xlink:href') || '';
    var abs = typeof el.href === 'string' ? el.href : href;
    try { return { raw: href, url: new URL(abs, l.href) }; } catch (e) { return { raw: href, url: null }; }
  }

  function kindOf(el) {
    var tag = el.tagName.toLowerCase();
    if ((tag === 'a' || tag === 'area') && (el.getAttribute('href') || el.getAttribute('xlink:href'))) {
      var h = hrefOf(el);
      if (/^mailto:/i.test(h.raw)) return 'mail';
      if (/^tel:/i.test(h.raw)) return 'tel';
      if (!h.url) return 'link';
      if (el.hasAttribute('download') || /\.(pdf|zip|rar|7z|gz|docx?|xlsx?|pptx?|odt|ods|csv|txt|mp3|mp4|mov|avi|dmg|exe|msi|apk|iso)$/i.test(h.url.pathname)) return 'download';
      if (/^https?:$/.test(h.url.protocol) && h.url.hostname !== l.hostname) return 'outbound';
      return 'link';
    }
    if (tag === 'button' || tag === 'input' || tag === 'summary' || el.getAttribute('role') === 'button') return 'button';
    return 'click';
  }

  function autoLabel(el, kind) {
    var h;
    if (kind === 'mail' || kind === 'tel') {
      h = hrefOf(el).raw.replace(/^(mailto|tel):/i, '').split('?')[0];
      try { h = decodeURIComponent(h); } catch (e) {}
      return h;
    }
    if (kind === 'download') {
      h = hrefOf(el).url;
      if (h) return decodeURIComponent(h.pathname.split('/').pop() || h.hostname);
    }
    if (kind === 'outbound') {
      h = hrefOf(el).url;
      if (h) return (h.hostname.replace(/^www\./, '') + h.pathname).replace(/\/$/, '');
    }
    var t = el.getAttribute('aria-label') || el.getAttribute('title') || '';
    if (!t) t = clean(el.innerText || el.textContent, 80);
    if (!t && el.tagName === 'INPUT') t = el.value || el.getAttribute('alt') || '';
    if (!t && el.querySelector) {
      var img = el.querySelector('img[alt],svg title,[aria-label]');
      if (img) t = img.getAttribute('alt') || img.getAttribute('aria-label') || img.textContent || '';
    }
    if (!t && el.id) t = '#' + el.id;
    if (!t) t = el.getAttribute('href') || '';
    return clean(t, 80);
  }

  function heatClick(e) {
    if (!pv.started || pv.clickCount >= 300 || e.detail === 0) return;
    var x = e.pageX, y = e.pageY;
    if (typeof x !== 'number' || typeof y !== 'number') return;
    var width = d.documentElement.clientWidth || w.innerWidth || 1;
    pv.clickCount++;
    pv.clicks.push([Math.max(0, Math.min(1, Math.round(x / width * 1000) / 1000)), Math.max(0, Math.round(y)), devClass()]);
    if (pv.clicks.length >= 25) flush(false, true);
  }

  function observeSections() {
    if (!w.IntersectionObserver) return;
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          var en = entries[i];
          if (!en.isIntersecting || !pv.started) continue;
          var vh = w.innerHeight || 1;
          if (en.intersectionRatio < 0.4 && en.intersectionRect.height < vh * 0.4) continue;
          var label = clean(en.target.getAttribute('data-track-view'), 120);
          if (!label || pv.seen[label]) continue;
          pv.seen[label] = 1;
          track('view', label, false);
        }
      }, { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] });
    }
    var list = d.querySelectorAll('[data-track-view]');
    for (var j = 0; j < list.length; j++) {
      io.unobserve(list[j]);
      io.observe(list[j]);
    }
  }

  d.addEventListener('click', function (e) {
    if (e.isTrusted === false) return;
    heatClick(e);
    var t = e.target;
    if (t && t.nodeType !== 1) t = t.parentElement;
    if (!t || !t.closest || t.closest('[data-no-track]')) return;
    var el = t.closest('[data-track],' + INTERACTIVE);
    if (!el) return;
    var kind = kindOf(el);
    track(kind, el.getAttribute('data-track') || autoLabel(el, kind));
  }, true);

  d.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f || f.tagName !== 'FORM' || f.closest('[data-no-track]')) return;
    var heading = f.querySelector('h1,h2,h3,h4,legend');
    track('form', f.getAttribute('data-track-form') || f.getAttribute('aria-label') || f.getAttribute('name') || f.id || (heading && heading.textContent) || 'Formulaire');
  }, true);

  function mediaLabel(m) {
    var file = '';
    try { file = decodeURIComponent((m.currentSrc || m.src || '').split('?')[0].split('/').pop()); } catch (e) {}
    return m.getAttribute('data-track-media') || m.getAttribute('title') || m.getAttribute('aria-label') || file || (m.tagName === 'VIDEO' ? 'Vidéo' : 'Audio');
  }

  d.addEventListener('play', function (e) {
    var m = e.target;
    if (!m || !/^(VIDEO|AUDIO)$/.test(m.tagName) || m.closest('[data-no-track]')) return;
    var label = mediaLabel(m);
    if (pv.seen['play|' + label]) return;
    pv.seen['play|' + label] = 1;
    track('media', label + ' · lecture');
  }, true);

  d.addEventListener('ended', function (e) {
    var m = e.target;
    if (!m || !/^(VIDEO|AUDIO)$/.test(m.tagName) || m.closest('[data-no-track]')) return;
    var label = mediaLabel(m);
    if (pv.seen['end|' + label]) return;
    pv.seen['end|' + label] = 1;
    track('media', label + ' · terminée');
  }, true);

  d.addEventListener('copy', function () {
    var a = d.activeElement;
    if (a && (/^(INPUT|TEXTAREA)$/.test(a.tagName) || a.isContentEditable)) return;
    var sel = clean(w.getSelection ? w.getSelection() : '', 80);
    if (sel) track('copy', sel);
  });

  w.addEventListener('beforeprint', function () { track('print', d.title || l.pathname); });

  function interact(e) {
    if (e && e.isTrusted === false) return;
    lastAct = Date.now();
  }
  ['scroll', 'keydown', 'pointerdown', 'pointermove', 'touchstart', 'wheel'].forEach(function (type) {
    w.addEventListener(type, interact, { passive: true, capture: true });
  });

  d.addEventListener('visibilitychange', function () {
    tick();
    visible = d.visibilityState !== 'hidden';
    lastTick = Date.now();
    if (visible) {
      lastAct = Date.now();
      start();
    } else {
      flush(true);
    }
  });
  w.addEventListener('pagehide', function () { flush(true); });
  w.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    newView(d.referrer);
    start();
  });
  w.addEventListener('load', function () { if (pv.started) observeSections(); });
  if (d.prerendering) d.addEventListener('prerenderingchange', start, { once: true });

  function onRoute() {
    if (l.pathname === pv.path) return;
    var previous = l.origin + pv.path;
    flush(true, true);
    newView(previous);
    start();
  }
  if (w.history && history.pushState) {
    var push = history.pushState;
    history.pushState = function () {
      var r = push.apply(this, arguments);
      setTimeout(onRoute, 0);
      return r;
    };
    w.addEventListener('popstate', function () { setTimeout(onRoute, 0); });
  }

  setInterval(tick, 5000);
  setInterval(function () { if (visible) flush(false, true); }, 15000);

  w.VisitorCounter = {
    track: function (label, kind) {
      track(kind && /^(click|button|link|form|media|custom)$/.test(kind) ? kind : 'custom', label);
    }
  };

  newView(undefined);
  onReady(start);

  function showHeatmap(token) {
    var url = API + '/api/heatmap/' + encodeURIComponent(TAG) + '?path=' + encodeURIComponent(l.pathname) + '&token=' + encodeURIComponent(token);
    fetch(url, { credentials: 'omit' })
      .then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(function (data) { renderHeatmap(data.clicks || []); })
      .catch(function () { notice('Heatmap indisponible : le lien a expiré ou la balise est inconnue.'); });
  }

  function makeStamp(r) {
    var c = d.createElement('canvas');
    c.width = c.height = r * 2;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, r * 2, r * 2);
    return c;
  }

  function makePalette() {
    var c = d.createElement('canvas');
    c.width = 256;
    c.height = 1;
    var g = c.getContext('2d');
    var grad = g.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, 'rgb(0,0,255)');
    grad.addColorStop(0.35, 'rgb(0,255,255)');
    grad.addColorStop(0.55, 'rgb(0,255,0)');
    grad.addColorStop(0.75, 'rgb(255,255,0)');
    grad.addColorStop(1, 'rgb(255,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 1);
    return g.getImageData(0, 0, 256, 1).data;
  }

  function renderHeatmap(points) {
    var counts = { all: points.length, d: 0, t: 0, m: 0 };
    for (var i = 0; i < points.length; i++) if (counts[points[i][2]] !== undefined) counts[points[i][2]]++;
    var filter = counts[devClass()] ? devClass() : 'all';
    var palette = makePalette();

    var layer = d.createElement('div');
    layer.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:2147483646;';
    var canvas = d.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%;';
    layer.appendChild(canvas);
    d.documentElement.appendChild(layer);

    var panel = d.createElement('div');
    panel.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;background:#111;color:#f5f6fa;font:500 13px/1.4 system-ui,sans-serif;padding:14px 16px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.1);max-width:min(340px,calc(100vw - 32px));';
    var title = d.createElement('div');
    title.style.cssText = 'font-weight:700;font-size:14px;color:#1db954;margin-bottom:4px;';
    title.textContent = 'Heatmap des clics';
    var info = d.createElement('div');
    info.style.cssText = 'opacity:.8;margin-bottom:10px;word-break:break-all;';
    var row = d.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
    panel.appendChild(title);
    panel.appendChild(info);
    panel.appendChild(row);
    d.documentElement.appendChild(panel);

    var buttons = {};
    [['all', 'Tous'], ['d', 'Ordinateur'], ['t', 'Tablette'], ['m', 'Mobile']].forEach(function (opt) {
      var b = d.createElement('button');
      b.type = 'button';
      b.textContent = opt[1] + ' (' + counts[opt[0]] + ')';
      b.style.cssText = 'cursor:pointer;border-radius:999px;padding:6px 10px;font:600 12px system-ui,sans-serif;border:1px solid rgba(255,255,255,.15);background:transparent;color:inherit;';
      b.addEventListener('click', function () {
        filter = opt[0];
        draw();
      });
      buttons[opt[0]] = b;
      row.appendChild(b);
    });
    var close = d.createElement('button');
    close.type = 'button';
    close.textContent = 'Fermer';
    close.style.cssText = 'cursor:pointer;border-radius:999px;padding:6px 10px;font:600 12px system-ui,sans-serif;border:none;background:#ef4444;color:#fff;';
    close.addEventListener('click', function () {
      layer.parentNode.removeChild(layer);
      panel.parentNode.removeChild(panel);
      w.removeEventListener('resize', schedule);
      try { history.replaceState(history.state, '', l.pathname + l.search); } catch (e) {}
    });
    row.appendChild(close);

    function draw() {
      var el = d.documentElement, b = d.body;
      var W = el.clientWidth || w.innerWidth;
      var H = Math.max(el.scrollHeight, b ? b.scrollHeight : 0, w.innerHeight);
      layer.style.width = W + 'px';
      layer.style.height = H + 'px';
      var scale = Math.min(1, 16000 / H, Math.sqrt(8000000 / (W * H)));
      canvas.width = Math.max(1, Math.round(W * scale));
      canvas.height = Math.max(1, Math.round(H * scale));
      var ctx = canvas.getContext('2d');
      var r = Math.max(6, Math.round(26 * scale));
      var stamp = makeStamp(r);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 0.2;
      var shown = 0;
      for (var i = 0; i < points.length; i++) {
        var p = points[i];
        if (filter !== 'all' && p[2] !== filter) continue;
        shown++;
        ctx.drawImage(stamp, p[0] * W * scale - r, p[1] * scale - r);
      }
      ctx.globalAlpha = 1;
      if (shown) {
        var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var px = img.data, max = 0, k;
        for (k = 3; k < px.length; k += 4) if (px[k] > max) max = px[k];
        for (k = 0; k < px.length; k += 4) {
          var a = px[k + 3];
          if (!a) continue;
          var v = Math.min(255, Math.round(a * 255 / max));
          px[k] = palette[v * 4];
          px[k + 1] = palette[v * 4 + 1];
          px[k + 2] = palette[v * 4 + 2];
          px[k + 3] = v < 6 ? 0 : Math.min(230, 70 + v * 0.65);
        }
        ctx.putImageData(img, 0, 0);
      }
      info.textContent = l.pathname + ' · ' + shown + ' clic' + (shown > 1 ? 's' : '') + (points.length ? '' : ' — aucun clic enregistré pour cette page');
      for (var key in buttons) {
        buttons[key].style.background = key === filter ? '#1db954' : 'transparent';
        buttons[key].style.color = key === filter ? '#042014' : 'inherit';
      }
    }

    var timer = null;
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(draw, 200);
    }
    w.addEventListener('resize', schedule);
    w.addEventListener('load', schedule);
    draw();
  }
})();
