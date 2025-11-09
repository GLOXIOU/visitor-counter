const STORAGE_KEY = 'visitor_tags_v1';

function qs(selector) {
  return document.querySelector(selector);
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
  return `<script async src="https://example.com/tag.js?tag=${code}"></script>`;
}

function createTagElement(item) {
  const li = document.createElement('li');
  li.className = 'tag-item';

  const left = document.createElement('div');
  left.className = 'tag-main';

  const pill = document.createElement('div');
  pill.className = 'tag-pill';
  pill.textContent = item.name.charAt(0).toUpperCase();

  const info = document.createElement('div');

  const name = document.createElement('div');
  name.className = 'tag-name';
  name.textContent = item.name;

  const code = document.createElement('div');
  code.className = 'tag-code';
  code.textContent = item.code;

  info.appendChild(name);
  info.appendChild(code);
  left.appendChild(pill);
  left.appendChild(info);

  const actions = document.createElement('div');
  actions.className = 'actions';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn small';
  copyBtn.textContent = 'Copier';
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(snippetFor(item.code));
      copyBtn.textContent = 'Copié';
      setTimeout(() => (copyBtn.textContent = 'Copier'), 1400);
    } catch {}
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'btn secondary small';
  delBtn.textContent = 'Supprimer';
  delBtn.addEventListener('click', () => {
    const ok = confirm('Supprimer cette balise ?');
    if (!ok) return;
    const updated = loadTags().filter(t => t.code !== item.code);
    saveTags(updated);
    render();
  });

  const viewBtn = document.createElement('button');
  viewBtn.className = 'btn ghost small';
  viewBtn.textContent = 'Voir le dashboard';
  viewBtn.addEventListener('click', () => {
    location.href = `../dashboard/dashboard.html?tag=${encodeURIComponent(item.code)}`;
  });

  actions.appendChild(copyBtn);
  actions.appendChild(delBtn);
  actions.appendChild(viewBtn);

  li.appendChild(left);
  li.appendChild(actions);

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
  qs('#tagName').focus();
}

function closeModal() {
  qs('#modal').setAttribute('aria-hidden', 'true');
}

document.addEventListener('DOMContentLoaded', () => {
  render();

  qs('#createBtn').addEventListener('click', openModal);
  qs('#closeModal').addEventListener('click', closeModal);
  qs('#cancel').addEventListener('click', closeModal);

  qs('#modal').addEventListener('click', (e) => {
    if (e.target === qs('#modal')) closeModal();
  });

  qs('#createForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = qs('#tagName').value.trim();
    if (!name) return;
    const code = qs('#generatedCode').value || genCode();
    const list = loadTags();
    list.unshift({ name, code, created: Date.now() });
    saveTags(list);
    render();
    closeModal();
  });

  qs('#generatedCode').addEventListener('click', async () => {
    qs('#generatedCode').select();
    try {
      await navigator.clipboard.writeText(qs('#generatedCode').value);
    } catch {}
  });

  qs('#headSnippet').addEventListener('click', async () => {
    qs('#headSnippet').select();
    try {
      await navigator.clipboard.writeText(qs('#headSnippet').value);
    } catch {}
  });

  window.addEventListener('storage', render);
});