(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VCInstrumenter = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MARKUP_RE = /\.(html?|xhtml|shtml|php|phtml|ejs|hbs|handlebars|mustache|njk|twig|liquid|erb|jsp|aspx|cshtml|vue)$/i;
  var RAW_TEXT = { script: 1, style: 1, textarea: 1, title: 1, xmp: 1, noscript: 1, iframe: 1, noembed: 1, noframes: 1, plaintext: 1 };
  var VOID = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, param: 1, source: 1, track: 1, wbr: 1 };
  var CLICK_ATTR_RE = /^(onclick|@click|v-on:click|x-on:click|\(click\)|ng-click|hx-(get|post|put|patch|delete))/;
  var CLICK_ROLES = { button: 1, link: 1, tab: 1, menuitem: 1, switch: 1 };
  var INPUT_TYPES = { submit: 1, button: 1, reset: 1, image: 1 };
  var LINK_ATTRS = ['href', 'xlink:href', ':href', 'v-bind:href', '[href]', 'routerlink', '[routerlink]', 'to', ':to'];
  var LINK_TAGS = { 'router-link': 1, 'nuxt-link': 1, nuxtlink: 1, routerlink: 1 };
  var CLICK_STOP = { a: 1, button: 1, form: 1, input: 1, textarea: 1, select: 1, video: 1, audio: 1, iframe: 1, summary: 1, details: 1 };
  var VIEW_DENY = { a: 1, span: 1, button: 1, input: 1, img: 1, label: 1, option: 1, i: 1, b: 1, strong: 1, em: 1, small: 1, svg: 1, path: 1, use: 1, li: 1, main: 1, header: 1, nav: 1, td: 1, th: 1, tr: 1, br: 1, select: 1, textarea: 1, source: 1, picture: 1, html: 1, body: 1, head: 1 };
  var ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™', euro: '€', hellip: '…', mdash: '—', ndash: '–',
    rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', laquo: '«', raquo: '»', middot: '·', bull: '•', deg: '°', times: '×', rarr: '→', larr: '←',
    agrave: 'à', aacute: 'á', acirc: 'â', auml: 'ä', ccedil: 'ç', egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë', icirc: 'î', iuml: 'ï',
    ocirc: 'ô', ouml: 'ö', ugrave: 'ù', ucirc: 'û', uuml: 'ü', yuml: 'ÿ', oelig: 'œ', aelig: 'æ', ntilde: 'ñ',
    Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Auml: 'Ä', Ccedil: 'Ç', Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë', Icirc: 'Î', Iuml: 'Ï',
    Ocirc: 'Ô', Ouml: 'Ö', Ugrave: 'Ù', Ucirc: 'Û', Uuml: 'Ü', OElig: 'Œ', AElig: 'Æ', Ntilde: 'Ñ'
  };

  function isMarkup(path) {
    return MARKUP_RE.test(path || '');
  }

  function delimitersFor(path) {
    var list = [['<?', '?>', true], ['<%', '%>', true], ['{{', '}}', false]];
    if (/\.(njk|twig|liquid|j2|jinja2?)$/i.test(path || '')) list.push(['{%', '%}', false], ['{#', '#}', false]);
    return list;
  }

  function templateEnd(src, i, delims) {
    for (var k = 0; k < delims.length; k++) {
      var open = delims[k][0];
      if (src.charCodeAt(i) !== open.charCodeAt(0) || src.substr(i, open.length) !== open) continue;
      var end = src.indexOf(delims[k][1], i + open.length);
      if (end < 0) return delims[k][2] ? src.length : 0;
      return end + delims[k][1].length;
    }
    return 0;
  }

  function skipBraces(src, k) {
    var depth = 0;
    for (var i = k; i < src.length; i++) {
      var c = src[i];
      if (c === '"' || c === "'" || c === '`') {
        var e = src.indexOf(c, i + 1);
        if (e < 0) return src.length;
        i = e;
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (!depth) return i + 1;
      }
    }
    return src.length;
  }

  function isSpace(c) {
    return c === ' ' || c === '\n' || c === '\t' || c === '\r' || c === '\f';
  }

  function isAlpha(code) {
    return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
  }

  function parseStartTag(src, i, delims) {
    var len = src.length;
    var j = i + 1;
    while (j < len && /[A-Za-z0-9:_.-]/.test(src[j])) j++;
    var tag = { type: 's', name: src.slice(i + 1, j).toLowerCase(), start: i, nameEnd: j, insertAt: j, attrs: {}, values: {}, selfClosing: false };
    while (j < len) {
      var ch = src[j];
      if (ch === '>') {
        tag.end = j + 1;
        return tag;
      }
      if (isSpace(ch)) { j++; continue; }
      if (ch === '/') {
        if (src[j + 1] === '>') tag.selfClosing = true;
        j++;
        continue;
      }
      if (ch === '<' && !templateEnd(src, j, delims)) return null;
      var block = templateEnd(src, j, delims);
      if (block) {
        j = block;
        tag.insertAt = j;
        continue;
      }
      if (ch === '{') {
        j = skipBraces(src, j);
        tag.insertAt = j;
        continue;
      }
      var ns = j;
      while (j < len && !isSpace(src[j]) && src[j] !== '=' && src[j] !== '>' && src[j] !== '/' && src[j] !== '<') j++;
      if (j === ns) { j++; continue; }
      var aname = src.slice(ns, j).toLowerCase();
      var k = j;
      while (k < len && isSpace(src[k])) k++;
      var value = '';
      var range = null;
      if (src[k] === '=') {
        k++;
        while (k < len && isSpace(src[k])) k++;
        var q = src[k];
        if (q === '"' || q === "'") {
          var m = k + 1;
          while (m < len && src[m] !== q) {
            var b = templateEnd(src, m, delims);
            if (b) { m = b; continue; }
            m++;
          }
          if (m >= len) return null;
          value = src.slice(k + 1, m);
          range = [k + 1, m];
          j = m + 1;
        } else if (q === '{') {
          var be = skipBraces(src, k);
          value = src.slice(k, be);
          range = [k, be];
          j = be;
        } else {
          var us = k;
          while (k < len && !isSpace(src[k]) && src[k] !== '>') {
            var b2 = templateEnd(src, k, delims);
            if (b2) { k = b2; continue; }
            k++;
          }
          value = src.slice(us, k);
          range = [us, k];
          j = k;
        }
      }
      if (!(aname in tag.attrs)) {
        tag.attrs[aname] = value;
        tag.values[aname] = range;
      }
      tag.insertAt = j;
    }
    return null;
  }

  function scan(src, delims) {
    var events = [];
    var len = src.length;
    var i = 0;
    while (i < len) {
      var c = src.charCodeAt(i);
      if (c !== 60 && c !== 123) { i++; continue; }
      var block = templateEnd(src, i, delims);
      if (block) { i = block; continue; }
      if (c === 123) { i++; continue; }
      if (src.startsWith('<!--', i)) {
        var ce = src.indexOf('-->', i + 4);
        i = ce < 0 ? len : ce + 3;
        continue;
      }
      if (src.startsWith('<![CDATA[', i)) {
        var de = src.indexOf(']]>', i + 9);
        i = de < 0 ? len : de + 3;
        continue;
      }
      if (src[i + 1] === '!') {
        var be = src.indexOf('>', i);
        i = be < 0 ? len : be + 1;
        continue;
      }
      if (src[i + 1] === '/' && isAlpha(src.charCodeAt(i + 2))) {
        var ne = i + 2;
        while (ne < len && /[A-Za-z0-9:_.-]/.test(src[ne])) ne++;
        var close = src.indexOf('>', ne);
        events.push({ type: 'e', name: src.slice(i + 2, ne).toLowerCase(), start: i, end: close < 0 ? len : close + 1 });
        i = close < 0 ? len : close + 1;
        continue;
      }
      if (isAlpha(src.charCodeAt(i + 1))) {
        var tag = parseStartTag(src, i, delims);
        if (!tag) { i++; continue; }
        events.push(tag);
        i = tag.end;
        if (RAW_TEXT[tag.name] && !tag.selfClosing) {
          var re = new RegExp('</' + tag.name + '[\\s>/]', 'ig');
          re.lastIndex = i;
          var match = re.exec(src);
          i = match ? match.index : len;
        }
        continue;
      }
      i++;
    }
    return events;
  }

  function innerRange(events, p, src, stopAt) {
    var open = events[p];
    if (VOID[open.name] || open.selfClosing) return [open.end, open.end];
    var stack = [];
    for (var q = p + 1; q < events.length && q < p + 5000; q++) {
      var ev = events[q];
      if (ev.type === 's') {
        if (stopAt && stopAt[ev.name]) return [open.end, ev.start];
        if (!VOID[ev.name] && !ev.selfClosing) stack.push(ev.name);
        continue;
      }
      var at = stack.lastIndexOf(ev.name);
      if (at >= 0) {
        stack.length = at;
        continue;
      }
      return [open.end, ev.start];
    }
    return [open.end, Math.min(src.length, open.end + 400)];
  }

  function decode(text) {
    return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+[0-9]*);/gi, function (all, name) {
      if (name[0] === '#') {
        var code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        try { return String.fromCodePoint(code); } catch (e) { return all; }
      }
      return Object.prototype.hasOwnProperty.call(ENTITIES, name) ? ENTITIES[name] : all;
    });
  }

  function stripTemplates(text) {
    return String(text)
      .replace(/<\?[\s\S]*?(\?>|$)/g, ' ')
      .replace(/<%[\s\S]*?(%>|$)/g, ' ')
      .replace(/\{\{[\s\S]*?\}\}/g, ' ')
      .replace(/\{%[\s\S]*?%\}/g, ' ')
      .replace(/\{#[\s\S]*?#\}/g, ' ');
  }

  function clean(text) {
    return decode(stripTemplates(text || '')).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function tidy(text) {
    var t = text.replace(/^[\s›»→←‹«➜➔➡⬅⇒↗▶►▸•·|:✓✔★☆+*>️-]+/, '').replace(/[\s›»→←‹«➜➔➡⬅⇒↗▶►▸•·|:✓✔★☆+*>️-]+$/, '').trim();
    return t || text.trim();
  }

  function textOf(html, short) {
    var s = stripTemplates(html)
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|template|noscript|select|textarea)\b[\s\S]*?<\/\1\s*>/gi, ' ');
    var t = clean(s.replace(/<[^>]*>/g, ' '));
    if (!t) {
      var m = /\b(?:alt|aria-label|title)\s*=\s*("([^"]*)"|'([^']*)')/i.exec(s);
      if (m) t = clean(m[2] || m[3] || '');
    }
    if (short && t.length > 32) {
      var heading = /<(h[1-6]|strong|b)\b[^>]*>([\s\S]*?)<\/\1\s*>/i.exec(s);
      var ht = heading ? clean(heading[2].replace(/<[^>]*>/g, ' ')) : '';
      if (ht.length >= 2) return tidy(ht);
      var parts = s.split(/<[^>]*>/).map(clean).filter(function (part) { return part.length > 1; });
      if (parts.length > 1) return tidy(parts[0]);
    }
    return tidy(t);
  }

  function truncate(text, max) {
    if (text.length <= max) return text;
    var cut = text.slice(0, max);
    var space = cut.lastIndexOf(' ');
    return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.·-]+$/, '') + '…';
  }

  function humanize(id) {
    var s = String(id).replace(/^#/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }

  function hrefLabel(href) {
    var h = clean(href);
    if (!h || h === '#') return '';
    if (/^mailto:/i.test(h)) return h.slice(7).split('?')[0];
    if (/^tel:/i.test(h)) return h.slice(4);
    if (/^javascript:/i.test(h)) return '';
    if (h[0] === '#') return humanize(h.slice(1));
    if (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(h)) {
      return h.replace(/^([a-z][a-z0-9+.-]*:)?\/\//i, '').replace(/^www\./, '').split(/[?#]/)[0].replace(/\/$/, '');
    }
    var last = h.split(/[?#]/)[0].split('/').filter(function (part) { return part && part !== '.' && part !== '..'; }).pop() || '';
    last = last.replace(/\.(html?|php)$/i, '');
    return !last || /^index$/i.test(last) ? 'Accueil' : humanize(last);
  }

  function attr(tag, name) {
    return Object.prototype.hasOwnProperty.call(tag.attrs, name) ? clean(tag.attrs[name]) : '';
  }

  function isClickable(tag) {
    var a = tag.attrs;
    var name = tag.name;
    if (name === 'a' || name === 'area' || LINK_TAGS[name]) {
      for (var i = 0; i < LINK_ATTRS.length; i++) if (LINK_ATTRS[i] in a) return true;
    }
    if (name === 'button' || name === 'summary') return true;
    if (name === 'input' && INPUT_TYPES[String(a.type || '').toLowerCase()]) return true;
    if (CLICK_ROLES[String(a.role || '').toLowerCase()]) return true;
    for (var key in a) if (CLICK_ATTR_RE.test(key)) return true;
    return false;
  }

  function firstHeading(events, p, range, src) {
    for (var q = p + 1; q < events.length; q++) {
      var ev = events[q];
      if (ev.start >= range[1]) break;
      if (ev.type === 's' && /^h[1-6]$/.test(ev.name)) {
        var r = innerRange(events, q, src);
        var t = textOf(src.slice(r[0], r[1]));
        if (t) return t;
      }
    }
    return '';
  }

  function clickLabel(tag, inner) {
    var a = tag.attrs;
    var label = attr(tag, 'aria-label') || attr(tag, 'title') || inner;
    if (!label && tag.name === 'input') label = attr(tag, 'value') || attr(tag, 'alt') || (String(a.type || '').toLowerCase() === 'submit' ? 'Envoyer' : '');
    if (!label) label = hrefLabel(a.href || a['xlink:href'] || '');
    if (!label && a.id) label = humanize(clean(a.id));
    if (!label && a.name) label = humanize(clean(a.name));
    if (!label) label = tag.name === 'a' ? 'Lien' : 'Bouton';
    return truncate(label, 60);
  }

  function escapeAttr(text, ascii) {
    var s = String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (ascii) s = s.replace(/[^\x20-\x7e]/g, function (c) { return '&#' + c.codePointAt(0) + ';'; });
    return s;
  }

  function lineIndex(src) {
    var starts = [0];
    for (var i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
    return function (pos) {
      var lo = 0, hi = starts.length - 1;
      while (lo < hi) {
        var mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= pos) lo = mid;
        else hi = mid - 1;
      }
      return lo + 1;
    };
  }

  function indentBefore(src, lineStart) {
    var pos = lineStart - 1;
    while (pos > 0) {
      var prevStart = src.lastIndexOf('\n', pos - 1) + 1;
      var line = src.slice(prevStart, pos).replace(/\r$/, '');
      if (line.trim()) {
        var indent = /^[ \t]*/.exec(line)[0];
        if (/^\s*<head[\s>]/i.test(line)) indent += indent.indexOf('\t') >= 0 ? '\t' : '  ';
        return indent;
      }
      pos = prevStart - 1;
    }
    return '  ';
  }

  function planScript(src, events, opts) {
    if (!opts.snippet) return { status: 'off' };
    var eol = src.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
    var wanted = (/\bsrc="([^"]+)"/.exec(opts.snippet) || [])[1] || '';
    var headOpen = null, headClose = null, bodyOpen = null, bodyClose = null, htmlOpen = null;
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.type === 's' && ev.name === 'script') {
        var s = ev.attrs.src || '';
        if (/\/tag\.js\?(?:[^"'\s>]*&)?tag=[A-Za-z0-9_-]+/.test(s)) {
          var range = ev.values.src;
          if (!wanted || !range || decode(s) === wanted) return { status: 'present' };
          return { status: 'updated', previous: decode(s), edit: { start: range[0], end: range[1], text: escapeAttr(wanted) }, pos: ev.start };
        }
      }
      if (ev.type === 's' && ev.name === 'html' && !htmlOpen) htmlOpen = ev;
      if (ev.type === 's' && ev.name === 'head' && !headOpen) headOpen = ev;
      if (ev.type === 'e' && ev.name === 'head' && !headClose) headClose = ev;
      if (ev.type === 's' && ev.name === 'body' && !bodyOpen) bodyOpen = ev;
      if (ev.type === 'e' && ev.name === 'body') bodyClose = ev;
    }
    var snippet = opts.snippet;
    if (headClose) {
      var lineStart = src.lastIndexOf('\n', headClose.start - 1) + 1;
      var before = src.slice(lineStart, headClose.start);
      if (/^[ \t]*$/.test(before)) {
        return { status: 'added', where: 'head', pos: headClose.start, edit: { start: lineStart, end: lineStart, text: indentBefore(src, lineStart) + snippet + eol } };
      }
      return { status: 'added', where: 'head', pos: headClose.start, edit: { start: headClose.start, end: headClose.start, text: snippet } };
    }
    if (headOpen) return { status: 'added', where: 'head', pos: headOpen.end, edit: { start: headOpen.end, end: headOpen.end, text: snippet } };
    if (bodyOpen) return { status: 'added', where: 'body', pos: bodyOpen.start, edit: { start: bodyOpen.start, end: bodyOpen.start, text: snippet + eol } };
    if (htmlOpen) return { status: 'added', where: 'html', pos: htmlOpen.end, edit: { start: htmlOpen.end, end: htmlOpen.end, text: snippet } };
    if (bodyClose) return { status: 'added', where: 'body', pos: bodyClose.start, edit: { start: bodyClose.start, end: bodyClose.start, text: snippet + eol } };
    return { status: 'missing' };
  }

  function instrument(src, options) {
    var opts = options || {};
    var delims = delimitersFor(opts.path);
    var events = scan(src, delims);
    var anchors = {};
    var p, ev;
    for (p = 0; p < events.length; p++) {
      ev = events[p];
      if (ev.type === 's' && ev.name === 'a' && typeof ev.attrs.href === 'string' && /^#[^\s#]+$/.test(ev.attrs.href)) {
        anchors[ev.attrs.href.slice(1)] = true;
      }
    }

    var plans = [];
    var context = '';
    var sectionCount = 0;
    var inHead = false;
    for (p = 0; p < events.length; p++) {
      ev = events[p];
      if (ev.type === 'e') {
        if (ev.name === 'head') inHead = false;
        continue;
      }
      var name = ev.name;
      var a = ev.attrs;
      if (name === 'head') { inHead = true; continue; }
      if (name === 'body') { inHead = false; continue; }
      if (inHead) continue;
      if (name === 'nav') context = 'Menu';
      else if (name === 'header') context = 'En-tête';
      else if (name === 'footer') context = 'Pied de page';
      if (/^h[1-3]$/.test(name)) {
        var hr = innerRange(events, p, src);
        var ht = textOf(src.slice(hr[0], hr[1]));
        if (ht) context = truncate(ht, 40);
      }
      if ('data-no-track' in a) continue;

      if (opts.clicks !== false && isClickable(ev) && !('data-track' in a)) {
        var range = innerRange(events, p, src, CLICK_STOP);
        var inner = VOID[name] ? '' : textOf(src.slice(range[0], range[1]), true);
        plans.push({ ev: ev, attr: 'data-track', kind: 'click', label: clickLabel(ev, inner), context: context, href: a.href || '' });
      }

      if (name === 'form' && opts.forms !== false && !('data-track-form' in a)) {
        var fr = innerRange(events, p, src);
        var formId = function (value) { return humanize(value.replace(/(^|[-_])form(ulaire)?(?=[-_]|$)/ig, '$1').replace(/^[-_]+|[-_]+$/g, '')); };
        var formLabel = attr(ev, 'aria-label') || formId(attr(ev, 'name')) || formId(attr(ev, 'id')) || firstHeading(events, p, fr, src) || context || 'Formulaire';
        plans.push({ ev: ev, attr: 'data-track-form', kind: 'form', label: truncate(formLabel, 60), context: '' });
      }

      var id = attr(ev, 'id');
      var isSection = name === 'section' || name === 'footer' || (id && anchors[id] && !VOID[name] && !VIEW_DENY[name]);
      if (isSection) {
        var sr = innerRange(events, p, src);
        var sectionLabel = firstHeading(events, p, sr, src) || attr(ev, 'aria-label') || attr(ev, 'title') || (id ? humanize(id) : '') || (name === 'footer' ? 'Pied de page' : 'Section ' + (sectionCount + 1));
        sectionLabel = truncate(sectionLabel, 60);
        sectionCount++;
        if (name !== 'footer') context = truncate(sectionLabel, 40);
        if (opts.sections !== false && !('data-track-view' in a)) {
          plans.push({ ev: ev, attr: 'data-track-view', kind: 'view', label: sectionLabel, context: '' });
        }
      }

      if ((name === 'video' || name === 'audio') && opts.media !== false && !('data-track-media' in a)) {
        var mr = innerRange(events, p, src);
        var srcAttr = attr(ev, 'src');
        if (!srcAttr) {
          var sm = /<source\b[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/i.exec(src.slice(mr[0], mr[1]));
          if (sm) srcAttr = clean(sm[1]);
        }
        var fileName = srcAttr ? srcAttr.split(/[?#]/)[0].split('/').pop() : '';
        var mediaLabel = attr(ev, 'title') || attr(ev, 'aria-label') || fileName || (context ? context : name === 'video' ? 'Vidéo' : 'Audio');
        plans.push({ ev: ev, attr: 'data-track-media', kind: 'media', label: truncate(mediaLabel, 60), context: '' });
      }
    }

    dedupe(plans);

    var script = planScript(src, events, opts);
    var edits = [];
    var byPos = new Map();
    plans.forEach(function (plan) {
      var key = plan.ev.insertAt;
      var text = ' ' + plan.attr + '="' + escapeAttr(plan.label, opts.ascii) + '"';
      if (byPos.has(key)) byPos.get(key).text += text;
      else {
        var edit = { start: key, end: key, text: text };
        byPos.set(key, edit);
        edits.push(edit);
      }
    });
    if (script.edit) edits.push(script.edit);

    var sorted = edits.slice().sort(function (x, y) { return y.start - x.start; });
    var output = src;
    sorted.forEach(function (e) {
      output = output.slice(0, e.start) + e.text + output.slice(e.end);
    });

    var lineOf = lineIndex(src);
    var counts = { click: 0, form: 0, view: 0, media: 0 };
    var changes = plans.map(function (plan) {
      counts[plan.kind]++;
      return { line: lineOf(plan.ev.start), tag: plan.ev.name, attr: plan.attr, kind: plan.kind, label: plan.label };
    });
    if (script.edit) changes.push({ line: lineOf(script.pos), tag: 'script', attr: 'src', kind: 'script', label: script.status === 'updated' ? 'Script de suivi mis à jour (ancien : ' + script.previous + ')' : 'Script de suivi ajouté' });
    changes.sort(function (x, y) { return x.line - y.line; });

    return {
      output: output,
      changed: edits.length > 0,
      edits: edits.sort(function (x, y) { return x.start - y.start; }),
      changes: changes,
      counts: counts,
      script: script.status
    };
  }

  function dedupe(plans) {
    var groups = {};
    plans.forEach(function (plan) {
      var key = plan.attr + '|' + plan.label;
      (groups[key] = groups[key] || []).push(plan);
    });
    Object.keys(groups).forEach(function (key) {
      var list = groups[key];
      if (list.length < 2) return;
      var contexts = {};
      list.forEach(function (plan) { contexts[plan.context] = 1; });
      if (Object.keys(contexts).length > 1) {
        list.forEach(function (plan) {
          if (plan.context && plan.context !== plan.label) plan.label = truncate(plan.label + ' · ' + plan.context, 90);
        });
      }
      var again = {};
      list.forEach(function (plan) { (again[plan.label] = again[plan.label] || []).push(plan); });
      Object.keys(again).forEach(function (label) {
        var same = again[label];
        if (same.length < 2 || same[0].attr !== 'data-track') return;
        var targets = {};
        same.forEach(function (plan) { targets[hrefLabel(plan.href)] = 1; });
        if (Object.keys(targets).length < 2) return;
        same.forEach(function (plan) {
          var target = hrefLabel(plan.href);
          if (target && target !== plan.label) plan.label = truncate(plan.label + ' → ' + target, 100);
        });
      });
    });
  }

  var reverse1252 = null;
  function legacyEncoder() {
    if (reverse1252) return reverse1252;
    reverse1252 = new Map();
    var dec = new TextDecoder('windows-1252');
    for (var b = 0; b < 256; b++) reverse1252.set(dec.decode(new Uint8Array([b])), b);
    return reverse1252;
  }

  function declaredCharset(text) {
    var m = /<meta[^>]+charset\s*=\s*["']?\s*([A-Za-z0-9_-]+)/i.exec(text.slice(0, 4096));
    return m ? m[1].toLowerCase() : '';
  }

  function decodeBytes(bytes) {
    var bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    try {
      var text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      var cs = declaredCharset(text);
      return { text: text, encoding: 'utf-8', bom: bom, ascii: Boolean(cs && cs !== 'utf-8' && cs !== 'utf8') };
    } catch (e) {
      return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252', bom: false, ascii: true };
    }
  }

  function encodeText(text, info) {
    if (info.encoding === 'utf-8') {
      var body = new TextEncoder().encode(text);
      if (!info.bom) return body;
      var out = new Uint8Array(body.length + 3);
      out.set([0xef, 0xbb, 0xbf], 0);
      out.set(body, 3);
      return out;
    }
    var map = legacyEncoder();
    var bytes = new Uint8Array(text.length);
    for (var i = 0; i < text.length; i++) {
      var b = map.get(text[i]);
      bytes[i] = b === undefined ? 63 : b;
    }
    return bytes;
  }

  return {
    isMarkup: isMarkup,
    instrument: instrument,
    decodeBytes: decodeBytes,
    encodeText: encodeText
  };
});
