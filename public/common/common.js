(function () {
  const THEME_KEY = 'visiter:theme';
  const listeners = [];
  let configPromise = null;

  function readTheme() {
    try {
      return localStorage.getItem(THEME_KEY) || 'dark';
    } catch (e) {
      return 'dark';
    }
  }

  function applyTheme(theme) {
    document.body.classList.toggle('light-theme', theme === 'light');
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      btn.setAttribute('aria-label', theme === 'light' ? 'Passer en thème sombre' : 'Passer en thème clair');
      const icon = btn.querySelector('[data-theme-icon]');
      if (icon && icon.tagName !== 'IMG') icon.textContent = theme === 'light' ? '☀️' : '🌙';
    });
    listeners.forEach(fn => fn(theme));
  }

  function toggleTheme() {
    const next = readTheme() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    applyTheme(next);
  }

  function initTheme() {
    applyTheme(readTheme());
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => btn.addEventListener('click', toggleTheme));
  }

  function onTheme(fn) {
    listeners.push(fn);
  }

  function isLight() {
    return document.body.classList.contains('light-theme');
  }

  function loginUrl() {
    return '/login/login.html?next=' + encodeURIComponent(location.pathname + location.search);
  }

  async function api(url, options) {
    const opts = Object.assign({ credentials: 'same-origin' }, options || {});
    if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
    if (opts.body) opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const res = await fetch(url, opts);
    if (res.status === 401) {
      location.href = loginUrl();
      throw new Error('auth');
    }
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json().catch(() => null) : await res.text();
    if (!res.ok) {
      const err = new Error((data && data.error) || 'Erreur ' + res.status);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function config() {
    if (!configPromise) {
      configPromise = fetch('/api/config', { credentials: 'same-origin' })
        .then(r => r.json())
        .catch(() => ({ authRequired: false, authenticated: true, publicUrl: location.origin }));
    }
    return configPromise;
  }

  async function initLogout() {
    const cfg = await config();
    document.querySelectorAll('[data-logout]').forEach(btn => {
      btn.hidden = !cfg.authRequired;
      btn.addEventListener('click', async () => {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
        location.href = '/login/login.html';
      });
    });
  }

  function snippet(code, base) {
    return `<script defer src="${base}/tag.js?tag=${code}"><\/script>`;
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function fmtNumber(n) {
    return Number(n || 0).toLocaleString('fr-FR');
  }

  function fmtDuration(ms) {
    const s = Math.round((ms || 0) / 1000);
    if (s < 60) return s + ' s';
    const m = Math.floor(s / 60);
    if (m < 60) return m + ' min ' + String(s % 60).padStart(2, '0');
    return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0');
  }

  function fmtRelative(ts) {
    if (!ts) return 'jamais';
    const diff = Math.max(0, Date.now() - ts);
    const s = Math.round(diff / 1000);
    if (s < 45) return "à l'instant";
    const m = Math.round(s / 60);
    if (m < 60) return 'il y a ' + m + ' min';
    const h = Math.round(m / 60);
    if (h < 24) return 'il y a ' + h + ' h';
    const d = Math.round(h / 24);
    if (d < 31) return 'il y a ' + d + ' j';
    return 'le ' + new Date(ts).toLocaleDateString('fr-FR');
  }

  function fmtDate(ts, withTime) {
    if (!ts) return '—';
    const d = new Date(ts);
    return withTime
      ? d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  function flag(cc) {
    if (!cc || !/^[A-Z]{2}$/i.test(cc)) return '🌐';
    return String.fromCodePoint(...cc.toUpperCase().split('').map(c => 127397 + c.charCodeAt(0)));
  }

  let toastBox = null;
  function toast(message, type) {
    if (!toastBox) {
      toastBox = document.createElement('div');
      toastBox.className = 'toast-stack';
      document.body.appendChild(toastBox);
    }
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' toast-' + type : '');
    el.textContent = message;
    toastBox.appendChild(el);
    setTimeout(() => el.classList.add('leaving'), 2800);
    setTimeout(() => el.remove(), 3200);
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) {}
      area.remove();
      return ok;
    }
  }

  function genCode(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const array = new Uint32Array(length || 10);
    crypto.getRandomValues(array);
    let out = '';
    for (let i = 0; i < array.length; i++) out += chars[array[i] % chars.length];
    return out;
  }

  window.VC = { api, config, initTheme, onTheme, isLight, initLogout, snippet, esc, fmtNumber, fmtDuration, fmtRelative, fmtDate, flag, toast, copy, genCode };

  initTheme();
  initLogout();
})();
