// Review tools, added to every page by `npm run review` (review/server.mjs). Select text to comment; comments live
// in the dev database and sync between reviewers every few seconds. Highlights are painted with the CSS Custom
// Highlight API, so the page's own markup (and the story's animations) stay untouched.
(function(){
"use strict";
if (window.__review) return; window.__review = true;
const API = '/__review/api/';
const PAGE = location.pathname === '/' ? '/index.html' : location.pathname;
const PAGES = { '/index.html': 'Story', '/paper.html': 'White paper' };
const KINDS = [['wording','Wording'],['numbers','Numbers'],['design','Design'],['idea','Idea'],['other','Other']];
// never indexed: the 3D scene and its hidden control panel, the paper's live diagrams, and these tools
const SKIP = '#world, #sim, #wp-simcell, .wpstage .diag, #rv-root, script, style, noscript, template';
const POLL = 8000;

const ls = { get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }, set(k,v){ try { localStorage.setItem(k,v); } catch(e){} } };
const KEY = ls.get('rv-key') || (() => { const k = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/[^A-Za-z0-9]/g,'').slice(0,32); ls.set('rv-key', k); return k; })();
let me = ls.get('rv-name') || '';
let on = ls.get('rv-on') === '1';
let S = null, err = null;                 // server state, last error
let tab = 'now', scope = 'page';          // panel: current round or Claude's notes; this page or all pages
let active = null, form = null;           // focused comment id; open inline form {type:'reply'|'edit', id}
let pending = null;                       // anchor of the selection being commented on
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
const ago = (t) => { const s = (Date.now() - new Date(t)) / 1000, f = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  return s < 45 ? 'just now' : s < 3600 ? f.format(-Math.round(s/60), 'minute') : s < 86400 ? f.format(-Math.round(s/3600), 'hour') : f.format(-Math.round(s/86400), 'day'); };

async function api(path, body, method) {
  const r = await fetch(API + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'x-review': '1', 'x-review-key': KEY, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}

// ---------------------------------------------------------------- text index
// The page's text with whitespace collapsed (and a space between blocks), mapped back to text nodes, so a quote
// can be found again and turned into a Range.
let IX = null;
const inline = new Map();
function isInline(el){ if (!inline.has(el)) inline.set(el, getComputedStyle(el).display === 'inline'); return inline.get(el); }
function buildIndex(){
  inline.clear();
  const chars = [], pn = [], po = [], nodes = [], at = new Map();
  let space = true, prevParent = null;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode(n){ const p = n.parentElement; return p && n.nodeValue && !p.closest(SKIP) ? 1 : 2; } });
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const p = n.parentElement;
    if (prevParent && p !== prevParent && !space && (!isInline(p) || !isInline(prevParent))) { chars.push(' '); pn.push(-1); po.push(0); space = true; }
    prevParent = p;
    const v = n.nodeValue, map = new Int32Array(v.length + 1), ni = nodes.length;
    for (let i = 0; i < v.length; i++) {
      map[i] = chars.length;
      if (/\s/.test(v[i])) { if (space) continue; chars.push(' '); space = true; }
      else { chars.push(v[i]); space = false; }
      pn.push(ni); po.push(i);
    }
    map[v.length] = chars.length;
    at.set(n, ni); nodes.push({ n, map });
  }
  IX = { text: chars.join(''), pn, po, nodes, at };
}
function rangeAt(s, e){
  const { pn, po, nodes } = IX;
  while (s < e && pn[s] < 0) s++;
  while (e > s && pn[e - 1] < 0) e--;
  if (s >= e) return null;
  const r = document.createRange();
  r.setStart(nodes[pn[s]].n, po[s]); r.setEnd(nodes[pn[e - 1]].n, po[e - 1] + 1);
  return r;
}
function anchorOf(range){
  if (!IX) buildIndex();
  let s = -1, e = -1;
  for (const { n, map } of IX.nodes) {
    if (!range.intersectsNode(n)) continue;
    if (s < 0) s = n === range.startContainer ? map[Math.min(range.startOffset, n.nodeValue.length)] : map[0];
    e = n === range.endContainer ? map[Math.min(range.endOffset, n.nodeValue.length)] : map[n.nodeValue.length];
  }
  if (s < 0) return null;
  const t = IX.text;
  while (s < e && t[s] === ' ') s++;
  while (e > s && t[e - 1] === ' ') e--;
  if (e - s < 2) return null;
  const c = range.commonAncestorContainer;
  return { target: 'text', quote: t.slice(s, e), prefix: t.slice(Math.max(0, s - 40), s), suffix: t.slice(e, e + 40),
    ...placeOf(blockOf(c.nodeType === 1 ? c : c.parentElement)) };
}
// best occurrence of the quote: the one whose surrounding text matches the stored context most closely
function locate(c){
  if (!c.quote || c.page !== PAGE) return null;
  const t = IX.text, hits = [];
  for (let i = t.indexOf(c.quote); i >= 0 && hits.length < 60; i = t.indexOf(c.quote, i + 1)) hits.push(i);
  if (!hits.length) return null;
  const score = (i) => { let a = 0, b = 0; const pre = c.prefix || '', suf = c.suffix || '';
    while (a < pre.length && t[i - 1 - a] === pre[pre.length - 1 - a]) a++;
    const j = i + c.quote.length; while (b < suf.length && t[j + b] === suf[b]) b++;
    return a + b; };
  const best = hits.reduce((x, y) => score(y) > score(x) ? y : x);
  return rangeAt(best, best + c.quote.length);
}

// ---------------------------------------------------------------- where on the page
// Every comment carries a CSS selector, the chapter id and the chapter's heading as readers see it; the server adds the
// file and line. Together they let Claude go straight to the spot instead of searching.
const INLINE = /^(SPAN|B|STRONG|EM|I|SMALL|A|CODE|SUB|SUP|MARK|ABBR|TIME|LABEL)$/;
function blockOf(el){ while (el && el !== document.body && INLINE.test(el.tagName) && !el.matches('[role="img"]')) el = el.parentElement; return el || document.body; }
const STATE = /^(on|in|act|cur|past|pre|go|here|now|live|still|night|armed|scrubbing|gone|wait)$/;   // classes that come and go
function selectorOf(el){
  const parts = [];
  for (let e = el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
    if (e.id) { parts.unshift('#' + CSS.escape(e.id)); break; }
    let s = e.tagName.toLowerCase();
    const cls = [...e.classList].filter((c) => !STATE.test(c) && !c.startsWith('rv-')).slice(0, 2);
    if (cls.length) s += '.' + cls.map((c) => CSS.escape(c)).join('.');
    const same = e.parentElement ? [...e.parentElement.children].filter((x) => x.tagName === e.tagName) : [];
    if (same.length > 1) s += `:nth-of-type(${same.indexOf(e) + 1})`;
    parts.unshift(s);
  }
  return parts.join(' > ');
}
function placeOf(el){
  const sec = el.closest('section[id]'), det = el.closest('details');
  const txt = (x) => x ? x.textContent.replace(/\s+/g, ' ').trim() : '';
  const heading = sec ? [txt(sec.querySelector('.eyebrow')), txt(sec.querySelector('h1, h2'))].filter(Boolean).join(' — ') : '';
  return { selector: selectorOf(el), section: sec ? sec.id : '', heading: (heading + (det ? ' › ' + txt(det.querySelector('summary')) : '')).slice(0, 300) };
}
// images, video, charts and diagrams (role="img"), and the paper's live simulation view; not the story's backdrop
const MEDIA = 'img, video, canvas, svg[role="img"], [role="img"]';
function mediaOf(el){ const m = el && el.closest && el.closest(MEDIA); return m && !root.contains(m) && !m.closest('#world') ? m : null; }
const clean = (t, n) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, n);
function srcOf(m){
  const cs = getComputedStyle(m), u = /url\(["']?([^"')]+)/.exec(cs.webkitMaskImage || cs.maskImage || '') || /url\(["']?([^"')]+)/.exec(cs.backgroundImage || '');
  let src = m.currentSrc || m.getAttribute('src') || m.getAttribute('poster') || (u && u[1]) || '';
  try { if (src) src = new URL(src, location.href).pathname.replace(/^\//, ''); } catch(e){}
  return src;
}
function anchorOfElement(el){
  const m = mediaOf(el);
  if (m) {
    const fig = m.closest('figure'), src = srcOf(m);
    const alt = clean(m.getAttribute('alt') || m.getAttribute('aria-label') || (fig && fig.querySelector('figcaption') ? fig.querySelector('figcaption').textContent : ''), 400);
    const label = m.tagName === 'CANVAS' ? 'Live simulation view' : alt || src || m.tagName.toLowerCase();
    return { target: src ? 'image' : 'element', src, alt, quote: clean(label, 300), ...placeOf(m) };
  }
  const b = blockOf(el);
  return { target: 'element', alt: clean(b.getAttribute('aria-label'), 400), quote: clean(b.innerText || b.getAttribute('aria-label') || b.tagName.toLowerCase(), 300), ...placeOf(b) };
}
function anchorOfScene(sec){
  return { target: 'scene', shot: sec.dataset.shot, ...placeOf(sec), selector: '#' + sec.id, quote: `3D scene in the "${sec.dataset.name || sec.id}" chapter` };
}

// ---------------------------------------------------------------- highlights
const HL = typeof Highlight === 'function' && window.CSS && CSS.highlights;
const ranges = new Map();          // comment id → Range, for text comments found on this page
const els = new Map();             // comment id → element, for image, element and scene comments found on this page
function findEl(c){
  if (c.page !== PAGE) return null;
  if (c.target === 'scene') return document.getElementById(c.section);
  let el = null; try { el = c.selector ? document.querySelector(c.selector) : null; } catch(e){}
  if (c.target === 'image' && c.src && !(el && srcOf(el) === c.src)) {     // the page moved on: find the image by its file
    const all = [...document.querySelectorAll(MEDIA)].filter((x) => !x.closest('#world') && srcOf(x) === c.src);
    el = all.find((x) => clean(x.getAttribute('alt') || x.getAttribute('aria-label'), 400) === c.alt) || all[0] || null;
  }
  return el;
}
function paint(){
  ranges.clear(); els.clear();
  document.querySelectorAll('[data-rv]').forEach((e) => e.removeAttribute('data-rv'));
  if (!S) return;
  if (!IX) buildIndex();
  for (const c of S.comments) if (!c.parent_id) {
    if ((c.target || 'text') === 'text') { const r = locate(c); if (r) ranges.set(String(c.id), r); }
    else { const el = findEl(c); if (el) els.set(String(c.id), el); }
  }
  const shown = (c) => on && !c.parent_id && (tab === 'now' ? c.round_id === S.round.id : S.previous && c.round_id === S.previous.id);
  // images and blocks get a box drawn in this layer (an outline on the element itself would be greyed by a filter
  // or cut away by a CSS mask, as on the portraits and logos); data-rv on the element makes a click open the comment
  marks.length = 0; markLayer.textContent = '';
  for (const c of S.comments) {
    const el = els.get(String(c.id));
    if (!el || c.target === 'scene' || !shown(c)) continue;
    el.setAttribute('data-rv', c.id);
    const box = document.createElement('i'); box.className = 'rv-mark' + (active === String(c.id) ? ' act' : '');
    box.style.borderRadius = getComputedStyle(el).borderRadius;
    markLayer.appendChild(box); marks.push([el, box]);
  }
  drawMarks();
  if (!HL) return;
  CSS.highlights.set('rv-mark', new Highlight(...S.comments.filter((c) => shown(c) && ranges.has(String(c.id))).map((c) => ranges.get(String(c.id)))));
  CSS.highlights.set('rv-active', new Highlight(...(on && active && ranges.has(active) ? [ranges.get(active)] : [])));
}
// keep each box on its element: the story moves and fades blocks as it scrolls, so follow them every frame
const marks = [];
function drawMarks(){
  for (const [el, box] of marks) {
    const r = el.getBoundingClientRect();
    box.hidden = !r.width || r.bottom < 0 || r.top > innerHeight;
    if (!box.hidden) box.style.transform = `translate(${r.left - 4}px,${r.top - 4}px)`, box.style.width = r.width + 8 + 'px', box.style.height = r.height + 8 + 'px';
  }
}
(function follow(){ if (on && marks.length) drawMarks(); requestAnimationFrame(follow); })();
let reindexT = 0;
new MutationObserver((ms) => {
  if (ms.every((m) => { const el = m.target.nodeType === 1 ? m.target : m.target.parentElement; return !el || el.closest(SKIP); })) return;
  clearTimeout(reindexT); reindexT = setTimeout(() => { buildIndex(); paint(); }, 400);
}).observe(document.body, { childList: true, characterData: true, subtree: true });

// ---------------------------------------------------------------- UI
const root = document.createElement('div'); root.id = 'rv-root'; root.setAttribute('translate', 'no');
root.innerHTML = `<button type="button" class="rv-toggle" aria-pressed="false"><i></i><span>Review</span><b hidden></b></button>
  <button type="button" class="rv-bubble" hidden>Comment</button>
  <button type="button" class="rv-chip" hidden>Comment on image</button>
  <div class="rv-pickbox" hidden><span></span></div>
  <div class="rv-marks"></div>
  <form class="rv-composer" hidden><p class="rv-q"></p><textarea rows="4" placeholder="Your comment" required></textarea>
    <div class="rv-kinds">${KINDS.map(([k, l], i) => `<label><input type="radio" name="rv-kind" value="${k}"${i ? '' : ' checked'}><span>${l}</span></label>`).join('')}</div>
    <div class="rv-row"><input class="rv-name" placeholder="Your name (blank: anonymous)" maxlength="60"><button type="button" class="rv-ghost" data-a="cancel">Cancel</button><button class="rv-primary">Save</button></div></form>
  <div class="rv-panel" role="complementary" hidden aria-label="Review comments"></div>
  <div class="rv-toast" hidden></div>`;
document.body.appendChild(root);
const $ = (s) => root.querySelector(s);
const toggle = $('.rv-toggle'), bubble = $('.rv-bubble'), composer = $('.rv-composer'), panel = $('.rv-panel'), toast = $('.rv-toast');
const chip = $('.rv-chip'), pickbox = $('.rv-pickbox'), markLayer = $('.rv-marks');
let toastT = 0;
function say(msg, bad){ toast.textContent = msg; toast.className = 'rv-toast' + (bad ? ' bad' : ''); toast.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => toast.hidden = true, 4200); }

function setOn(v){
  on = v; ls.set('rv-on', v ? '1' : '0');
  toggle.setAttribute('aria-pressed', String(v)); toggle.classList.toggle('on', v);
  panel.hidden = !v; document.documentElement.classList.toggle('rv-open', v);
  if (!v) { bubble.hidden = true; composer.hidden = true; chip.hidden = true; stopPick(); }
  if (v) refresh(); else paint();
}
toggle.addEventListener('click', () => setOn(!on));

// selection → "Comment" bubble → composer
document.addEventListener('selectionchange', () => {
  if (!on || !composer.hidden) return;
  const sel = getSelection();
  if (!sel.rangeCount || sel.isCollapsed || root.contains(sel.anchorNode)) { bubble.hidden = true; return; }
  const r = sel.getRangeAt(0), box = r.getBoundingClientRect();
  if (!box.width && !box.height) { bubble.hidden = true; return; }
  bubble.style.left = Math.min(innerWidth - 110, Math.max(8, box.right - 40)) + 'px';
  bubble.style.top = Math.min(innerHeight - 44, box.bottom + 8) + 'px';
  bubble.hidden = false;
});
bubble.addEventListener('mousedown', (e) => e.preventDefault());   // keep the selection
bubble.addEventListener('click', () => {
  const sel = getSelection(); if (!sel.rangeCount) return;
  const a = anchorOf(sel.getRangeAt(0));
  if (!a) return say('Select some text on the page to comment on.', true);
  if (a.quote.length > 2000) return say('That is a lot of text: select a sentence or a paragraph.', true);
  bubble.hidden = true; openComposer(a, sel.getRangeAt(0).getBoundingClientRect());
});
const TARGET = { image: 'Image', element: 'Element', scene: '3D scene' };
function openComposer(a, box){
  pending = a;
  const label = a.target === 'text' ? a.quote : `${TARGET[a.target]}: ${a.quote}${a.src ? ' (' + a.src + ')' : ''}`;
  composer.querySelector('.rv-q').textContent = label.length > 220 ? label.slice(0, 220) + '…' : label;
  composer.querySelector('.rv-q').classList.toggle('obj', a.target !== 'text');
  composer.querySelector('.rv-name').value = me;
  if (a.target === 'image' || a.target === 'scene') composer.querySelector(`input[value="design"]`).checked = true;
  const w = Math.min(360, innerWidth - 16);
  composer.style.width = w + 'px';
  composer.style.left = Math.min(innerWidth - w - 8, Math.max(8, box.left)) + 'px';
  composer.style.top = Math.max(8, Math.min(innerHeight - 330, box.bottom + 10)) + 'px';
  toast.hidden = true; composer.hidden = false; composer.querySelector('textarea').focus();
}

// images: a "Comment on image" chip on hover
let chipFor = null;
document.addEventListener('mousemove', (e) => {
  if (!on || picking || !composer.hidden || e.target === chip) return;
  const m = mediaOf(e.target);
  if (m === chipFor) return;
  chipFor = m; chip.hidden = !m;
  if (!m) return;
  const r = m.getBoundingClientRect();
  chip.textContent = m.tagName === 'CANVAS' ? 'Comment on this view' : srcOf(m) ? 'Comment on image' : 'Comment on chart';
  chip.style.left = Math.max(8, Math.min(innerWidth - 170, r.right - 160)) + 'px';
  chip.style.top = Math.max(60, Math.min(innerHeight - 40, r.top + 8)) + 'px';
}, { passive: true });
chip.addEventListener('click', () => { if (!chipFor) return; const m = chipFor; chip.hidden = true; chipFor = null; openComposer(anchorOfElement(m), m.getBoundingClientRect()); });

// "Point at…": anything on the page; on the story, an empty part of a chapter means its 3D scene
let picking = false, picked = null;
function pickAt(x, y){
  const el = document.elementFromPoint(x, y);
  if (!el || root.contains(el)) return null;
  const sc = el.closest('.sc[data-shot]');
  if (sc && document.getElementById('world') && (el === sc || el.matches('.sc > .wrap'))) return { scene: sc };
  if (el === document.body || el === document.documentElement || el.tagName === 'MAIN') return null;
  return { el: mediaOf(el) || blockOf(el) };
}
function startPick(){ picking = true; document.documentElement.classList.add('rv-picking'); bubble.hidden = true; chip.hidden = true;
  say('Click an image, chart, card or any block. On the story, click an empty part of a chapter to comment on its 3D scene. Esc cancels.'); }
function stopPick(){ if (picking) toast.hidden = true; picking = false; picked = null; pickbox.hidden = true; document.documentElement.classList.remove('rv-picking'); }
document.addEventListener('mousemove', (e) => {
  if (!picking) return;
  picked = pickAt(e.clientX, e.clientY);
  if (!picked) { pickbox.hidden = true; return; }
  const r = picked.scene ? { left: 6, top: 6, width: innerWidth - 12 - (document.documentElement.classList.contains('rv-open') && innerWidth >= 1100 ? 380 : 0), height: innerHeight - 12 } : picked.el.getBoundingClientRect();
  Object.assign(pickbox.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  pickbox.querySelector('span').textContent = picked.scene ? `3D scene · ${picked.scene.dataset.name}` : (mediaOf(picked.el) ? (srcOf(picked.el) ? 'Image' : 'Chart / view') : picked.el.tagName.toLowerCase() + (picked.el.classList[0] ? '.' + picked.el.classList[0] : ''));
  pickbox.classList.toggle('scene', !!picked.scene); pickbox.hidden = false;
}, { passive: true });
document.addEventListener('click', (e) => {
  if (!picking || root.contains(e.target)) return;
  e.preventDefault(); e.stopPropagation();
  const p = pickAt(e.clientX, e.clientY); stopPick();
  if (!p) return;
  openComposer(p.scene ? anchorOfScene(p.scene) : anchorOfElement(p.el), p.scene ? { left: e.clientX, bottom: e.clientY } : p.el.getBoundingClientRect());
}, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && picking) stopPick(); });
function closeComposer(){ composer.hidden = true; composer.reset(); pending = null; }
composer.addEventListener('click', (e) => { if (e.target.dataset.a === 'cancel') closeComposer(); });
composer.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeComposer();
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) composer.requestSubmit();
});
composer.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = composer.querySelector('textarea').value.trim(); if (!body || !pending) return;
  me = composer.querySelector('.rv-name').value.trim(); ls.set('rv-name', me);
  const btn = composer.querySelector('.rv-primary'); btn.disabled = true;
  try {
    const r = await api('comments', { ...pending, page: PAGE, body, kind: composer.querySelector('input[name=rv-kind]:checked').value, author: me || null });
    closeComposer(); getSelection().removeAllRanges(); tab = 'now'; active = String(r.id);
    await refresh(); say('Comment saved.');
  } catch (x) { say(x.message, true); } finally { btn.disabled = false; }
});

// click on highlighted text: open its comment
document.addEventListener('click', (e) => {
  if (!on || picking || root.contains(e.target) || !getSelection().isCollapsed) return;
  const marked = e.target.closest && e.target.closest('[data-rv]');
  if (marked) { focusComment(marked.getAttribute('data-rv'), false); return; }
  const pos = document.caretPositionFromPoint ? document.caretPositionFromPoint(e.clientX, e.clientY) : null;
  const cr = pos ? null : document.caretRangeFromPoint && document.caretRangeFromPoint(e.clientX, e.clientY);
  const node = pos ? pos.offsetNode : cr && cr.startContainer, off = pos ? pos.offset : cr && cr.startOffset;
  if (!node || node.nodeType !== 3) return;
  for (const [id, r] of ranges) if (r.isPointInRange(node, off) && !(r.endContainer === node && r.endOffset === off)) { focusComment(id, false); break; }
});

function focusComment(id, scroll){
  active = String(id);
  const c = S && S.comments.find((x) => String(x.id) === active);
  if (c && (c.round_id !== S.round.id) !== (tab === 'prev')) tab = c.round_id === S.round.id ? 'now' : 'prev';
  render(); paint();
  const card = panel.querySelector(`[data-id="${active}"]`); if (card) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  const r = ranges.get(active), el = els.get(active);
  if (scroll && (r || el)) {
    const from = r ? r.startContainer.parentElement : el;
    for (let d = from && from.closest('details:not([open])'); d; d = d.parentElement && d.parentElement.closest('details:not([open])')) d.open = true;
    const box = (r || el).getBoundingClientRect();
    scrollTo({ top: scrollY + box.top - (c && c.target === 'scene' ? 60 : innerHeight * 0.35), behavior: 'smooth' });
  }
}

// ---------------------------------------------------------------- panel
const kindName = (k) => (KINDS.find((x) => x[0] === k) || KINDS[4])[1];
function card(c, prev){
  const id = String(c.id), replies = S.comments.filter((x) => String(x.parent_id) === id);
  const found = ranges.has(id) || els.has(id), here = c.page === PAGE, t = c.target || 'text', q = c.quote || '';
  const gone = t === 'text' ? 'text changed' : 'no longer on the page';
  const editing = form && form.type === 'edit' && form.id === id, replying = form && form.type === 'reply' && form.id === id;
  return `<div class="rv-card${active === id ? ' act' : ''}${prev && c.result ? ' ' + c.result : ''}" data-id="${id}">
    <div class="rv-meta"><span class="rv-kind">${esc(kindName(c.kind))}</span><b>${esc(c.author || 'Anonymous')}</b><time>${ago(c.created_at)}${c.updated_at ? ' · edited' : ''}</time></div>
    <button type="button" class="rv-quote${t === 'text' ? '' : ' obj'}" data-a="go" ${here && found ? '' : here ? `disabled title="${gone}"` : ''}>${here ? '' : `<em>${esc(PAGES[c.page] || c.page)}</em> `}${t === 'text' ? '' : `<em>${TARGET[t]}</em> `}${esc(q.length > 160 ? q.slice(0, 160) + '…' : q)}${here && !found ? ` <em>(${gone})</em>` : ''}</button>
    <p class="rv-where" title="${esc(c.selector || '')}">${esc(c.source_file || (c.page || '').replace(/^\//, ''))}${c.source_line ? ':' + c.source_line : ''}${c.src ? ' · ' + esc(c.src) : ''}${c.heading ? ' · ' + esc(c.heading.length > 60 ? c.heading.slice(0, 60) + '…' : c.heading) : ''}</p>
    ${editing ? `<form class="rv-inline" data-a="save-edit"><textarea rows="3">${esc(c.body)}</textarea><div class="rv-row"><button type="button" class="rv-ghost" data-a="cancel-form">Cancel</button><button class="rv-primary">Save</button></div></form>`
      : `<p class="rv-body">${esc(c.body)}</p>`}
    ${prev && c.result ? `<p class="rv-note"><b>${c.result === 'done' ? '✓ Done' : '✗ Not done'}</b>${c.note ? ' · ' + esc(c.note) : ''}</p>` : prev && S.previous.status === 'applied' ? '<p class="rv-note"><b>No answer from Claude</b></p>' : ''}
    ${replies.map((r) => `<div class="rv-reply"><b>${esc(r.author || 'Anonymous')}</b> ${esc(r.body)}${r.mine && !prev ? ` <button type="button" class="rv-link" data-a="del" data-id="${r.id}">delete</button>` : ''}</div>`).join('')}
    ${replying ? `<form class="rv-inline" data-a="save-reply"><textarea rows="2" placeholder="Reply"></textarea><div class="rv-row"><button type="button" class="rv-ghost" data-a="cancel-form">Cancel</button><button class="rv-primary">Reply</button></div></form>` : ''}
    ${prev ? '' : `<div class="rv-acts"><button type="button" class="rv-link" data-a="reply">Reply</button>${c.mine ? '<button type="button" class="rv-link" data-a="edit">Edit</button><button type="button" class="rv-link" data-a="del">Delete</button>' : ''}</div>`}
  </div>`;
}
function render(){
  if (!on) return;
  if (form && panel.contains(document.activeElement) && document.activeElement.tagName === 'TEXTAREA') return;   // don't wipe what someone is typing
  if (err && !S) { panel.innerHTML = `<div class="rv-head"><h2>Review</h2><button type="button" class="rv-x" data-a="close" aria-label="Close">×</button></div><p class="rv-err">${esc(err)}</p>`; return; }
  if (!S) { panel.innerHTML = '<p class="rv-empty">Loading…</p>'; return; }
  const R = S.round, P = S.previous, prev = tab === 'prev' && P;
  const mineRound = S.comments.filter((c) => !c.parent_id && c.round_id === (prev ? P.id : R.id));
  const list = mineRound.filter((c) => scope === 'all' || c.page === PAGE);
  const fin = S.finished, done = me && fin.includes(me);
  // Claude has pushed once the branch tip on GitHub moves past where it was when the round was sent
  const g = S.git, pushed = P && P.status === 'sent' && g.remote && g.remote !== (P.branch_head || g.head), pulled = pushed && g.head === g.remote;
  const notes = [];
  if (g.branch && g.branch !== g.target) notes.push(`<p class="rv-warn">You are on <code>${esc(g.branch)}</code>. Claude works on <code>${esc(g.target)}</code>: switch with <code>git checkout ${esc(g.target)}</code>.</p>`);
  if (P && P.status === 'sent') notes.push(pulled
    ? `<p class="rv-warn"><b>Round ${P.id}:</b> Claude pushed, but without its notes file (review/results/round-${P.id}.json).${P.session_url ? ` <a href="${esc(P.session_url)}" target="_blank" rel="noopener">Open the session ↗</a> to see what happened.` : ''}</p>`
    : pushed
    ? `<p class="rv-ok"><b>Round ${P.id}: Claude has pushed.</b> Run <code>git pull</code>, then reload this page to see the changes and Claude's notes.</p>`
    : `<p class="rv-info"><b>Round ${P.id} is with Claude</b> (sent by ${esc(P.sent_by)} ${ago(P.sent_at)}).${P.session_url ? ` <a href="${esc(P.session_url)}" target="_blank" rel="noopener">Watch the session ↗</a>` : ''} This page tells you when the changes are on GitHub.</p>`);
  if (S.ingestError) notes.push(`<p class="rv-warn">${esc(S.ingestError)}</p>`);
  if (err) notes.push(`<p class="rv-warn">${esc(err)}</p>`);
  panel.innerHTML = `<div class="rv-head"><h2>Review <span>round ${R.id}</span></h2><button type="button" class="rv-x" data-a="close" aria-label="Close review">×</button></div>
    <div class="rv-me"><label>You <input class="rv-name" value="${esc(me)}" placeholder="name (blank: anonymous)" maxlength="60"></label><button type="button" class="rv-ghost rv-point" data-a="point" title="Comment on an image, chart, card or the 3D scene">⌖ Point at…</button></div>
    ${notes.join('')}
    <div class="rv-tabs"><button type="button" data-a="tab" data-v="now" aria-pressed="${!prev}">Round ${R.id} · ${S.comments.filter((c) => !c.parent_id && c.round_id === R.id).length}</button>${P ? `<button type="button" data-a="tab" data-v="prev" aria-pressed="${!!prev}">Round ${P.id}: ${P.status === 'applied' ? "Claude's notes" : 'sent'}</button>` : ''}
      <span></span><button type="button" data-a="scope" aria-pressed="${scope === 'all'}" title="Show comments from every page">All pages</button></div>
    ${prev && P.summary ? `<p class="rv-sum"><b>Claude:</b> ${esc(P.summary)}</p>` : ''}
    <div class="rv-list">${list.length ? list.map((c) => card(c, !!prev)).join('') : `<p class="rv-empty">${prev ? 'No comments on this page in that round.' : `No comments ${scope === 'all' ? 'yet' : 'on this page yet'}. Select any text on the page and press <b>Comment</b>.`}</p>`}</div>
    ${prev ? '' : `<div class="rv-foot">
      <p class="rv-fin">${fin.length ? `Done reviewing: ${fin.map(esc).join(', ')}` : 'Nobody has marked this round done yet.'}</p>
      <div class="rv-row"><button type="button" class="rv-ghost" data-a="done" aria-pressed="${!!done}">${done ? '✓ I’m done' : 'I’m done with this round'}</button><button type="button" class="rv-ghost" data-a="md" title="Copy every comment in this round as Markdown">Copy as Markdown</button></div>
      <button type="button" class="rv-primary rv-send" data-a="send" ${S.canSend && mineRound.length ? '' : 'disabled'} title="${S.canSend ? '' : 'Not set up on this computer: see docs/claude-review-task.md'}">Make the changes (${mineRound.length})</button>
      ${S.canSend ? '' : '<p class="rv-fine">"Make the changes" needs the cloud task set up on this computer: docs/claude-review-task.md</p>'}
    </div>`}`;
  const n = S.comments.filter((c) => !c.parent_id && c.round_id === R.id).length, b = toggle.querySelector('b');
  b.hidden = !n; b.textContent = n;
}

panel.addEventListener('change', (e) => { if (e.target.classList.contains('rv-name')) { me = e.target.value.trim(); ls.set('rv-name', me); render(); } });
panel.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, text = f.querySelector('textarea').value.trim(), id = f.closest('[data-id]').dataset.id;
  if (!text) return;
  try {
    if (f.dataset.a === 'save-edit') await api('comments/' + id, { body: text }, 'PATCH');
    else await api('comments', { parent_id: id, body: text, author: me || null });
    form = null; await refresh();
  } catch (x) { say(x.message, true); }
});
panel.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-a]'); if (!b || b.tagName === 'FORM') return;
  const a = b.dataset.a, id = (b.dataset.id) || (b.closest('[data-id]') || {}).dataset && b.closest('[data-id]').dataset.id;
  try {
    if (a === 'close') setOn(false);
    else if (a === 'point') startPick();
    else if (a === 'tab') { tab = b.dataset.v; active = null; render(); paint(); }
    else if (a === 'scope') { scope = scope === 'all' ? 'page' : 'all'; render(); }
    else if (a === 'go') {
      const c = S.comments.find((x) => String(x.id) === id);
      if (c.page !== PAGE) { location.href = (c.page === '/index.html' ? '/' : c.page) + '#rv-' + id; return; }
      focusComment(id, true);
    }
    else if (a === 'reply' || a === 'edit') { form = { type: a, id }; active = id; render(); const t = panel.querySelector('.rv-inline textarea'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }
    else if (a === 'cancel-form') { form = null; render(); }
    else if (a === 'del') { if (confirm('Delete this comment?')) { await api('comments/' + id, { delete: true }, 'PATCH'); await refresh(); } }
    else if (a === 'done') {
      if (!me) { const n = prompt('Your name, so the others know you are done:'); if (!n || !n.trim()) return; me = n.trim(); ls.set('rv-name', me); }
      await api('finish', { name: me, done: b.getAttribute('aria-pressed') !== 'true' }); await refresh();
    }
    else if (a === 'md') { await navigator.clipboard.writeText(markdown()); say('Copied this round as Markdown.'); }
    else if (a === 'send') {
      const n = S.comments.filter((c) => !c.parent_id && c.round_id === S.round.id).length;
      if (!confirm(`Send all ${n} comments in round ${S.round.id} to Claude?\n\nClaude edits the site in the cloud and pushes to ${S.git.target}. New comments go into round ${S.round.id + 1}.`)) return;
      b.disabled = true; b.textContent = 'Starting Claude…';
      const r = await api('send', { name: me || null });
      say(`Round ${r.round} sent: ${r.sent} comments${r.moved ? `, ${r.moved} too many moved to round ${r.next}` : ''}.`);
      if (r.session_url) window.open(r.session_url, '_blank', 'noopener');
      tab = 'now'; await refresh();
    }
  } catch (x) { say(x.message, true); render(); }
});

function markdown(){
  const R = S.round, top = S.comments.filter((c) => !c.parent_id && c.round_id === R.id);
  const out = [`# Review round ${R.id}`, '', `${top.length} comments · copied ${new Date().toLocaleString()}`];
  for (const [page, label] of Object.entries(PAGES).concat([['', 'Other']])) {
    const cs = top.filter((c) => page ? c.page === page : !PAGES[c.page]);
    if (!cs.length) continue;
    out.push('', `## ${label}`);
    for (const c of cs) {
      const t = c.target || 'text', where = `${c.source_file || c.page.replace(/^\//, '')}${c.source_line ? ':' + c.source_line : ''}`;
      out.push('', `- **${kindName(c.kind)}** · ${c.author || 'Anonymous'} · \`${where}\`${c.heading ? ` · _${c.heading}_` : ''}`,
        `  > ${t === 'text' ? '' : TARGET[t] + ': '}${(c.quote || '').replace(/\n/g, ' ')}${c.src ? ` (${c.src})` : ''}`, '', `  ${c.body.replace(/\n/g, '\n  ')}`);
      for (const r of S.comments.filter((x) => String(x.parent_id) === String(c.id))) out.push(`  - ${r.author || 'Anonymous'}: ${r.body.replace(/\n/g, ' ')}`);
    }
  }
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------- sync
let busy = false;
async function refresh(){
  if (busy) return; busy = true;
  try { S = await api('state'); err = null; }
  catch (x) { err = x.message; }
  finally { busy = false; }
  if (S && !S.previous && tab === 'prev') tab = 'now';
  paint(); render();
}
setInterval(() => { if (on && !document.hidden) refresh(); }, POLL);
document.addEventListener('visibilitychange', () => { if (on && !document.hidden) refresh(); });
addEventListener('load', () => { buildIndex(); paint(); });
document.addEventListener('toggle', () => paint(), true);    // a <details> opened: its comments can be highlighted now

// arriving from a link in the panel (#rv-<id>): open review mode on that comment
const m = location.hash.match(/^#rv-(\d+)$/);
if (m) { on = true; history.replaceState(null, '', location.pathname + location.search); }
setOn(on);
if (m) refresh().then(() => setTimeout(() => focusComment(m[1], true), 300));
})();
