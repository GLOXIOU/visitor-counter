(function () {
  const params = new URLSearchParams(location.search);
  const TAG = params.get('tag') || '';
  const RANGES = ['24h', '7d', '30d', '90d', '365d', 'all'];
  const RANGE_LABELS = { '24h': 'sur les 24 dernières heures', '7d': 'sur 7 jours', '30d': 'sur 30 jours', '90d': 'sur 90 jours', '365d': 'sur 12 mois', all: 'depuis le début' };
  const KINDS = {
    link: { icon: '🔗', label: 'Lien' },
    outbound: { icon: '↗️', label: 'Lien externe' },
    mail: { icon: '✉️', label: 'E-mail' },
    tel: { icon: '📞', label: 'Téléphone' },
    download: { icon: '⬇️', label: 'Téléchargement' },
    button: { icon: '🔘', label: 'Bouton' },
    click: { icon: '👆', label: 'Clic' },
    form: { icon: '📝', label: 'Formulaire envoyé' },
    media: { icon: '▶️', label: 'Média' },
    copy: { icon: '📋', label: 'Texte copié' },
    print: { icon: '🖨️', label: 'Impression' },
    custom: { icon: '⭐', label: 'Personnalisé' },
    view: { icon: '👁️', label: 'Section vue' }
  };
  const DEVICES = { desktop: 'Ordinateur', mobile: 'Mobile', tablet: 'Tablette', other: 'Autre' };
  const DEVICE_ICONS = { desktop: '🖥️', mobile: '📱', tablet: '📲', other: '❔' };
  const DEVICE_COLORS = { desktop: '#1db954', mobile: '#60a5fa', tablet: '#f59e0b', other: '#9ca3af' };
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  const state = {
    range: RANGES.includes(params.get('range')) ? params.get('range') : '30d',
    page: params.get('page') || '',
    data: null,
    base: location.origin,
    charts: {},
    map: null,
    markers: null,
    mapFitted: false,
    latency: null,
    pingOk: null,
    status: null
  };

  const $ = id => document.getElementById(id);
  const esc = VC.esc;
  const fmt = VC.fmtNumber;

  let langNames = null;
  try { langNames = new Intl.DisplayNames(['fr'], { type: 'language' }); } catch (e) {}

  function langLabel(code) {
    if (!code || code === 'Autres') return code;
    try {
      const name = langNames ? langNames.of(code) : code;
      return name.charAt(0).toUpperCase() + name.slice(1);
    } catch (e) {
      return code.toUpperCase();
    }
  }

  function colors() {
    const light = VC.isLight();
    return {
      text: light ? '#2a2d34' : '#e6eef6',
      grid: light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)',
      primary: '#1db954',
      secondary: light ? '#2563eb' : '#60a5fa',
      card: light ? '#ffffff' : '#141414'
    };
  }

  function syncUrl() {
    const q = new URLSearchParams();
    q.set('tag', TAG);
    if (state.range !== '30d') q.set('range', state.range);
    if (state.page) q.set('page', state.page);
    history.replaceState(null, '', '?' + q.toString());
  }

  function fatal(message) {
    document.querySelector('main').innerHTML = `<div class="card fatal"><h2>${esc(message)}</h2><p><a class="btn primary" href="../index/index.html">← Retour aux balises</a></p></div>`;
  }

  async function load(silent) {
    if (!TAG) return fatal('Aucune balise sélectionnée');
    const q = new URLSearchParams({ range: state.range });
    if (state.page) q.set('page', state.page);
    try {
      state.data = await VC.api(`/api/balise/${encodeURIComponent(TAG)}/stats?${q}`);
      render();
    } catch (e) {
      if (e.message === 'auth') return;
      if (e.status === 404) return fatal('Cette balise n\'existe pas ou a été supprimée');
      if (!silent) VC.toast('Impossible de charger les statistiques : ' + e.message, 'error');
    }
  }

  function delta(cur, prev, invert) {
    if (prev === undefined || prev === null) return '';
    if (!prev) return cur ? '<span class="delta good">nouveau</span>' : '';
    const pct = Math.round(((cur - prev) / prev) * 100);
    if (!pct) return '<span class="delta flat">= stable</span>';
    const good = invert ? pct < 0 : pct > 0;
    return `<span class="delta ${good ? 'good' : 'bad'}" title="Par rapport à la période précédente">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)} %</span>`;
  }

  function renderInfo() {
    const d = state.data;
    $('tagName').textContent = d.name;
    $('tagCode').textContent = d.tagId;
    $('tagCreated').textContent = VC.fmtDate(d.created);
    $('liveCount').textContent = fmt(d.live.visitors);
    document.title = `${d.name} — Visitor Counter`;
    const instrument = `../instrument/instrument.html?tag=${encodeURIComponent(TAG)}`;
    $('instrumentLink').href = instrument;
    $('setupInstrument').href = instrument;
    $('setupBanner').hidden = d.totalViews > 0;
    $('setupSnippet').textContent = VC.snippet(TAG, state.base);
    document.querySelectorAll('#rangeSelector button').forEach(btn => btn.classList.toggle('active', btn.dataset.range === state.range));
    $('pageFilter').hidden = !state.page;
    $('pageFilterLabel').textContent = state.page;
    const q = new URLSearchParams({ range: state.range });
    if (state.page) q.set('page', state.page);
    $('exportCsv').href = `/api/balise/${encodeURIComponent(TAG)}/export.csv?${q}`;
  }

  function renderKpis() {
    const k = state.data.kpis;
    const p = state.data.previous && state.data.previous.views ? state.data.previous : {};
    const cards = [
      ['Visiteurs uniques', fmt(k.visitors), delta(k.visitors, p.visitors), `${k.newRate} % de nouveaux visiteurs`],
      ['Pages vues', fmt(k.views), delta(k.views, p.views), `${String(k.pagesPerVisitor).replace('.', ',')} page(s) par visiteur`],
      ['Durée moyenne', VC.fmtDuration(k.avgDuration), delta(k.avgDuration, p.avgDuration), 'Temps actif passé sur une page'],
      ['Scroll moyen', `${k.avgScroll} %`, delta(k.avgScroll, p.avgScroll), 'Jusqu\'où les visiteurs descendent'],
      ['Taux de rebond', `${k.bounceRate} %`, delta(k.bounceRate, p.bounceRate, true), 'Moins de 10 s et aucune action'],
      ['Actions', fmt(k.actions), delta(k.actions, p.actions), 'Clics, formulaires, médias…']
    ];
    $('kpis').innerHTML = cards.map(([title, value, d, hint]) => `
      <div class="stat-card card">
        <div class="stat-title">${title}</div>
        <div class="stat-value">${value}</div>
        <div class="stat-delta">${d || '&nbsp;'}</div>
        <div class="card-hint">${hint}</div>
      </div>`).join('');
  }

  function fmtKey(key, granularity) {
    if (granularity === 'hour') return key.slice(11) + 'h';
    const parts = key.split('-');
    if (granularity === 'day') return `${parts[2]}/${parts[1]}`;
    return `${MONTHS[Number(parts[1]) - 1]} ${parts[0].slice(2)}`;
  }

  function chart(key, canvas, config) {
    if (!window.Chart) return null;
    const existing = state.charts[key];
    if (existing && existing.config.type === config.type) {
      existing.data = config.data;
      existing.options = config.options;
      existing.update('none');
      return existing;
    }
    if (existing) existing.destroy();
    state.charts[key] = new Chart(canvas.getContext('2d'), config);
    return state.charts[key];
  }

  function destroyCharts() {
    Object.values(state.charts).forEach(c => c.destroy());
    state.charts = {};
  }

  function renderTraffic() {
    const s = state.data.series;
    const c = colors();
    const labels = s.keys.map(k => fmtKey(k, s.granularity));
    $('trafficNote').textContent = RANGE_LABELS[state.range] + (state.page ? ` · ${state.page}` : '');
    chart('traffic', $('trafficChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Pages vues',
            data: s.views,
            borderColor: c.primary,
            backgroundColor: ctx => {
              const area = ctx.chart.chartArea;
              if (!area) return 'rgba(29,185,84,0.2)';
              const g = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
              g.addColorStop(0, 'rgba(29,185,84,0.28)');
              g.addColorStop(1, 'rgba(29,185,84,0.02)');
              return g;
            },
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: labels.length > 40 ? 0 : 3,
            pointHoverRadius: 5
          },
          {
            label: 'Visiteurs uniques',
            data: s.visitors,
            borderColor: c.secondary,
            backgroundColor: c.secondary,
            fill: false,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: labels.length > 40 ? 0 : 3,
            pointHoverRadius: 5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: c.text, usePointStyle: true, boxWidth: 8 } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: c.text, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
          y: { beginAtZero: true, grid: { color: c.grid }, ticks: { color: c.text, precision: 0 } }
        }
      }
    });
  }

  function initMap() {
    if (state.map || !window.L) return;
    state.map = L.map('map', { center: [30, 5], zoom: 2, attributionControl: false, worldCopyJump: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(state.map);
    state.markers = L.layerGroup().addTo(state.map);
    const empty = document.createElement('div');
    empty.className = 'map-empty';
    empty.id = 'mapEmpty';
    empty.textContent = 'Aucune visite géolocalisée sur la période (les visites en local ne le sont pas).';
    document.querySelector('.map-container').appendChild(empty);
  }

  function renderMap() {
    initMap();
    if (!state.map) return;
    const points = state.data.map || [];
    state.markers.clearLayers();
    const max = Math.max(1, ...points.map(p => p.visitors));
    points.forEach(p => {
      const radius = 6 + Math.sqrt(p.visitors / max) * 16;
      L.circleMarker([p.lat, p.lon], { radius, color: '#1db954', weight: 1.5, fillColor: '#1db954', fillOpacity: 0.45 })
        .bindPopup(`<strong>${esc(VC.flag(p.countryCode))} ${esc(p.city || p.country || 'Inconnu')}</strong><br>${esc(p.country || '')}<br>${fmt(p.visitors)} visiteur(s) · ${fmt(p.views)} vue(s)`)
        .addTo(state.markers);
    });
    $('mapEmpty').hidden = points.length > 0;
    if (points.length && !state.mapFitted) {
      state.map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lon])), { maxZoom: 5, padding: [40, 40] });
      state.mapFitted = true;
    }
  }

  function bars(el, items, emptyText) {
    if (!items.length) {
      el.innerHTML = `<li class="empty-small">${esc(emptyText || 'Aucune donnée sur la période')}</li>`;
      return;
    }
    const max = Math.max(1, ...items.map(i => i.value));
    el.innerHTML = items.map(i => {
      const width = Math.max(2, Math.min(100, (i.value / (i.max || max)) * 100));
      return `
        <li class="bar-row"${i.title ? ` title="${esc(i.title)}"` : ''}>
          <div class="bar-fill" style="width:${width}%"></div>
          <div class="bar-text">
            <span class="bar-label">${i.icon ? `<span class="bar-icon">${i.icon}</span>` : ''}${esc(i.label)}</span>
            ${i.sub ? `<span class="bar-sub">${esc(i.sub)}</span>` : ''}
          </div>
          <span class="bar-value">${esc(i.display || fmt(i.value))}</span>
        </li>`;
    }).join('');
  }

  function plural(n, word) {
    return `${fmt(n)} ${word}${n > 1 ? 's' : ''}`;
  }

  function renderPages() {
    const tbody = document.querySelector('#topPagesTable tbody');
    const pages = state.data.pages;
    if (!pages.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-small">Aucune page vue sur la période</td></tr>';
      return;
    }
    tbody.innerHTML = pages.map((p, i) => {
      const heat = p.origin
        ? `<button type="button" class="btn tiny" data-heatmap="${esc(p.page)}" data-origin="${esc(p.origin)}" title="Ouvrir la page avec la heatmap des clics">🔥 ${fmt(p.clicks)}</button>`
        : '<span class="muted-cell" title="Page ouverte en local (fichier) : heatmap indisponible">—</span>';
      return `
        <tr class="clickable${p.page === state.page ? ' active' : ''}" data-page="${esc(p.page)}">
          <td>${i + 1}</td>
          <td class="page-cell"><span class="page-path">${esc(p.page)}</span>${p.title ? `<span class="page-title">${esc(p.title)}</span>` : ''}</td>
          <td>${fmt(p.views)}</td>
          <td>${fmt(p.visitors)}</td>
          <td>${VC.fmtDuration(p.avgDuration)}</td>
          <td>${p.avgScroll} %</td>
          <td>${heat}</td>
        </tr>`;
    }).join('');
  }

  async function openHeatmap(page, origin) {
    const win = window.open('about:blank', '_blank');
    try {
      const { token } = await VC.api(`/api/balise/${encodeURIComponent(TAG)}/heatmap-token`, { method: 'POST' });
      const url = origin + encodeURI(page) + '#vc-heatmap=' + token;
      if (win) win.location.href = url;
      else location.href = url;
    } catch (e) {
      if (win) win.close();
      VC.toast('Heatmap indisponible : ' + e.message, 'error');
    }
  }

  function renderLists() {
    const d = state.data;
    bars($('eventsList'), d.events.slice(0, 15).map(e => {
      const kind = KINDS[e.kind] || KINDS.click;
      const where = !state.page && e.pages === 1 ? ` · ${e.page}` : '';
      return { icon: kind.icon, label: e.label, value: e.count, sub: `${kind.label}${where} · ${plural(e.visitors, 'visiteur')}`, title: `${kind.label} : ${e.label}` };
    }), 'Aucune action enregistrée. Balise ton site pour suivre les clics.');

    bars($('sectionsList'), d.sections.slice(0, 15).map(s => ({
      label: s.label,
      value: s.rate,
      max: 100,
      display: `${s.rate} %`,
      sub: `${plural(s.views, 'vue')}${state.page ? '' : ' · ' + s.page}`
    })), 'Aucune section suivie. Ajoute data-track-view sur tes sections (ou balise ton site).');

    bars($('sourcesList'), d.sources.map(s => ({ label: s.label, value: s.visitors, sub: plural(s.views, 'vue') })));

    bars($('countriesList'), d.countries.map(c => ({ icon: c.other ? '🌐' : VC.flag(c.label), label: c.other ? 'Autres' : c.name || c.label, value: c.visitors, sub: plural(c.views, 'vue') })), 'Aucune visite géolocalisée');

    bars($('browsersList'), d.browsers.map(b => ({ label: b.label, value: b.visitors })));
    bars($('osList'), d.os.map(o => ({ label: o.label, value: o.visitors })));
    bars($('languagesList'), d.languages.map(l => ({ icon: '🗣️', label: l.other ? 'Autres' : langLabel(l.label), value: l.visitors })));
  }

  function renderDevices() {
    const c = colors();
    const devices = state.data.devices;
    chart('devices', $('deviceChart'), {
      type: 'doughnut',
      data: {
        labels: devices.map(x => DEVICES[x.label] || x.label),
        datasets: [{
          data: devices.map(x => x.visitors),
          backgroundColor: devices.map(x => DEVICE_COLORS[x.label] || '#9ca3af'),
          borderColor: c.card,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: { legend: { position: 'right', labels: { color: c.text, usePointStyle: true, boxWidth: 8 } } }
      }
    });
  }

  function renderHours() {
    const c = colors();
    $('hoursNote').textContent = `Heure de ${state.data.timezone.replace('_', ' ')}`;
    chart('hours', $('hoursChart'), {
      type: 'bar',
      data: {
        labels: state.data.hours.map((_, h) => h + 'h'),
        datasets: [{ label: 'Pages vues', data: state.data.hours, backgroundColor: 'rgba(29,185,84,0.7)', borderRadius: 6, maxBarThickness: 28 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: c.text } },
          y: { beginAtZero: true, grid: { color: c.grid }, ticks: { color: c.text, precision: 0 } }
        }
      }
    });
  }

  function shortDate(ts) {
    const date = new Date(ts);
    const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (date.toDateString() === new Date().toDateString()) return time;
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + time;
  }

  function renderRecent() {
    const rows = state.data.recent;
    if (!rows.length) {
      $('recentBody').innerHTML = '<tr><td colspan="8" class="empty-small">Aucune visite sur la période</td></tr>';
      return;
    }
    $('recentBody').innerHTML = rows.map(v => {
      const place = v.city || v.country ? `${VC.flag(v.countryCode)} ${esc(v.city || v.country)}` : '<span class="muted-cell">—</span>';
      const chips = v.events.slice(0, 4).map(e => `<span class="chip" title="${esc((KINDS[e.kind] || KINDS.click).label + ' : ' + e.label)}">${(KINDS[e.kind] || KINDS.click).icon} ${esc(e.label)}</span>`).join('');
      const more = v.events.length > 4 ? `<span class="chip muted">+${v.events.length - 4}</span>` : '';
      return `
        <tr>
          <td title="${esc(VC.fmtDate(v.ts, true))}">${esc(shortDate(v.ts))}${v.isNew ? ' <span class="new-dot" title="Nouveau visiteur"></span>' : ''}</td>
          <td class="page-cell"><span class="page-path">${esc(v.page)}</span></td>
          <td>${esc(v.source || 'Direct')}</td>
          <td>${place}</td>
          <td title="${esc(v.screen || '')}">${DEVICE_ICONS[v.device] || '❔'} ${esc(v.browser)} · ${esc(v.os)}</td>
          <td>${VC.fmtDuration(v.duration)}</td>
          <td>${v.scroll} %</td>
          <td class="chips">${chips}${more || (chips ? '' : '<span class="muted-cell">—</span>')}</td>
        </tr>`;
    }).join('');
  }

  function statusRow(name, level, label, detail) {
    return `
      <div class="service-row">
        <div>
          <div class="service-name">${esc(name)}</div>
          ${detail ? `<div class="service-detail">${esc(detail)}</div>` : ''}
        </div>
        <div class="service-status-label service-${level}">${esc(label)}</div>
      </div>`;
  }

  function renderStatus() {
    const d = state.data;
    const s = state.status;
    const rows = [];
    rows.push(state.pingOk === false
      ? statusRow('Serveur API', 'down', 'Hors ligne', 'Le serveur ne répond pas')
      : statusRow('Serveur API', 'up', 'Opérationnel', s ? `En ligne depuis ${VC.fmtDuration(s.uptime * 1000)}` : ''));
    if (d) {
      if (!d.lastVisit) rows.push(statusRow('Collecte des visites', 'wait', 'En attente', 'Aucune visite reçue pour cette balise'));
      else {
        const fresh = Date.now() - d.lastVisit < 86400000;
        rows.push(statusRow('Collecte des visites', fresh ? 'up' : 'wait', fresh ? 'Opérationnel' : 'Calme', `Dernière visite ${VC.fmtRelative(d.lastVisit)} · ${fmt(d.bots)} visite(s) de robots ignorée(s)`));
      }
    }
    if (s) {
      const g = s.geo;
      if (!g.enabled) rows.push(statusRow('Géolocalisation', 'down', 'Désactivée', 'GEOIP=off dans le fichier .env'));
      else if (!g.lookups) rows.push(statusRow('Géolocalisation', 'wait', 'En attente', 'Aucune adresse publique à localiser pour l\'instant'));
      else if (g.lastError > g.lastSuccess) rows.push(statusRow('Géolocalisation', 'wait', 'Erreurs récentes', `Dernier succès : ${VC.fmtRelative(g.lastSuccess)}`));
      else rows.push(statusRow('Géolocalisation', 'up', 'Opérationnel', `Dernière localisation ${VC.fmtRelative(g.lastSuccess)}`));
      rows.push(s.storage.ok
        ? statusRow('Stockage', 'up', 'Opérationnel', `${(s.storage.size / 1024 / 1024).toFixed(2).replace('.', ',')} Mo de données`)
        : statusRow('Stockage', 'down', 'Erreur', 'Le dossier data n\'est pas accessible en écriture'));
      rows.push(statusRow('Accès au dashboard', s.authRequired ? 'up' : 'wait', s.authRequired ? 'Protégé' : 'Public', s.authRequired ? 'Mot de passe requis' : 'Définis ADMIN_PASSWORD dans .env pour protéger le dashboard'));
    }
    $('servicesList').innerHTML = rows.join('');
  }

  async function loadStatus() {
    try {
      state.status = await VC.api('/api/status');
    } catch (e) {
      state.status = null;
    }
    renderStatus();
  }

  function initLatency() {
    const c = colors();
    const canvas = $('latencyChart');
    const previous = state.latency ? state.latency.data.datasets[0].data.slice() : Array(20).fill(null);
    if (state.latency) state.latency.destroy();
    state.latency = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: previous.map(() => ''),
        datasets: [{ label: 'Ping API (ms)', data: previous, borderColor: c.secondary, tension: 0.25, fill: false, pointRadius: 2, borderWidth: 2, spanGaps: true }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false } },
        scales: { x: { display: false }, y: { beginAtZero: true, grid: { color: c.grid }, ticks: { color: c.text } } }
      }
    });
  }

  async function ping() {
    const start = performance.now();
    let value = null;
    try {
      const res = await fetch('/api/ping', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      value = Math.round(performance.now() - start);
      if (state.pingOk === false) loadStatus();
      state.pingOk = true;
    } catch (e) {
      state.pingOk = false;
      renderStatus();
    }
    if (!state.latency) return;
    const data = state.latency.data.datasets[0].data;
    data.push(value);
    data.shift();
    state.latency.update();
  }

  function render() {
    renderInfo();
    renderKpis();
    renderTraffic();
    renderMap();
    renderPages();
    renderLists();
    renderDevices();
    renderHours();
    renderRecent();
    renderStatus();
  }

  function initControls() {
    document.querySelectorAll('#rangeSelector button').forEach(btn => btn.addEventListener('click', () => {
      if (btn.dataset.range === state.range) return;
      state.range = btn.dataset.range;
      state.mapFitted = false;
      syncUrl();
      load();
    }));

    $('clearFilter').addEventListener('click', () => {
      state.page = '';
      syncUrl();
      load();
    });

    document.querySelector('#topPagesTable tbody').addEventListener('click', e => {
      const heat = e.target.closest('[data-heatmap]');
      if (heat) {
        e.stopPropagation();
        openHeatmap(heat.dataset.heatmap, heat.dataset.origin);
        return;
      }
      const row = e.target.closest('tr[data-page]');
      if (!row) return;
      state.page = state.page === row.dataset.page ? '' : row.dataset.page;
      syncUrl();
      load();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    $('resetStats').addEventListener('click', async () => {
      if (!confirm('Effacer toutes les statistiques de cette balise ? Cette action est irréversible.')) return;
      try {
        await VC.api(`/api/balise/${encodeURIComponent(TAG)}/reset`, { method: 'POST' });
        VC.toast('Statistiques réinitialisées');
        state.mapFitted = false;
        load();
      } catch (e) {
        VC.toast('Erreur lors de la réinitialisation', 'error');
      }
    });

    $('setupSnippet').addEventListener('click', async () => {
      if (await VC.copy($('setupSnippet').textContent)) VC.toast('Snippet copié');
    });
  }

  async function init() {
    const cfg = await VC.config();
    state.base = cfg.publicUrl || location.origin;
    if (window.Chart) {
      Chart.defaults.font.family = '"Inter", system-ui, sans-serif';
      initLatency();
    }
    initControls();
    VC.onTheme(() => {
      destroyCharts();
      if (window.Chart) initLatency();
      if (state.data) render();
    });
    syncUrl();
    await load();
    loadStatus();
    ping();
    setInterval(ping, 10000);
    setInterval(() => {
      if (document.visibilityState === 'visible') load(true);
    }, 30000);
    setInterval(loadStatus, 60000);
  }

  init();
})();
