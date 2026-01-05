(function(){
  const THEME_KEY = 'visiter:theme';
  let apiData = null;
  let currentPeriod = 'today';

  function applyTheme(theme){ 
    if(theme === 'light') document.body.classList.add('light-theme'); 
    else document.body.classList.remove('light-theme'); 
  }

  function toggleTheme(){ 
    const current = localStorage.getItem(THEME_KEY) || 'dark'; 
    const next = current === 'dark' ? 'light' : 'dark'; 
    localStorage.setItem(THEME_KEY, next); 
    applyTheme(next); 
    if(latencyChart) initLatencyChart();
    if(deviceChart || langChart) renderBreakdownCharts();
    if(modalChart) openModal(openInfo.type, openInfo.period);
  }

  function initTheme(){ 
    const btn = document.getElementById('theme-btn'); 
    const saved = localStorage.getItem(THEME_KEY) || 'dark'; 
    applyTheme(saved); 
    if(btn) btn.addEventListener('click', toggleTheme);
  }

  function formatNumber(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

  function getTagFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('tag') || '';
  }

  async function fetchStats() {
    const tag = getTagFromUrl();
    if (!tag) return null;
    try {
      const res = await fetch(`/api/balise/${tag}/stats`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async function resetStats() {
    const tag = getTagFromUrl();
    if(!tag || !confirm("Êtes-vous sûr de vouloir tout effacer ? Cette action est irréversible.")) return;
    try {
      await fetch(`/api/balise/${tag}/reset`, { method: 'POST' });
      window.location.reload();
    } catch(e) {
      alert("Erreur lors de la réinitialisation");
    }
  }

  function initPeriodSelector(){
    const periodButton = document.getElementById('periodButton');
    const periodList = document.getElementById('periodList');
    if(!periodButton || !periodList) return;
    const items = Array.from(periodList.querySelectorAll('li'));
    
    function closeList(){ periodList.hidden = true; periodButton.setAttribute('aria-expanded', 'false'); }
    function openList(){ periodList.hidden = false; periodButton.setAttribute('aria-expanded', 'true'); }
    
    periodButton.addEventListener('click', (e) => { e.stopPropagation(); const isOpen = !periodList.hidden; if(isOpen) closeList(); else openList(); });
    periodList.addEventListener('click', (e) => { e.stopPropagation(); });
    document.addEventListener('click', (e) => { if(periodList.hidden) return; if(!periodButton.contains(e.target) && !periodList.contains(e.target)) closeList(); });
    
    items.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        items.forEach(i => i.removeAttribute('aria-current'));
        item.setAttribute('aria-current', 'true');
        const key = item.getAttribute('data-period') || 'today';
        currentPeriod = key;
        const label = item.textContent.trim();
        periodButton.textContent = label + ' ▾';
        updateStatsForPeriod(key);
        refreshOpenChartPeriod(key);
        closeList();
      });
    });
  }

  function updateStatsForPeriod(periodKey){
    if (!apiData) return;
    const viewsEl = document.getElementById('views-count');
    const uniqueEl = document.getElementById('unique-visitors');
    const totalEl = document.getElementById('total-views');
    
    let views = 0;
    let visitors = 0;

    if (periodKey === 'today') {
      views = apiData.stats.today.views;
      visitors = apiData.stats.today.visitors;
    }
    else if (periodKey === 'month') {
      views = apiData.stats.month.views;
      visitors = apiData.stats.month.visitors;
    }
    else if (periodKey === 'year') {
      views = apiData.stats.year.views;
      visitors = apiData.stats.year.visitors;
    }
    
    if(viewsEl) viewsEl.textContent = formatNumber(views);
    if(uniqueEl) uniqueEl.textContent = formatNumber(visitors);
    if(totalEl) totalEl.textContent = formatNumber(apiData.stats.total);
  }

  let modalChart = null;
  let openInfo = { type: null, period: null };
  const periodOrder = ['today','month','year'];

  function generateLabelsAndData(type, period){
    if (!apiData) return { labels: [], data: [], label: 'Données' };
    
    if(type === 'visitors'){
      if(period === 'today'){
        const labels = Array.from({length:24}, (_,i)=> (i<10?'0':'')+i+'h');
        return { labels, data: apiData.charts.hourly, label: 'Vues (heures)' };
      } else if(period === 'month'){
        const labels = Array.from({length:30}, (_,i)=> 'J-'+(29-i));
        return { labels, data: apiData.charts.daily, label: 'Vues (jours)' };
      } else {
        const labels = ['Jan','Fév','Mar','Avr','Mai','Jui','Jui','Aoû','Sep','Oct','Nov','Déc'];
        return { labels, data: apiData.charts.monthly, label: 'Vues (mois)' };
      }
    }
    return { labels: [], data: [], label: 'Données' };
  }

  function createGradient(ctx, area, start, end){
    const g = ctx.createLinearGradient(0, area.top, 0, area.bottom);
    g.addColorStop(0, start);
    g.addColorStop(1, end);
    return g;
  }

  function openModal(type, period){
    const modal = document.getElementById('chartModal');
    const title = document.getElementById('chartTitle');
    const canvas = document.getElementById('chartCanvas');
    modal.hidden = false;
    title.textContent = type === 'visitors' ? 'Vues — ' + (period==='today'?'Aujourd\'hui': period==='month'?'Ce mois-ci' : 'Cette année') : 'Graphique';
    const ctx = canvas.getContext('2d');
    const res = generateLabelsAndData(type, period);
    if(modalChart) modalChart.destroy();
    const isLight = document.body.classList.contains('light-theme');
    const lineColor = isLight ? '#357a3a' : '#60a5fa';
    const fillStart = isLight ? 'rgba(53,122,58,0.28)' : 'rgba(96,165,250,0.28)';
    const fillEnd = isLight ? 'rgba(53,122,58,0.08)' : 'rgba(96,165,250,0.08)';
    modalChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: res.labels,
        datasets: [{
          label: res.label,
          data: res.data,
          borderColor: lineColor,
          backgroundColor: function(context){
            const chartArea = context.chart.chartArea;
            if(!chartArea) return fillStart;
            return createGradient(context.chart.ctx, chartArea, fillStart, fillEnd);
          },
          tension: 0.3,
          fill: true,
          pointRadius: 3,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true } },
        scales: {
          x: { grid: { display: false }, ticks: { color: isLight ? '#222' : '#e6eef6' } },
          y: { grid: { color: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)' }, ticks: { color: isLight ? '#222' : '#e6eef6' } }
        }
      }
    });
    openInfo.type = type;
    openInfo.period = period;
  }

  function closeModal(){
    const modal = document.getElementById('chartModal');
    modal.hidden = true;
    if(modalChart) modalChart.destroy();
    modalChart = null;
  }

  function refreshOpenChartPeriod(period){
    if(!openInfo.type) return;
    openModal(openInfo.type, period);
  }

  function initChartModalInteractions(){
    const cards = Array.from(document.querySelectorAll('.card[data-chart="visitors"]'));
    cards.forEach(card => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', (e) => {
        if(e.target.closest('.period-wrapper')) return;
        const selected = document.querySelector('#periodList li[aria-current="true"]');
        const period = selected ? selected.getAttribute('data-period') : 'today';
        openModal('visitors', period);
      });
    });
    const backdrop = document.getElementById('chartBackdrop');
    const closeBtn = document.getElementById('chartClose');
    if(backdrop) backdrop.addEventListener('click', closeModal);
    if(closeBtn) closeBtn.addEventListener('click', closeModal);
  }

  let latencyChart = null;
  function initLatencyChart(){
    const canvas = document.getElementById('latencyChart');
    if(!canvas) return;
    if(latencyChart) latencyChart.destroy();
    const ctx = canvas.getContext('2d');
    const isLight = document.body.classList.contains('light-theme');
    const lineColor = isLight ? '#2f9b4a' : '#60a5fa';

    const initialLabels = Array(10).fill('');
    const initialData = Array(10).fill(0);

    latencyChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: initialLabels,
        datasets: [{
          label: 'Ping API (ms)',
          data: initialData,
          borderColor: lineColor,
          tension: 0.25,
          fill: false,
          pointRadius: 2,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { display: false },
          y: { beginAtZero: true, ticks: { color: isLight ? '#222' : '#e6eef6' } }
        }
      }
    });

    setInterval(async () => {
      if(!latencyChart) return;
      const start = performance.now();
      try {
        await fetch(`/api/balise/${getTagFromUrl()}/stats`);
        const val = Math.round(performance.now() - start);
        latencyChart.data.datasets[0].data.push(val);
        latencyChart.data.datasets[0].data.shift();
        latencyChart.update();
      } catch {}
    }, 10000);
  }

  function renderTopPages(){
    const tbody = document.querySelector('#topPagesTable tbody');
    if(!tbody || !apiData) return;
    tbody.innerHTML = '';
    apiData.topPages.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${row.rank}</td><td>${row.url}</td><td>${formatNumber(row.views)}</td><td>${formatNumber(row.uniques)}</td><td>${row.avgTime}</td>`;
      tbody.appendChild(tr);
    });
  }

  let deviceChart = null;
  let langChart = null;

  function renderBreakdownCharts(){
    if (!apiData) return;
    const dCtx = document.getElementById('deviceChart') && document.getElementById('deviceChart').getContext('2d');
    const lCtx = document.getElementById('langChart') && document.getElementById('langChart').getContext('2d');
    
    const deviceColors = ['#1db954','#60a5fa','#f59e0b'];
    const langColors = ['#60a5fa','#34d399','#a78bfa','#f59e0b','#9ca3af'];
    
    if(dCtx){
      if(deviceChart) deviceChart.destroy();
      const isLight = document.body.classList.contains('light-theme');
      deviceChart = new Chart(dCtx, {
        type: 'doughnut',
        data: {
          labels: ['Mobile','Bureau','Tablette'],
          datasets: [{ data: [apiData.devices.mobile, apiData.devices.desktop, apiData.devices.tablet], backgroundColor: deviceColors, borderWidth: 0 }]
        },
        options: { maintainAspectRatio: false, responsive: true, cutout: '65%', plugins: { legend: { display: true, position: 'bottom' } } }
      });
    }

    if(lCtx){
      if(langChart) langChart.destroy();
      const langs = apiData.languages || [];
      const labels = langs.map(l => l.code);
      const data = langs.map(l => l.count);
      
      langChart = new Chart(lCtx, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{ data: data, backgroundColor: langColors, borderWidth: 0 }]
        },
        options: { maintainAspectRatio: false, responsive: true, cutout: '65%', plugins: { legend: { display: true, position: 'bottom' } } }
      });
    }
  }

  let mapInstance = null;
  function initMap(){
    const mapEl = document.getElementById('map');
    if(!mapEl) return;
    mapInstance = L.map('map', {center:[20,0], zoom: 2, attributionControl:false});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(mapInstance);
  }

  function initLiveFeed(){
    const liveList = document.getElementById('liveList');
    if(!liveList || !apiData) return;
    
    function renderLiveList(){
      liveList.innerHTML = '';
      apiData.topPages.slice(0, 5).forEach(page => {
        const li = document.createElement('li');
        li.className = 'live-item';
        li.innerHTML = '<span class="dot" aria-hidden="true"></span><div class="meta"><strong>'+page.url+'</strong> • <span class="time">'+formatNumber(page.views)+' vues</span></div>';
        liveList.appendChild(li);
      });
    }
    renderLiveList();
    setInterval(async () => {
      const newData = await fetchStats();
      if (newData) {
        apiData = newData;
        renderLiveList();
        updateStatsForPeriod(currentPeriod);
        renderTopPages();
      }
    }, 15000);
  }

  function renderServicesStatus(){
    const tag = getTagFromUrl();
    const services = [
      { name: 'Serveur API', ok: true },
      { name: 'Base de données', ok: true },
      { name: 'Tracking (' + (tag || 'N/A') + ')', ok: !!apiData }
    ];
    const el = document.getElementById('servicesList');
    if(!el) return;
    el.innerHTML = '';
    services.forEach(s=>{
      const row = document.createElement('div');
      row.className = 'service-row';
      row.innerHTML = `<div class="service-name">${s.name}</div><div class="service-status-label ${s.ok?'service-up':'service-down'}">${s.ok?'Opérationnel':'Hors ligne'}</div>`;
      el.appendChild(row);
    });
  }

  async function initDashboardPage(){
    const params = new URLSearchParams(window.location.search);
    const tag = params.get('tag');
    const name = params.get('name');
    
    document.getElementById('tagName').textContent = name || tag || 'Inconnu';
    document.getElementById('tagParam').textContent = tag || '-';

    apiData = await fetchStats();
    
    initPeriodSelector();
    initChartModalInteractions();
    initLatencyChart();
    initMap();
    renderTopPages();
    renderBreakdownCharts();
    initLiveFeed();
    renderServicesStatus();
    updateStatsForPeriod('today');

    const resetBtn = document.getElementById('resetStats');
    if(resetBtn) resetBtn.addEventListener('click', resetStats);
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    initTheme();
    if(document.getElementById('map')) initDashboardPage();
  });
})();