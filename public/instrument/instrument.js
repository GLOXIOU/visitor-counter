(function () {
  const JSZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  const IGNORED = /(^|\/)(__MACOSX|\.git|node_modules|\.svn|\.idea|\.vscode)(\/|$)|(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$/i;
  const MAX_PREVIEW_LINES = 400;
  const KIND_LABELS = { click: ['clic', 'clics'], form: ['formulaire', 'formulaires'], view: ['section', 'sections'], media: ['média', 'médias'] };

  function count(n, words) {
    return `${VC.fmtNumber(n)} ${n > 1 ? words[1] : words[0]}`;
  }

  const $ = id => document.getElementById(id);
  const state = { files: [], root: 'site', single: false, results: [], base: location.origin, tags: [] };
  let jszipPromise = null;

  function loadJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (!jszipPromise) {
      jszipPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = JSZIP_URL;
        s.onload = () => resolve(window.JSZip);
        s.onerror = () => {
          jszipPromise = null;
          reject(new Error('Impossible de charger JSZip (connexion internet requise pour les .zip)'));
        };
        document.head.appendChild(s);
      });
    }
    return jszipPromise;
  }

  function currentTag() {
    return $('tagSelect').value || '';
  }

  function options() {
    const tag = currentTag();
    return {
      tag,
      snippet: $('optScript').checked && tag ? VC.snippet(tag, state.base) : '',
      clicks: $('optClicks').checked,
      forms: $('optForms').checked,
      sections: $('optSections').checked,
      media: $('optMedia').checked
    };
  }

  async function loadTags() {
    const select = $('tagSelect');
    try {
      state.tags = await VC.api('/api/balise');
    } catch (e) {
      if (e.message === 'auth') return;
      select.innerHTML = '<option value="">Erreur de chargement</option>';
      return;
    }
    const wanted = new URLSearchParams(location.search).get('tag');
    if (!state.tags.length) {
      select.innerHTML = '<option value="">Aucune balise : crée-en une d\'abord</option>';
      select.disabled = true;
      return;
    }
    select.innerHTML = state.tags.map(t => `<option value="${VC.esc(t.tagId)}">${VC.esc(t.name)} — ${VC.esc(t.tagId)}</option>`).join('');
    if (wanted && state.tags.some(t => t.tagId === wanted)) select.value = wanted;
    select.disabled = false;
    updateDashboardLink();
  }

  function updateDashboardLink() {
    const tag = currentTag();
    const link = $('dashboardLink');
    link.hidden = !tag;
    if (tag) link.href = `../dashboard/dashboard.html?tag=${encodeURIComponent(tag)}`;
  }

  function entryFile(entry) {
    return new Promise((resolve, reject) => entry.file(resolve, reject));
  }

  function readBatch(reader) {
    return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
  }

  async function walk(entry, prefix, out) {
    const path = prefix + entry.name;
    if (IGNORED.test(path)) return;
    if (entry.isFile) {
      out.push({ path, file: await entryFile(entry) });
      return;
    }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await readBatch(reader);
        for (const child of batch) await walk(child, path + '/', out);
      } while (batch.length);
    }
  }

  async function expandZip(file) {
    const JSZip = await loadJSZip();
    const zip = await JSZip.loadAsync(file);
    const out = [];
    const jobs = [];
    zip.forEach((path, item) => {
      if (item.dir || IGNORED.test(path)) return;
      jobs.push(item.async('uint8array').then(bytes => out.push({ path, bytes })));
    });
    await Promise.all(jobs);
    return out;
  }

  function commonRoot(paths) {
    const firsts = new Set(paths.map(p => (p.includes('/') ? p.split('/')[0] : '')));
    return firsts.size === 1 && !firsts.has('') ? [...firsts][0] : '';
  }

  async function ingest(list) {
    const files = [];
    let zipName = '';
    for (const item of list) {
      if (/\.zip$/i.test(item.path)) {
        zipName = zipName || item.path.split('/').pop().replace(/\.zip$/i, '');
        const inner = await expandZip(item.file);
        const prefix = list.length > 1 ? item.path.replace(/\.zip$/i, '') + '/' : '';
        inner.forEach(f => files.push({ path: prefix + f.path, bytes: f.bytes }));
      } else {
        files.push({ path: item.path, bytes: new Uint8Array(await item.file.arrayBuffer()) });
      }
    }
    files.sort((a, b) => a.path.localeCompare(b.path));
    const root = commonRoot(files.map(f => f.path));
    state.files = files;
    state.single = list.length === 1 && files.length === 1 && VCInstrumenter.isMarkup(files[0].path) && !zipName;
    state.root = (zipName || root || (files.length === 1 ? files[0].path.replace(/\.[^.]+$/, '') : 'site')).replace(/[^\w.-]+/g, '-') || 'site';
  }

  async function handle(list) {
    if (!list.length) return;
    if (!currentTag()) {
      VC.toast('Crée ou choisis d\'abord une balise', 'error');
      return;
    }
    const zone = $('dropzone');
    zone.classList.add('busy');
    try {
      await ingest(list);
      if (!state.files.some(f => VCInstrumenter.isMarkup(f.path))) {
        VC.toast('Aucun fichier HTML trouvé (.html, .htm, .php…)', 'error');
        return;
      }
      process();
      $('results').hidden = false;
      $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      VC.toast(e.message || 'Lecture impossible', 'error');
    } finally {
      zone.classList.remove('busy');
    }
  }

  function process() {
    const opts = options();
    state.results = state.files.map(f => {
      if (!VCInstrumenter.isMarkup(f.path)) return { path: f.path, markup: false, bytes: f.bytes };
      const info = VCInstrumenter.decodeBytes(f.bytes);
      const r = VCInstrumenter.instrument(info.text, Object.assign({ path: f.path, ascii: info.ascii }, opts));
      return {
        path: f.path,
        markup: true,
        info,
        source: info.text,
        result: r,
        bytes: r.changed ? VCInstrumenter.encodeText(r.output, info) : f.bytes
      };
    });
    render();
  }

  function scriptBadge(status) {
    return {
      added: '<span class="badge ok">Script ajouté</span>',
      present: '<span class="badge muted">Script déjà présent</span>',
      updated: '<span class="badge ok">Script mis à jour</span>',
      missing: '<span class="badge warn">Pas de &lt;head&gt;</span>',
      off: ''
    }[status] || '';
  }

  function previewLines(src, edits) {
    const pieces = [];
    let pos = 0;
    edits.forEach(e => {
      if (e.start > pos) pieces.push({ t: src.slice(pos, e.start) });
      if (e.end > e.start) pieces.push({ t: src.slice(e.start, e.end), del: true });
      pieces.push({ t: e.text, ins: true });
      pos = e.end;
    });
    pieces.push({ t: src.slice(pos) });
    const lines = [{ html: '', changed: false }];
    pieces.forEach(piece => {
      piece.t.split('\n').forEach((part, i) => {
        if (i > 0) lines.push({ html: '', changed: false });
        const text = part.replace(/\r$/, '');
        if (!text) return;
        const cur = lines[lines.length - 1];
        const html = VC.esc(text);
        cur.html += piece.ins ? `<mark>${html}</mark>` : piece.del ? `<del>${html}</del>` : html;
        if (piece.ins || piece.del) cur.changed = true;
      });
    });
    const keep = new Set();
    lines.forEach((line, i) => {
      if (!line.changed) return;
      for (let k = Math.max(0, i - 1); k <= Math.min(lines.length - 1, i + 1); k++) keep.add(k);
    });
    const out = [];
    let last = -2;
    [...keep].sort((a, b) => a - b).slice(0, MAX_PREVIEW_LINES).forEach(i => {
      if (i > last + 1) out.push('<div class="code-gap">⋯</div>');
      const line = lines[i];
      const html = line.html.length > 6000 ? line.html.slice(0, 6000) + '…' : line.html;
      out.push(`<div class="code-line${line.changed ? ' changed' : ''}"><span class="ln">${i + 1}</span><span class="lc">${html || ' '}</span></div>`);
      last = i;
    });
    return out.join('');
  }

  function renderFile(item, open) {
    const r = item.result;
    const counts = Object.keys(KIND_LABELS).filter(k => r.counts[k]).map(k => `<span class="badge">${count(r.counts[k], KIND_LABELS[k])}</span>`).join('');
    const details = document.createElement('details');
    details.className = 'file';
    if (open) details.open = true;
    const rows = r.changes.map(c => `
      <tr>
        <td class="mono">${c.line}</td>
        <td class="mono">&lt;${VC.esc(c.tag)}&gt;</td>
        <td class="mono attr">${VC.esc(c.attr)}</td>
        <td>${VC.esc(c.label)}</td>
      </tr>`).join('');
    details.innerHTML = `
      <summary>
        <span class="file-name">${VC.esc(item.path)}</span>
        <span class="file-badges">${scriptBadge(r.script)}${counts || (r.changed ? '' : '<span class="badge muted">Rien à ajouter</span>')}</span>
      </summary>
      <div class="file-body">
        ${rows ? `<div class="table-wrap"><table class="changes"><thead><tr><th>Ligne</th><th>Élément</th><th>Attribut</th><th>Nom suivi</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">Ce fichier est déjà entièrement balisé.</p>'}
        ${r.edits.length ? `<div class="code-title">Aperçu des modifications</div><div class="code">${previewLines(item.source, r.edits)}</div>` : ''}
      </div>`;
    return details;
  }

  function render() {
    const markup = state.results.filter(r => r.markup);
    const others = state.results.filter(r => !r.markup);
    const changed = markup.filter(r => r.result.changed);
    const total = { click: 0, form: 0, view: 0, media: 0 };
    markup.forEach(r => Object.keys(total).forEach(k => (total[k] += r.result.counts[k])));
    const scripts = markup.filter(r => r.result.script === 'added' || r.result.script === 'updated').length;
    const missing = markup.filter(r => r.result.script === 'missing');
    const tracked = total.click + total.form + total.view + total.media;

    $('resultsIntro').textContent = `${markup.length} fichier${markup.length > 1 ? 's' : ''} HTML analysé${markup.length > 1 ? 's' : ''}, ${changed.length} modifié${changed.length > 1 ? 's' : ''}` + (others.length ? `, ${others.length} autre${others.length > 1 ? 's' : ''} fichier${others.length > 1 ? 's' : ''} copié${others.length > 1 ? 's' : ''} tel${others.length > 1 ? 's' : ''} quel${others.length > 1 ? 's' : ''} (CSS, JS, images…)` : '') + '.';

    $('summary').innerHTML = [
      ['🧩', tracked, ['élément suivi', 'éléments suivis']],
      ['👆', total.click, KIND_LABELS.click],
      ['📝', total.form, KIND_LABELS.form],
      ['👁️', total.view, KIND_LABELS.view],
      ['▶️', total.media, KIND_LABELS.media],
      ['📄', scripts, ['script ajouté', 'scripts ajoutés']]
    ].map(([icon, value, words]) => `<div class="summary-card"><span class="summary-icon">${icon}</span><span class="summary-value">${VC.fmtNumber(value)}</span><span class="summary-label">${value > 1 ? words[1] : words[0]}</span></div>`).join('');

    const warnings = [];
    if (!$('optScript').checked) warnings.push('Le script de suivi n\'est pas ajouté : pense à le mettre toi-même dans le &lt;head&gt;, sinon rien ne sera compté.');
    if (missing.length) warnings.push(`${missing.length} fichier${missing.length > 1 ? 's' : ''} sans &lt;head&gt; (morceau de page ou template) : ${missing.slice(0, 5).map(r => `<code>${VC.esc(r.path)}</code>`).join(', ')}${missing.length > 5 ? '…' : ''}. Ajoute le script dans ta page principale (layout) : <code>${VC.esc(VC.snippet(currentTag(), state.base))}</code>`);
    if (markup.some(r => r.info.encoding !== 'utf-8')) warnings.push('Certains fichiers ne sont pas en UTF-8 : leur encodage d\'origine est conservé.');
    $('warnings').innerHTML = warnings.map(w => `<li>${w}</li>`).join('');

    const list = $('fileList');
    list.innerHTML = '';
    markup.forEach((item, i) => list.appendChild(renderFile(item, markup.length === 1 || (i === 0 && markup.length <= 3))));

    $('downloadBtn').textContent = state.single ? `⬇️ Télécharger ${state.files[0].path.split('/').pop()}` : `⬇️ Télécharger ${state.root}-balise.zip`;
    $('copyBtn').hidden = !state.single;
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function download() {
    const btn = $('downloadBtn');
    btn.disabled = true;
    try {
      if (state.single) {
        const item = state.results[0];
        saveBlob(new Blob([item.bytes], { type: 'text/html' }), item.path.split('/').pop());
        return;
      }
      const JSZip = await loadJSZip();
      const zip = new JSZip();
      state.results.forEach(r => zip.file(r.path, r.bytes));
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      saveBlob(blob, `${state.root}-balise.zip`);
    } catch (e) {
      VC.toast(e.message || 'Téléchargement impossible', 'error');
    } finally {
      btn.disabled = false;
    }
  }

  function reset() {
    state.files = [];
    state.results = [];
    $('results').hidden = true;
    $('fileInput').value = '';
    $('folderInput').value = '';
    $('dropzone').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function initDrop() {
    const zone = $('dropzone');
    ['dragenter', 'dragover'].forEach(type => zone.addEventListener(type, e => {
      e.preventDefault();
      zone.classList.add('over');
    }));
    ['dragleave', 'dragend'].forEach(type => zone.addEventListener(type, e => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove('over');
    }));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('over');
      const dt = e.dataTransfer;
      const entries = dt.items ? [...dt.items].map(item => (item.webkitGetAsEntry ? item.webkitGetAsEntry() : null)).filter(Boolean) : [];
      const plain = [...(dt.files || [])].map(file => ({ path: file.name, file }));
      (async () => {
        let list = plain;
        if (entries.length) {
          list = [];
          for (const entry of entries) await walk(entry, '', list);
        }
        await handle(list);
      })().catch(err => VC.toast(err.message || 'Lecture impossible', 'error'));
    });
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', e => {
      if (!zone.contains(e.target)) e.preventDefault();
    });

    $('pickFiles').addEventListener('click', e => {
      e.stopPropagation();
      $('fileInput').click();
    });
    $('pickFolder').addEventListener('click', e => {
      e.stopPropagation();
      $('folderInput').click();
    });
    zone.addEventListener('click', e => {
      if (!e.target.closest('button')) $('fileInput').click();
    });
    zone.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        $('fileInput').click();
      }
    });
    $('fileInput').addEventListener('change', () => {
      handle([...$('fileInput').files].map(file => ({ path: file.name, file })));
    });
    $('folderInput').addEventListener('change', () => {
      handle([...$('folderInput').files]
        .map(file => ({ path: file.webkitRelativePath || file.name, file }))
        .filter(item => !IGNORED.test(item.path)));
    });
  }

  async function init() {
    const cfg = await VC.config();
    state.base = cfg.publicUrl || location.origin;
    initDrop();
    ['optScript', 'optClicks', 'optForms', 'optSections', 'optMedia'].forEach(id => $(id).addEventListener('change', () => {
      if (state.files.length) process();
    }));
    $('tagSelect').addEventListener('change', () => {
      updateDashboardLink();
      if (state.files.length) process();
    });
    $('downloadBtn').addEventListener('click', download);
    $('resetBtn').addEventListener('click', reset);
    $('copyBtn').addEventListener('click', async () => {
      const item = state.results[0];
      const ok = await VC.copy(item.result.output);
      VC.toast(ok ? 'Code copié' : 'Copie impossible', ok ? '' : 'error');
    });
    await loadTags();
  }

  init();
})();
