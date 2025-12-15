const STORAGE_KEY = 'visitor_tags_v1';
const THEME_KEY = 'visiter:theme';

function qs(selector) {
  return document.querySelector(selector);
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.body.classList.add('light-theme');
    qs('#themeBtn').textContent = '☀️';
  } else {
    document.body.classList.remove('light-theme');
    qs('#themeBtn').textContent = '🌙';
  }
}

function toggleTheme() {
  const current = localStorage.getItem(THEME_KEY) || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(saved);
  const btn = qs('#themeBtn');
  if (btn) btn.addEventListener('click', toggleTheme);
}

function loadTags() {
  const raw = localStorage.getItem(STORAGE_KEY);
  try {
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTags(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function genCode(length = 10) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function snippetFor(code) {
  return `<script async src="${window.location.origin}/tag.js?tag=${code}"></script>`;
}

function createTagElement(item) {
  const li = document.createElement('li');
  li.className = 'tag-item';

  const main = document.createElement('div');
  main.className = 'tag-main';

  const pill = document.createElement('div');
  pill.className = 'tag-pill';
  pill.textContent = item.name.charAt(0).toUpperCase();

  const info = document.createElement('div');
  info.className = 'tag-info';

  const name = document.createElement('div');
  name.className = 'tag-name';
  name.textContent = item.name;

  const code = document.createElement('div');
  code.className = 'tag-code';
  code.textContent = item.code;

  info.appendChild(name);
  info.appendChild(code);
  main.appendChild(pill);
  main.appendChild(info);

  const actions = document.createElement('div');
  actions.className = 'actions';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn small';
  copyBtn.innerHTML = '📋 Copier';
  copyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(snippetFor(item.code));
      copyBtn.innerHTML = '✓ Copié';
      setTimeout(() => (copyBtn.innerHTML = '📋 Copier'), 1400);
    } catch {
      copyBtn.innerHTML = '✗ Erreur';
      setTimeout(() => (copyBtn.innerHTML = '📋 Copier'), 1400);
    }
  });

  const viewBtn = document.createElement('button');
  viewBtn.className = 'btn ghost small';
  viewBtn.innerHTML = '📊 Dashboard';
  viewBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    location.href = `../dashboard/dashboard.html?tag=${encodeURIComponent(item.code)}&name=${encodeURIComponent(item.name)}`;
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'btn secondary small';
  delBtn.innerHTML = '🗑️ Supprimer';
  delBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const ok = confirm(`Êtes-vous sûr de vouloir supprimer la balise "${item.name}" ?`);
    if (!ok) return;
    const updated = loadTags().filter(t => t.code !== item.code);
    saveTags(updated);
    render();
  });

  actions.appendChild(copyBtn);
  actions.appendChild(viewBtn);
  actions.appendChild(delBtn);

  li.appendChild(main);
  li.appendChild(actions);

  li.addEventListener('click', (e) => {
    if (!e.target.closest('.actions')) {
      location.href = `../dashboard/dashboard.html?tag=${encodeURIComponent(item.code)}&name=${encodeURIComponent(item.name)}`;
    }
  });

  return li;
}

function render() {
  const list = loadTags();
  const container = qs('#tagList');
  const empty = qs('#empty');
  container.innerHTML = '';

  if (!list.length) {
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  list.forEach(item => {
    const el = createTagElement(item);
    container.appendChild(el);
  });
}

function openModal() {
  const modal = qs('#modal');
  modal.setAttribute('aria-hidden', 'false');
  qs('#tagName').value = '';
  const code = genCode();
  qs('#generatedCode').value = code;
  qs('#headSnippet').value = snippetFor(code);
  setTimeout(() => qs('#tagName').focus(), 100);
}

function closeModal() {
  qs('#modal').setAttribute('aria-hidden', 'true');
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  render();

  qs('#createBtn').addEventListener('click', (e) => {
    e.preventDefault();
    openModal();
  });

  qs('#closeModal').addEventListener('click', closeModal);
  qs('#cancel').addEventListener('click', closeModal);

  qs('#modal').addEventListener('click', (e) => {
    if (e.target === qs('#modal')) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && qs('#modal').getAttribute('aria-hidden') === 'false') {
      closeModal();
    }
  });

  qs('#createForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = qs('#tagName').value.trim();
    if (!name) return;
    const code = qs('#generatedCode').value || genCode();
    const list = loadTags();
    
    if (list.some(t => t.name.toLowerCase() === name.toLowerCase())) {
      alert('Une balise avec ce nom existe déjà.');
      return;
    }
    
    list.unshift({ name, code, created: Date.now() });
    saveTags(list);
    render();
    closeModal();
    
    const successMsg = document.createElement('div');
    successMsg.textContent = `✓ Balise "${name}" créée avec succès`;
    successMsg.style.cssText = `
      position: fixed;
      top: 100px;
      right: 20px;
      background: #1db954;
      color: #042014;
      padding: 14px 20px;
      border-radius: 12px;
      font-weight: 600;
      box-shadow: 0 8px 24px rgba(29, 185, 84, 0.4);
      z-index: 2000;
      animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(successMsg);
    setTimeout(() => {
      successMsg.style.opacity = '0';
      successMsg.style.transition = 'opacity 0.3s ease';
      setTimeout(() => successMsg.remove(), 300);
    }, 3000);
  });

  qs('#generatedCode').addEventListener('click', async () => {
    qs('#generatedCode').select();
    try {
      await navigator.clipboard.writeText(qs('#generatedCode').value);
      const originalBg = qs('#generatedCode').style.background;
      qs('#generatedCode').style.background = 'rgba(29, 185, 84, 0.15)';
      setTimeout(() => {
        qs('#generatedCode').style.background = originalBg;
      }, 300);
    } catch {}
  });

  qs('#headSnippet').addEventListener('click', async () => {
    qs('#headSnippet').select();
    try {
      await navigator.clipboard.writeText(qs('#headSnippet').value);
      const originalBg = qs('#headSnippet').style.background;
      qs('#headSnippet').style.background = 'rgba(29, 185, 84, 0.15)';
      setTimeout(() => {
        qs('#headSnippet').style.background = originalBg;
      }, 300);
    } catch {}
  });

  window.addEventListener('storage', render);
});