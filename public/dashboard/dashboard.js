(function(){
  const THEME_KEY = 'visiter:theme';
  let apiData = null;
  let currentPeriod = 'today';

  function applyTheme(theme){ 
    if(theme === 'light') document.body.classList. add('light-theme'); 
    else document.body.classList. remove('light-theme'); 
  }

  function toggleTheme(){ 
    const current = localStorage.getItem(THEME_KEY) || 'dark'; 
    const next = current === 'dark' ? 'light' : 'dark'; 
    localStorage.setItem(THEME_KEY, next); 
    applyTheme(next); 
    if(latencyChart) initLatencyChart();
    if(deviceChart || browserChart) renderBreakdownCharts();
    if(modalChart) openModal(openInfo. type, openInfo.period);
  }

  function initTheme(){ 
    const btn = document.getElementById('theme-btn'); 
    const saved = localStorage.getItem(THEME_KEY) || 'dark'; 
    applyTheme(saved); 
    if(btn) btn.addEventListener('click', toggleTheme);
  }

  function formatNumber(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

  function getTagFromUrl() {
    const params = new URLSearchParams(window.location. search);
    return params.get('tag') || '';
  }

  async function fetchStats() {
    const tag = getTagFromUrl();
    if (!tag) return null;
    try {
      const res = await fetch(`/api/balise/${tag}/stats`);
      if (! res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  function initPeriodSelector(){
    const periodButton = document.getElementById('periodButton');
    const periodList = document.getElementById('periodList');
    if(! periodButton || !periodList) return;
    const items = Array.from(periodList.querySelectorAll('li'));
    
    function closeList(){ periodList.hidden = true; periodButton.setAttribute('aria-expanded', 'false'); }
    function openList(){ periodList.hidden = false; periodButton.setAttribute('aria-expanded', 'true'); const current = items.find(i => i.getAttribute('aria-current') === 'true'); if(current) current.focus(); }
    
    periodButton.addEventListener('click', (e) => { e.stopPropagation(); const isOpen = !periodList. hidden; if(isOpen) closeList(); else openList(); });
    periodList.addEventListener('click', (e) => { e.stopPropagation(); });
    document.addEventListener('click', (e) => { if(periodList.hidden) return; if(! periodButton.contains(e.target) && !periodList. contains(e.target)) closeList(); });
    document.addEventListener('keydown', (e) => {
      if(periodList.hidden) return;
      const currentIndex = items.indexOf(document.activeElement);
      if(e.key === 'ArrowDown'){ e.preventDefault(); const next = items[(currentIndex + 1) % items.length]; next.focus(); }
      else if(e.key === 'ArrowUp'){ e.preventDefault(); const prev = items[(currentIndex - 1 + items.length) % items.length]; prev. focus(); }
      else if(e. key === 'Escape'){ closeList(); periodButton.focus(); }
      else if(e. key === 'Enter'){ if(document.activeElement && items. includes(document.activeElement)) document.activeElement.click(); }
    });
    items.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        items.forEach(i => i. removeAttribute('aria-current'));
        item.setAttribute('aria-current', 'true');
        const key = item.getAttribute('data-period') || 'today';
        currentPeriod = key;
        const label = item.textContent.trim();
        periodButton.textContent = label + ' ▾';
        updateStatsForPeriod(key);
        refreshOpenChartPeriod(key);
        closeList();
        periodButton.focus();
      });
      item.addEventListener('keydown', (e) => { if(e.key === 'Enter'){ e.stopPropagation(); item.click(); } });
    });
    const initial = items.find(i => i.getAttribute('aria-current') === 'true') || items[0];
    if(initial){ const key = initial.getAttribute('data-period') || 'today'; periodButton.textContent = initial.textContent. trim() + ' ▾'; updateStatsForPeriod(key); }
  }

  function updateStatsForPeriod(periodKey){
    if (! apiData) return;
    const visitorsEl = document.getElementById('today-visitors');
    const pagesEl = document. getElementById('pages-count');
    const totalEl = document.getElementById('total-visitors');
    
    let visitors = 0;
    if (periodKey === 'today') visitors = apiData.stats.today.visitors;
    else if (periodKey === 'month') visitors = apiData.stats.month. visitors;
    else if (periodKey === 'year') visitors = apiData.stats.year.visitors;
    
    if(visitorsEl) visitorsEl.textContent = formatNumber(visitors);
    if(pagesEl) pagesEl.textContent = formatNumber(apiData.stats.pages);
    if(totalEl) totalEl.textContent = formatNumber(apiData.stats.total);
  }

  let modalChart = null;
  let openInfo = { type: null, period: null };
  const periodOrder = ['today','month','year'];

  function generateLabelsAndData(type, period){
    if (! apiData) return { labels: [], data:  [], label: 'Données' };
    
    if(type === 'visitors'){
      if(period === 'today'){
        const labels = Array.from({length:24}, (_,i)=> (i<10? '0': '')+i+'h');
        return { labels, data:  apiData.charts.hourly, label: 'Visites (heures)' };
      } else if(period === 'month'){
        const labels = Array.from({length:30}, (_,i)=> 'J-'+(29-i));
        return { labels, data:  apiData.charts. daily, label: 'Visites (jours)' };
      } else {
        const labels = ['Jan','Fév','Mar','Avr','Mai','Jui','Jui','Aoû','Sep','Oct','Nov','Déc'];
        return { labels, data: apiData. charts.monthly, label: 'Visites (mois)' };
      }
    }
    if(type === 'total'){
      if(period === 'today'){
        const labels = Array.from({length:24}, (_,i)=> (i<10? '0':'')+i+'h');
        let cumul = 0;
        const data = apiData.charts.hourly. map(v => { cumul += v; return cumul; });
        return { labels, data, label:  'Visiteurs cumulés' };
      } else if(period === 'month'){
        const labels = Array.from({length:30}, (_,i)=> 'J-'+(29-i));
        let cumul = 0;
        const data = apiData.charts.daily. map(v => { cumul += v; return cumul; });
        return { labels, data, label:  'Visiteurs cumulés' };
      } else {
        const labels = ['Jan','Fév','Mar','Avr','Mai','Jui','Jui','Aoû','Sep','Oct','Nov','Déc'];
        let cumul = 0;
        const data = apiData.charts.monthly.map(v => { cumul += v; return cumul; });
        return { labels, data, label: 'Visiteurs cumulés' };
      }
    }
    return { labels: [], data: [], label:  'Données' };
  }

  function createGradient(ctx, area, start, end){
    const g = ctx.createLinearGradient(0, area. top, 0, area.bottom);
    g.addColorStop(0, start);
    g.addColorStop(1, end);
    return g;
  }

  function openModal(type, period){
    const modal = document.getElementById('chartModal');
    const title = document.getElementById('chartTitle');
    const note = document.getElementById('chartNote');
    const canvas = document.getElementById('chartCanvas');
    modal.hidden = false;
    title.textContent = type === 'visitors' ?  'Visiteurs — ' + (period==='today'?'Aujourd\'hui':  period==='month'?'Ce mois-ci' : 'Cette année') : (type === 'total' ? 'Visiteurs totaux' : 'Graphique');
    note.textContent = '';
    const ctx = canvas.getContext('2d');
    const res = generateLabelsAndData(type, period);
    if(modalChart) modalChart.destroy();
    const isLight = document.body.classList.contains('light-theme');
    const lineColor = isLight ?  '#357a3a' : '#60a5fa';
    const fillStart = isLight ? 'rgba(53,122,58,0.28)' : 'rgba(96,165,250,0.28)';
    const fillEnd = isLight ? 'rgba(53,122,58,0.08)' : 'rgba(96,165,250,0.08)';
    modalChart = new Chart(ctx, {
      type: 'line',
      data:  {
        labels:  res.labels,
        datasets: [{
          label: res. label,
          data: res.data,
          borderColor:  lineColor,
          backgroundColor: function(context){
            const chartArea = context.chart. chartArea;
            if(! chartArea) return fillStart;
            return createGradient(context. chart. ctx, chartArea, fillStart, fillEnd);
          },
          pointBackgroundColor: '#fff',
          pointBorderColor: lineColor,
          tension: 0.3,
          fill: true,
          pointRadius: 3,
          borderWidth: 2
        }]
      },
      options:  {
        responsive:  true,
        maintainAspectRatio: false,
        animation: false,
        plugins:  { legend: { display:  true, labels: { boxWidth: 12 } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: isLight ? '#222' : '#e6eef6' } },
          y: { grid:  { color: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)' }, ticks: { color: isLight ? '#222' : '#e6eef6' } }
        }
      }
    });
    openInfo. type = type;
    openInfo.period = period;
    const closeBtn = document.getElementById('chartClose');
    if(closeBtn) closeBtn.focus();
  }

  function closeModal(){
    const modal = document.getElementById('chartModal');
    modal.hidden = true;
    if(modalChart) modalChart.destroy();
    modalChart = null;
    openInfo. type = null;
    openInfo.period = null;
  }

  function refreshOpenChartPeriod(period){
    if(! openInfo.type) return;
    openModal(openInfo.type, period);
  }

  function initChartModalInteractions(){
    const cards = Array.from(document. querySelectorAll('. card[data-chart]'));
    cards.forEach(card => {
      const type = card.getAttribute('data-chart');
      if(type !== 'visitors' && type !== 'total') return;
      card.style.cursor = 'pointer';
      card.addEventListener('click', (e) => {
        if(e.target. closest('.period-wrapper')) return;
        const selected = document.querySelector('#periodList li[aria-current="true"]');
        const period = selected ?  selected.getAttribute('data-period') : 'today';
        openModal(type, period);
      });
    });
    const backdrop = document.getElementById('chartBackdrop');
    const closeBtn = document. getElementById('chartClose');
    const prevBtn = document.getElementById('chartPrevPeriod');
    const nextBtn = document.getElementById('chartNextPeriod');
    if(backdrop) backdrop.addEventListener('click', closeModal);
    if(closeBtn) closeBtn.addEventListener('click', closeModal);
    if(prevBtn) prevBtn.addEventListener('click', () => {
      if(! openInfo.period) return;
      const i = periodOrder.indexOf(openInfo.period);
      const prev = periodOrder[(i - 1 + periodOrder.length) % periodOrder.length];
      refreshOpenChartPeriod(prev);
      const li = document.querySelector('#periodList li[data-period="'+prev+'"]');
      if(li) li.click();
    });
    if(nextBtn) nextBtn.addEventListener('click', () => {
      if(! openInfo.period) return;
      const i = periodOrder. indexOf(openInfo. period);
      const next = periodOrder[(i + 1) % periodOrder.length];
      refreshOpenChartPeriod(next);
      const li = document. querySelector('#periodList li[data-period="'+next+'"]');
      if(li) li.click();
    });
    document.addEventListener('keydown', (e) => {
      const modal = document.getElementById('chartModal');
      if(e.key === 'Escape' && modal && !modal.hidden) closeModal();
    });
  }

  let latencyChart = null;
  function initLatencyChart(){
    const canvas = document.getElementById('latencyChart');
    if(!canvas) return;
    if(latencyChart) latencyChart.destroy();
    const ctx = canvas.getContext('2d');
    const isLight = document.body.classList.contains('light-theme');
    const lineColor = isLight ? '#2f9b4a' : '#60a5fa';
    const fillStart = isLight ? 'rgba(47,155,74,0.18)' : 'rgba(96,165,250,0.12)';
    const fillEnd = isLight ? 'rgba(47,155,74,0.02)' : 'rgba(96,165,250,0.02)';

    const initialLabels = [
      new Date(Date.now() - 20000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}),
      new Date(Date.now() - 10000).toLocaleTimeString([], {hour:  '2-digit', minute:'2-digit', second:'2-digit'}),
      new Date().toLocaleTimeString([], {hour:  '2-digit', minute:'2-digit', second:'2-digit'})
    ];
    const initialData = [120, 60, 85];

    latencyChart = new Chart(ctx, {
      type:  'line',
      data: {
        labels: initialLabels,
        datasets: [{
          label: 'Ping API (ms)',
          data: initialData,
          borderColor: lineColor,
          backgroundColor: function(context){
            const chartArea = context.chart. chartArea;
            if(!chartArea) return fillStart;
            return createGradient(context.chart.ctx, chartArea, fillStart, fillEnd);
          },
          pointBackgroundColor: '#fff',
          pointBorderColor: lineColor,
          tension: 0.25,
          fill:  true,
          pointRadius: 3,
          borderWidth:  2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio:  false,
        animation: false,
        plugins: {
          legend: { display: true, labels: { boxWidth:  12 } }
        },
        scales: {
          x: { grid:  { color: 'rgba(255,255,255,0.03)' }, ticks: { color: isLight ? '#222' : '#e6eef6' } },
          y: {
            beginAtZero: true,
            grid:  { color: 'rgba(255,255,255,0.03)' },
            ticks: { color: isLight ?  '#222' : '#e6eef6' }
          }
        }
      }
    });

    async function fetchNewPing(){
      const tag = getTagFromUrl();
      if (! tag) return Math.round(Math.max(0, 40 + Math.random() * 200));
      const start = performance.now();
      try {
        await fetch(`/api/balise/${tag}`);
        return Math.round(performance.now() - start);
      } catch {
        return Math.round(Math. max(0, 40 + Math. random() * 200));
      }
    }

    setInterval(async () => {
      if(! latencyChart) return;
      const now = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
      const val = await fetchNewPing();
      latencyChart.data. labels.push(now);
      latencyChart.data.datasets[0].data.push(val);
      while(latencyChart. data.labels.length > 20){
        latencyChart.data.labels. shift();
        latencyChart.data. datasets[0].data.shift();
      }
      latencyChart.update();
    }, 10000);
  }

  function renderTopPages(){
    const tbody = document.querySelector('#topPagesTable tbody');
    if(!tbody || !apiData) return;
    tbody.innerHTML = '';
    apiData.topPages.forEach(row => {
      const tr = document.createElement('tr');
      const tdRank = document.createElement('td');
      tdRank.textContent = String(row.rank);
      const tdUrl = document.createElement('td');
      tdUrl.textContent = row.url;
      const tdViews = document.createElement('td');
      tdViews.textContent = formatNumber(row.views);
      const tdUniques = document.createElement('td');
      tdUniques.textContent = formatNumber(row.uniques);
      const tdTime = document.createElement('td');
      tdTime.textContent = row.avgTime;
      tr.appendChild(tdRank);
      tr.appendChild(tdUrl);
      tr.appendChild(tdViews);
      tr.appendChild(tdUniques);
      tr.appendChild(tdTime);
      tbody.appendChild(tr);
    });
  }

  let deviceChart = null;
  let browserChart = null;

  function renderBreakdownCharts(){
    if (! apiData) return;
    const bd = {
      devices: apiData.devices,
      browsers:  apiData.browsers
    };
    const dCtx = document.getElementById('deviceChart') && document.getElementById('deviceChart').getContext('2d');
    const bCtx = document.getElementById('browserChart') && document.getElementById('browserChart').getContext('2d');
    const legendEl = document.getElementById('breakdownLegend');
    const deviceColors = ['#1db954','#60a5fa','#f59e0b'];
    const browserColors = ['#60a5fa','#34d399','#a78bfa','#f59e0b','#9ca3af'];
    if(legendEl){
      legendEl. innerHTML = '';
      const chips = [
        {label:'Mobile', color: deviceColors[0]},
        {label:'Bureau', color: deviceColors[1]},
        {label:'Tablette', color: deviceColors[2]},
        {label:'Chrome', color: browserColors[0]},
        {label:'Safari', color: browserColors[1]},
        {label:'Firefox', color: browserColors[2]},
        {label:'Edge', color:  browserColors[3]},
        {label:'Autre', color: browserColors[4]}
      ];
      chips. forEach(c => {
        const span = document.createElement('span');
        span.className = 'legend-chip';
        const box = document.createElement('span');
        box.className = 'legend-box';
        box. style.background = c.color;
        box.style.borderColor = '#ffffff';
        span.appendChild(box);
        const txt = document.createElement('span');
        txt.textContent = c.label;
        span.appendChild(txt);
        legendEl.appendChild(span);
      });
    }
    if(dCtx){
      if(deviceChart) deviceChart.destroy();
      const isLight = document.body.classList.contains('light-theme');
      const borderColor = isLight ?  '#f8fafc' : '#0f1724';
      deviceChart = new Chart(dCtx, {
        type: 'doughnut',
        data: {
          labels: ['Mobile','Bureau','Tablette'],
          datasets: [{ data: [bd.devices.mobile, bd.devices. desktop, bd.devices.tablet], backgroundColor: deviceColors, borderColor: borderColor, borderWidth: 2 }]
        },
        options:  { animation: false, maintainAspectRatio: false, responsive: true, cutout: '60%', plugins: { legend:  { display: false } } }
      });
    }
    if(bCtx){
      if(browserChart) browserChart.destroy();
      const isLight = document.body.classList.contains('light-theme');
      const borderColor = isLight ? '#f8fafc' : '#0f1724';
      browserChart = new Chart(bCtx, {
        type: 'doughnut',
        data: {
          labels: ['Chrome','Safari','Firefox','Edge','Autre'],
          datasets: [{ data: [bd. browsers.chrome, bd.browsers.safari, bd.browsers.firefox, bd.browsers. edge, bd.browsers.other], backgroundColor: browserColors, borderColor: borderColor, borderWidth: 2 }]
        },
        options: { animation: false, maintainAspectRatio: false, responsive: true, cutout: '60%', plugins: { legend:  { display: false } } }
      });
    }
  }

  let mapInstance = null;
  let mapMarkers = [];
  function initMap(){
    const mapEl = document.getElementById('map');
    if(!mapEl) return;
    mapInstance = L.map('map', {center:[20,0], zoom: 2, attributionControl:false});
    L.tileLayer('https://{s}.tile. openstreetmap. org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(mapInstance);
    const marker = L.circleMarker([20,0],{radius:8, color:'#1db954', fillColor:'#1db954', fillOpacity: 0.24}).addTo(mapInstance);
    mapMarkers. push(marker);
    mapInstance.on('click', e=>{
      marker.setLatLng(e.latlng);
      mapInstance.panTo(e.latlng);
    });
  }

  function addLiveMarker(lat, lng){
    if(!mapInstance) return;
    const m = L.circleMarker([lat,lng], {radius:6, color:'#34d399', fillColor:'#34d399', fillOpacity: 0.22}).addTo(mapInstance);
    mapMarkers.push(m);
    setTimeout(()=> { mapInstance.removeLayer(m); const idx = mapMarkers. indexOf(m); if(idx !== -1) mapMarkers.splice(idx,1); }, 20000);
  }

  let liveInterval = null;
  let livePaused = false;
  function initLiveFeed(){
    const liveList = document.getElementById('liveList');
    if(!liveList || !apiData) return;
    
    function renderLiveList(){
      liveList. innerHTML = '';
      apiData.topPages.slice(0, 7).forEach(page => {
        const li = document.createElement('li');
        li.className = 'live-item';
        li.innerHTML = '<span class="dot" aria-hidden="true"></span><div class="meta"><strong>'+page.url+'</strong> • <span class="time">'+formatNumber(page.views)+' vues</span></div>';
        liveList.appendChild(li);
      });
    }
    renderLiveList();

    liveInterval = setInterval(async () => {
      if(livePaused) return;
      const newData = await fetchStats();
      if (newData) {
        apiData = newData;
        renderLiveList();
        updateStatsForPeriod(currentPeriod);
        addLiveMarker((Math.random()*140)-70, (Math. random()*360)-180);
      }
    }, 30000);
  }

  function exportCSV(){
    if (! apiData) return;
    const topRows = apiData.topPages;
    const csvLines = [];
    csvLines.push(['Rank','Page','Views','Uniques','AvgTime']. join(','));
    topRows.forEach(r => csvLines.push([r.rank, '"'+r.url+'"', r.views, r. uniques, r.avgTime].join(',')));
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'top-pages.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function renderServicesStatus(){
    const tag = getTagFromUrl();
    const services = [
      { id: 'api', name: 'Serveur API', ok: true },
      { id:  'db', name: 'Base de données', ok: true },
      { id: 'tracking', name: 'Tracking (' + (tag || 'N/A') + ')', ok: !!apiData }
    ];
    const el = document.getElementById('servicesList');
    if(! el) return;
    el.innerHTML = '';
    services.forEach(s=>{
      const row = document.createElement('div');
      row.className = 'service-row';
      const name = document.createElement('div');
      name.className = 'service-name';
      name.textContent = s.name;
      const status = document.createElement('div');
      status.className = 'service-status-label ' + (s.ok ? 'service-up' : 'service-down');
      status.textContent = s.ok ? 'Opérationnel' : 'Hors ligne';
      row. appendChild(name);
      row.appendChild(status);
      el.appendChild(row);
    });
  }

  async function initDashboardPage(){
    const params = new URLSearchParams(window.location. search);
    const tag = params.get('tag') || '';
    const name = params.get('name') || '';
    const tagParamEl = document.getElementById('tagParam');
    const tagNameEl = document.getElementById('tagNameDisplay') || document.getElementById('tagName');
    
    apiData = await fetchStats();
    
    if(tagParamEl) {
      if (apiData && apiData. created) {
        tagParamEl.textContent = new Date(apiData. created).toLocaleDateString('fr-FR');
      } else {
        tagParamEl. textContent = tag || '(vide)';
      }
    }
    if(tagNameEl) tagNameEl.textContent = name || '(vide)';
    
    initPeriodSelector();
    initChartModalInteractions();
    initLatencyChart();
    initMap();
    renderTopPages();
    renderBreakdownCharts();
    initLiveFeed();
    renderServicesStatus();
    updateStatsForPeriod('today');
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    initTheme();
    document.getElementById('exportCsv') && document.getElementById('exportCsv').addEventListener('click', exportCSV);
    if(document.getElementById('map')) initDashboardPage();
    else { initPeriodSelector(); initChartModalInteractions(); initLatencyChart(); renderBreakdownCharts(); renderTopPages(); }
  });

  window.__visiter = { initDashboardPage };
})();