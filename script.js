const STORAGE_KEY = 'visiter:tags';
const THEME_KEY = 'visiter:theme';

(function(){
  function loadTags(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return [];
      const parsed = JSON.parse(raw);
      if(Array.isArray(parsed)) return parsed;
      return [];
    }catch(e){
      return [];
    }
  }
  function saveTags(list){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }catch(e){}
  }
  function generateTag(length=10){
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let res = '';
    for(let i=0;i<length;i++){
      res += charset.charAt(Math.floor(Math.random()*charset.length));
    }
    return res;
  }
  function createUniqueTag(attempts=6){
    const tags = loadTags();
    for(let i=0;i<attempts;i++){
      const t = generateTag(10);
      if(!tags.includes(t)){
        tags.unshift(t);
        saveTags(tags);
        return t;
      }
    }
    const fallback = generateTag(12) + Date.now().toString(36);
    const tags2 = loadTags();
    tags2.unshift(fallback);
    saveTags(tags2);
    return fallback;
  }

  const qs = sel => document.querySelector(sel);
  const qsa = sel => Array.from(document.querySelectorAll(sel));
  function escapeHtml(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function getTagListEl(){
    return document.getElementById('tagList') || document.getElementById('tagsList');
  }

  function renderTags(){
    const tagListEl = getTagListEl();
    const emptyStateEl = document.getElementById('emptyState') || document.getElementById('empty');
    if(!tagListEl) return;
    const tags = loadTags();
    tagListEl.innerHTML = '';
    if(tags.length === 0){
      if(emptyStateEl) emptyStateEl.style.display = 'block';
      return;
    } else {
      if(emptyStateEl) emptyStateEl.style.display = 'none';
    }
    tags.forEach(tag=>{
      const li = document.createElement('li');
      li.className = 'tag-item';
      li.setAttribute('role','button');
      li.setAttribute('tabindex','0');
      li.dataset.tag = tag;

      const spanName = document.createElement('div');
      spanName.className = 'tag-name';
      spanName.textContent = tag;

      const spanMeta = document.createElement('div');
      spanMeta.className = 'tag-meta';
      spanMeta.textContent = 'Aller au dashboard →';

      li.appendChild(spanName);
      li.appendChild(spanMeta);

      li.addEventListener('click', ()=>{
        const url = new URL(window.location.href);
        const base = url.origin + (url.pathname.replace(/\/[^/]*$/,'/') || '/');
        const dest = new URL('dashboard.html', base);
        dest.searchParams.set('tag', tag);
        dest.searchParams.set('name', tag);
        window.location.href = dest.toString();
      });
      li.addEventListener('keydown', (e)=>{
        if(e.key === 'Enter' || e.key === ' '){
          e.preventDefault();
          li.click();
        }
      });
      const protoContainer = document.createElement('div');
      protoContainer.style.display = 'flex';
      protoContainer.style.gap = '8px';
      protoContainer.style.alignItems = 'center';
      if(document.getElementById('tagsList')){
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn-copy';
        copyBtn.type = 'button';
        copyBtn.textContent = 'Copier ID';
        copyBtn.addEventListener('click', (e)=>{
          e.stopPropagation();
          copyToClipboard(tag, copyBtn);
        });
        const viewBtn = document.createElement('button');
        viewBtn.className = 'btn-ghost';
        viewBtn.type = 'button';
        viewBtn.textContent = 'Voir';
        viewBtn.dataset.show = tag;
        viewBtn.addEventListener('click', (ev)=>{
          ev.stopPropagation();
          const openBtn = document.getElementById('openModal');
          if(openBtn) openModalForTag(tag);
          else {
            const url = new URL(window.location.href);
            const base = url.origin + (url.pathname.replace(/\/[^/]*$/,'/') || '/');
            const dest = new URL('dashboard.html', base);
            dest.searchParams.set('tag', tag);
            dest.searchParams.set('name', tag);
            window.location.href = dest.toString();
          }
        });
        protoContainer.appendChild(copyBtn);
        protoContainer.appendChild(viewBtn);
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.justifyContent = 'space-between';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '12px';

        const left = document.createElement('div');
        left.appendChild(spanName);
        left.appendChild(spanMeta);
        wrapper.appendChild(left);
        wrapper.appendChild(protoContainer);

        li.innerHTML = ''; // replace default
        li.appendChild(wrapper);
      }

      tagListEl.appendChild(li);
    });
  }

  function highlightTag(tag){
    setTimeout(()=>{
      const items = Array.from(document.querySelectorAll('.tag-item'));
      const first = items.find(it=>it.dataset.tag === tag);
      if(first){
        first.scrollIntoView({behavior:'smooth', block:'center'});
        first.style.boxShadow = '0 12px 30px rgba(29,185,84,0.16)';
        setTimeout(()=> first.style.boxShadow = '', 1100);
      }
    },50);
  }

  const modalEl = document.getElementById('modal');
  const openModalBtn = document.getElementById('openModal');
  const closeModalBtn = document.getElementById('closeModal');
  const backdropEl = document.getElementById('backdrop');
  const cancelBtn = document.getElementById('cancel');
  const createForm = document.getElementById('createForm');
  const tagNameInput = document.getElementById('tagName');
  const resultBox = document.getElementById('result');
  const codeIdEl = document.getElementById('codeId');
  const codeHeadEl = document.getElementById('codeHead');
  const exampleTagEl = document.getElementById('exampleTag');

  function openModal(){
    if(!modalEl) return;
    modalEl.setAttribute('aria-hidden','false');
    if(tagNameInput) tagNameInput.focus();
  }
  function closeModal(){
    if(!modalEl) return;
    modalEl.setAttribute('aria-hidden','true');
    if(createForm) createForm.reset();
    if(resultBox) resultBox.hidden = true;
  }
  function openModalForTag(tag){
    if(!modalEl) return openModal();
    openModal();
    if(tagNameInput) tagNameInput.value = 'balise-' + tag.slice(0,4);
    const headSnippet = `<script async src="https://cdn.visiter.example/widget.js" data-visiter-tag="${escapeHtml(tag)}" data-visiter-name="${escapeHtml(tag)}"></script>`;
    if(codeIdEl) codeIdEl.textContent = tag;
    if(codeHeadEl) codeHeadEl.innerHTML = escapeHtml(headSnippet);
    if(exampleTagEl) exampleTagEl.innerHTML = escapeHtml(`<div class="visiter-tag" data-tag="${escapeHtml(tag)}" data-name="${escapeHtml(tag)}"></div>`);
    if(resultBox) resultBox.hidden = false;
  }

  if(openModalBtn) openModalBtn.addEventListener('click', openModal);
  if(closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if(backdropEl) backdropEl.addEventListener('click', closeModal);
  if(cancelBtn) cancelBtn.addEventListener('click', closeModal);

  if(createForm){
    createForm.addEventListener('submit', function(ev){
      ev.preventDefault();
      const name = (tagNameInput && tagNameInput.value.trim()) || 'untitled';
      const id = createUniqueTag();
      renderTags();
      highlightTag(id);

      if(codeIdEl) codeIdEl.textContent = id;
      const headSnippet = `<script async src="https://cdn.visiter.example/widget.js" data-visiter-tag="${escapeHtml(id)}" data-visiter-name="${escapeHtml(name)}"></script>`;
      if(codeHeadEl) codeHeadEl.innerHTML = escapeHtml(headSnippet);
      const example = `<div class="visiter-tag" data-tag="${escapeHtml(id)}" data-name="${escapeHtml(name)}"></div>`;
      if(exampleTagEl) exampleTagEl.innerHTML = escapeHtml(example);
      if(resultBox) resultBox.hidden = false;
    });
  }

  function copyToClipboard(text, btn){
    if(!text) return;
    navigator.clipboard?.writeText(text).then(()=>{
      if(btn){
        const original = btn.textContent;
        btn.textContent = 'Copié ✓';
        setTimeout(()=> btn.textContent = original, 1400);
      }
    }).catch(()=>{
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); if(btn) btn.textContent = 'Copié ✓'; }
      catch(e){ alert('Impossible de copier automatiquement — sélectionnez et copiez manuellement.'); }
      document.body.removeChild(ta);
      setTimeout(()=> { if(btn) btn.textContent = 'Copier'; }, 1400);
    });
  }

  document.addEventListener('click', function(e){
    const btn = e.target.closest('.btn-copy');
    if(!btn) return;
    const targetSel = btn.getAttribute('data-copytarget');
    if(targetSel){
      const target = document.querySelector(targetSel);
      if(target){
        copyToClipboard(target.textContent || target.innerText || '', btn);
        return;
      }
    }
    if(btn.dataset && btn.dataset.tag){
      copyToClipboard(btn.dataset.tag, btn);
      return;
    }
    if(btn.textContent){
      copyToClipboard(btn.textContent, btn);
    }
  });

  function initDashboardPage(){
    const params = new URLSearchParams(window.location.search);
    const tag = params.get('tag') || '';
    const name = params.get('name') || '';
    const tagParamEl = document.getElementById('tagParam');
    const tagNameEl = document.getElementById('tagNameDisplay') || document.getElementById('tagName');
    if(tagParamEl) tagParamEl.textContent = tag || '(vide)';
    if(tagNameEl) tagNameEl.textContent = name || '(vide)';
    const mapEl = document.getElementById('map');
    if(!mapEl) return;
    const map = L.map('map', {center:[20,0], zoom:2, attributionControl:false});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
    const marker = L.circleMarker([20,0],{radius:8, color:'#1db954', fillColor:'#1db954', fillOpacity:0.24}).addTo(map);
    map.on('click', e=>{
      marker.setLatLng(e.latlng);
      map.panTo(e.latlng);
    });
  }

  function applyTheme(theme){
    if(theme === 'light'){
      document.body.classList.add('light-theme');
    }else{
      document.body.classList.remove('light-theme');
    }
  }
  function toggleTheme(){
    const current = localStorage.getItem(THEME_KEY) || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }
  function initTheme(){
    const btn = document.getElementById('theme-btn');
    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    applyTheme(saved);
    if(btn) btn.addEventListener('click', toggleTheme);
  }

  function initTagsPage(){
    const newTagBtn = document.getElementById('newTagBtn');
    renderTags();
    if(newTagBtn){
      newTagBtn.addEventListener('click', ()=>{
        const newTag = createUniqueTag();
        renderTags();
        highlightTag(newTag);
      });
    }
    if(openModalBtn) openModalBtn.addEventListener('click', openModal);
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    initTheme();
    if(getTagListEl()) initTagsPage();
    if(document.getElementById('map')) initDashboardPage();
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape' && modalEl && modalEl.getAttribute('aria-hidden') === 'false') closeModal();
    });
  });

  window.__visiter = {
    loadTags, saveTags, createUniqueTag, renderTags, openModal, closeModal
  };

})();