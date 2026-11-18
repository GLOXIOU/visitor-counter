(function () {
  const LEGACY_KEY = 'visitor_tags_v1';
  let tags = [];
  let base = location.origin;

  const $ = id => document.getElementById(id);

  function dashboardUrl(tag) {
    return `../dashboard/dashboard.html?tag=${encodeURIComponent(tag.tagId)}`;
  }

  function instrumentUrl(tag) {
    return `../instrument/instrument.html?tag=${encodeURIComponent(tag.tagId)}`;
  }

  function button(className, html, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.innerHTML = html;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      onClick(btn);
    });
    return btn;
  }

  function createTagElement(tag) {
    const li = document.createElement('li');
    li.className = 'tag-item';

    const statsLine = tag.total
      ? `<span>${VC.fmtNumber(tag.views30)} vues · ${VC.fmtNumber(tag.visitors30)} visiteurs (30 j)</span><span>Dernière visite ${VC.esc(VC.fmtRelative(tag.lastVisit))}</span>`
      : '<span>Aucune visite enregistrée pour l\'instant</span>';
    const live = tag.live ? `<span class="tag-live"><span class="live-dot"></span>${tag.live} en ligne</span>` : '';
    const hosts = tag.hosts && tag.hosts.length ? `<div class="tag-hosts">${tag.hosts.map(h => `<span>${VC.esc(h)}</span>`).join('')}</div>` : '';

    li.innerHTML = `
      <div class="tag-main">
        <div class="tag-pill">${VC.esc(tag.name.charAt(0).toUpperCase())}</div>
        <div class="tag-info">
          <div class="tag-name">${VC.esc(tag.name)}</div>
          <div class="tag-code">${VC.esc(tag.tagId)}</div>
        </div>
        ${live}
      </div>
      <div class="tag-stats">${statsLine}</div>
      ${hosts}`;

    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.appendChild(button('btn small', '📋 Copier le snippet', async btn => {
      const ok = await VC.copy(VC.snippet(tag.tagId, base));
      btn.innerHTML = ok ? '✓ Copié' : '✗ Erreur';
      setTimeout(() => (btn.innerHTML = '📋 Copier le snippet'), 1400);
    }));
    actions.appendChild(button('btn ghost small', '📊 Dashboard', () => {
      location.href = dashboardUrl(tag);
    }));
    actions.appendChild(button('btn ghost small', '🛠️ Baliser le site', () => {
      location.href = instrumentUrl(tag);
    }));
    actions.appendChild(button('btn secondary small danger-hover', '🗑️ Supprimer', async () => {
      if (!confirm(`Supprimer la balise "${tag.name}" et toutes ses statistiques ?`)) return;
      try {
        await VC.api(`/api/balise/${encodeURIComponent(tag.tagId)}`, { method: 'DELETE' });
        VC.toast(`Balise "${tag.name}" supprimée`);
        await load();
      } catch (e) {
        VC.toast(e.message, 'error');
      }
    }));
    li.appendChild(actions);

    li.addEventListener('click', e => {
      if (!e.target.closest('.actions')) location.href = dashboardUrl(tag);
    });
    return li;
  }

  function render() {
    const list = $('tagList');
    $('loading').hidden = true;
    list.innerHTML = '';
    $('empty').hidden = tags.length > 0;
    tags.forEach(tag => list.appendChild(createTagElement(tag)));
  }

  async function syncLegacy() {
    let legacy = [];
    try {
      legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
    } catch (e) {
      legacy = [];
    }
    if (!Array.isArray(legacy) || !legacy.length) return false;
    const known = new Set(tags.map(t => t.tagId));
    let failed = 0;
    for (const t of legacy) {
      if (!t || !t.code || known.has(t.code)) continue;
      try {
        await VC.api(`/api/balise/${encodeURIComponent(t.code)}`, { method: 'POST', body: { name: t.name || t.code } });
      } catch (e) {
        failed += 1;
      }
    }
    if (!failed) {
      try { localStorage.removeItem(LEGACY_KEY); } catch (e) {}
    }
    return true;
  }

  async function load() {
    try {
      tags = await VC.api('/api/balise');
      if (await syncLegacy()) tags = await VC.api('/api/balise');
      render();
    } catch (e) {
      if (e.message === 'auth') return;
      $('loading').textContent = 'Impossible de charger les balises : ' + e.message;
    }
  }

  function refreshCode() {
    const code = VC.genCode(10);
    $('generatedCode').value = code;
    $('headSnippet').value = VC.snippet(code, base);
  }

  function openModal() {
    $('modal').setAttribute('aria-hidden', 'false');
    $('tagName').value = '';
    $('formError').hidden = true;
    refreshCode();
    setTimeout(() => $('tagName').focus(), 100);
  }

  function closeModal() {
    $('modal').setAttribute('aria-hidden', 'true');
  }

  function selectAndCopy(el) {
    el.addEventListener('click', async () => {
      el.select();
      if (await VC.copy(el.value)) {
        el.classList.add('copied');
        setTimeout(() => el.classList.remove('copied'), 400);
        VC.toast('Copié dans le presse-papiers');
      }
    });
  }

  async function init() {
    const cfg = await VC.config();
    base = cfg.publicUrl || location.origin;

    $('createBtn').addEventListener('click', openModal);
    $('closeModal').addEventListener('click', closeModal);
    $('cancel').addEventListener('click', closeModal);
    $('modal').addEventListener('click', e => {
      if (e.target === $('modal')) closeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && $('modal').getAttribute('aria-hidden') === 'false') closeModal();
    });
    selectAndCopy($('generatedCode'));
    selectAndCopy($('headSnippet'));

    $('createForm').addEventListener('submit', async e => {
      e.preventDefault();
      const name = $('tagName').value.trim();
      if (!name) return;
      const code = $('generatedCode').value || VC.genCode(10);
      if (tags.some(t => t.name.toLowerCase() === name.toLowerCase())) {
        $('formError').textContent = 'Une balise avec ce nom existe déjà.';
        $('formError').hidden = false;
        return;
      }
      try {
        await VC.api(`/api/balise/${encodeURIComponent(code)}`, { method: 'POST', body: { name } });
      } catch (err) {
        $('formError').textContent = err.message;
        $('formError').hidden = false;
        return;
      }
      closeModal();
      VC.toast(`✓ Balise "${name}" créée`);
      await load();
    });

    await load();
    setInterval(() => {
      if (document.visibilityState === 'visible' && $('modal').getAttribute('aria-hidden') !== 'false') load();
    }, 30000);
  }

  init();
})();
