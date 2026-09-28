'use strict';
/* =====================================================================
   AURORA v2 — screens
   The data layer (model.js, store.js, cloud-*.js) is the same one 07.1
   uses, untouched. This file only draws it and edits it.
   Layout rule: every tab = fixed head + one scrolling area (or none).
   ===================================================================== */

let currentTab = 'home', currentSpace = null, spaceFilter = 'all', boardFilter = 'all';
let homeEdit = false;                       // read by cloud-sync.js
const wide = () => matchMedia('(min-width:900px)').matches;
const icon = (id, cls = 'ico') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l4 4 10-10"/></svg>';
const wait = ms => new Promise(r => setTimeout(r, ms));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const DAYS1 = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* ---------- dot-matrix digits ---------- */
const FONT = {
  0: ['01110','10001','10011','10101','11001','10001','01110'], 1: ['00100','01100','00100','00100','00100','00100','01110'],
  2: ['01110','10001','00001','00010','00100','01000','11111'], 3: ['11110','00001','00001','01110','00001','00001','11110'],
  4: ['00010','00110','01010','10010','11111','00010','00010'], 5: ['11111','10000','11110','00001','00001','10001','01110'],
  6: ['00110','01000','10000','11110','10001','10001','01110'], 7: ['11111','00001','00010','00100','01000','01000','01000'],
  8: ['01110','10001','10001','01110','10001','10001','01110'], 9: ['01110','10001','10001','01111','00001','00010','01100'],
};
function dm(n, size = 5, gap = 2) {
  const s = String(Math.max(0, Math.min(99, Math.round(n || 0)))).padStart(2, '0');
  return `<span class="dm" style="--ds:${size}px;--dgap:${gap}px;--dg:${size + 1}px" aria-label="${Number(s)}">${[...s].map(ch =>
    `<i>${FONT[ch].join('').split('').map(b => `<b${b === '1' ? ' class="on"' : ''}></b>`).join('')}</i>`).join('')}</span>`;
}

/* ---------- look ---------- */
function themeDark() {
  const t = S.settings.theme || 'dark';
  return t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme:dark)').matches);
}
let bgToken = 0;
function applyLook() {
  const dark = themeDark(), root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  const dim = typeof S.settings.v2dim === 'number' ? S.settings.v2dim : (dark ? .34 : 0);
  root.style.setProperty('--wall-veil', dark ? `linear-gradient(rgba(14,10,8,${dim}),rgba(14,10,8,${Math.min(.92, dim + .24)}))` : `linear-gradient(rgba(243,236,225,${dim}),rgba(243,236,225,${Math.min(.9, dim + .1)}))`);
  const my = ++bgToken;
  if (S.settings.bg?.img) imageUrl(S.settings.bg.img).then(u => { if (my === bgToken) u ? root.style.setProperty('--wall', `url(${u})`) : root.style.removeProperty('--wall'); });
  else root.style.removeProperty('--wall');
  const dr = document.getElementById('setDim'); if (dr && document.activeElement !== dr) dr.value = String(Math.round(dim * 100));
  const rb = document.getElementById('bgReset'); if (rb) rb.hidden = !S.settings.bg?.img;
  const c = dark ? '#1a110e' : '#efe4d6';
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = c;
  try { localStorage.setItem('aurora-chrome-colour', c); localStorage.setItem('aurora-boot-theme', dark ? 'dark' : 'light'); } catch (e) {}
  $$('#modes button').forEach(b => b.setAttribute('aria-pressed', String((S.settings.theme || 'dark') === b.dataset.mode)));
}
matchMedia('(prefers-color-scheme:dark)').addEventListener('change', () => { if (S.settings.theme === 'system') applyLook(); });

/* =====================================================================
   NAVIGATION
   ===================================================================== */
function showTab(tab, opts = {}) {
  if (homeEdit) exitEdit();
  if (tab === 'spaces' && currentTab === 'spaces' && !opts.space) currentSpace = null;
  if (opts.space !== undefined) currentSpace = opts.space;
  const changed = tab !== currentTab;
  currentTab = tab;
  for (const s of $$('.tab')) s.hidden = s.id !== tab;
  syncDetailMode();
  for (const b of $$('#nav button')) b.toggleAttribute('aria-current', b.dataset.tab === tab), b.dataset.tab === tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current');
  render();
  if (changed) { const el = $('#' + tab); el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); }
}

/* =====================================================================
   RENDER
   ===================================================================== */
function render() {
  try {
    if (currentTab === 'home') renderHome();
    else if (currentTab === 'spaces') renderSpaces();
    else if (currentTab === 'board') renderBoard();
    else if (currentTab === 'todo') renderTodo();
    else if (currentTab === 'settings') renderSettings();
  } catch (e) { console.error('render', e); }
}

/* =====================================================================
   HOME — fixed head, fixed widget area, never scrolls
   ===================================================================== */
const WIDGETS = {
  today:   { name: 'Today' },
  spaces:  { name: 'Spaces' },
  rhythm:  { name: 'Rhythm' },
  next:    { name: 'Next up' },
  moments: { name: 'Moments' },
  week:    { name: 'Your week' },
};
const DEFAULT_W = [
  { id: 'today', size: 'L' }, { id: 'spaces', size: 'M' }, { id: 'next', size: 'S' },
  { id: 'moments', size: 'S' }, { id: 'rhythm', size: 'S', off: true }, { id: 'week', size: 'M', off: true },
];
const SPAN = { S: [1, 1], M: [2, 1], L: [2, 2] };
function wconf() {
  let w = Array.isArray(S.settings.v2w) ? S.settings.v2w.filter(x => WIDGETS[x.id] && SPAN[x.size]) : [];
  for (const d of DEFAULT_W) if (!w.some(x => x.id === d.id)) w.push({ ...d });
  return w;
}
function saveW(w) { S.settings.v2w = w; touch(S.settings); }
/* Place widgets into the grid in order; whatever does not fit is not shown. */
function pack(list) {
  const cols = wide() ? 4 : 2, rows = wide() ? 2 : 3;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(false));
  const placed = [], left = [];
  for (const w of list) {
    if (w.off) { left.push(w); continue; }
    const [sw, sh] = SPAN[w.size]; let spot = null;
    for (let r = 0; r <= rows - sh && !spot; r++) for (let c = 0; c <= cols - sw && !spot; c++) {
      let ok = true;
      for (let y = r; y < r + sh && ok; y++) for (let x = c; x < c + sw; x++) if (grid[y][x]) { ok = false; break; }
      if (ok) spot = { r, c };
    }
    if (!spot) { left.push(w); continue; }
    for (let y = spot.r; y < spot.r + sh; y++) for (let x = spot.c; x < spot.c + sw; x++) grid[y][x] = true;
    placed.push({ ...w, r: spot.r + 1, c: spot.c + 1, sw, sh });
  }
  return { placed, left };
}
const fits = list => pack(list.filter(x => !x.off)).left.length === 0;

/* today: the three you picked, then habits, then open tasks */
function todayList() {
  const k = dkey(), out = [], seen = new Set();
  const push = (type, id) => {
    const key = type + id; if (seen.has(key)) return; seen.add(key);
    if (type === 'task') { const t = live(S.tasks).find(x => x.id === id); if (t && !t.done) out.push({ type, id, text: t.text, space: t.space }); }
    else { const h = activeHabits().find(x => x.id === id); if (h && !isChecked(h.id, k) && !isSkipped(h.id, k)) out.push({ type, id, text: h.name, space: h.space }); }
  };
  const three = S.settings.three?.k === k ? S.settings.three.ids || [] : [];
  for (const x of three) push(x.type, x.id);
  for (const h of activeHabits()) if (spaceById(h.space)?.type === 'personal') push('habit', h.id);
  for (const t of live(S.tasks).filter(t => !t.done).sort((a, b) => (a.c || a.u) - (b.c || b.u))) push('task', t.id);
  return { list: out, picked: three.length };
}
function todayDone() {
  const k = dkey(); let n = 0;
  for (const h of activeHabits()) if (isChecked(h.id, k)) n++;
  for (const t of live(S.tasks)) if (t.done && dkey(new Date(t.doneAt || t.u || 0)) === k) n++;
  return n;
}
function spaceMeta(sp) {
  if (sp.type === 'project') { const d = daysLeft(sp.due); const st = projectState(sp); return d == null ? st.name : d < 0 ? `${-d} d late` : d === 0 ? 'due today' : `${d} d left`; }
  if (sp.type === 'client') return RELATIONS[sp.rel]?.name || 'Client';
  const s = sectorStreak(sp.id); return s ? `${s}-day rhythm` : 'no rhythm yet';
}
function weekDots(sid, c) { return `<span class="week" style="--c:${c}">${sectorWeek(sid).map(d => `<i class="${d.on ? 'on' : ''}"></i>`).join('')}</span>`; }

function widgetHTML(w) {
  const size = w.size;
  const tools = `<div class="w-tools"><div class="sizes" role="group" aria-label="Size">${['S', 'M', 'L'].map(z => `<button data-size-set="${z}" aria-pressed="${z === size}" class="${z === size ? 'on' : ''}">${z}</button>`).join('')}</div><button class="w-x" data-w-hide aria-label="Hide widget">${icon('i-x')}</button></div>`;
  let head = '', body = '';
  if (w.id === 'today') {
    const { list, picked } = todayList(), done = todayDone(), total = done + list.length;
    head = `<b>${picked ? "Today's three" : 'Today'}</b><small>${total ? `${done} of ${total}` : ''}</small>`;
    body = list.length
      ? `${size !== 'S' ? `<div class="prog"><i style="width:${total ? Math.round(done / total * 100) : 0}%"></i></div>` : ''}<div class="rows" style="flex:1;min-height:0;overflow:hidden">${list.slice(0, 9).map(x => {
          const sp = spaceById(x.space), c = sp?.color || 'var(--fg-3)';
          return `<div class="row" data-today="${x.type}:${x.id}"><button class="check" style="--c:${c}" aria-label="Mark done: ${esc(x.text)}">${CHECK}</button><div class="t"><b>${esc(x.text)}</b>${size !== 'S' ? `<small>${sp ? `<span class="dot" style="--c:${c}"></span>${esc(sp.name)}` : x.type === 'habit' ? 'Habit' : 'Task'}</small>` : ''}</div>${size === 'L' ? `<svg class="ico chev" aria-hidden="true"><use href="#i-next"/></svg>` : ''}</div>`;
        }).join('')}</div>${size === 'L' ? '<small class="foot-note">Done moves out, the next one steps in. Hold to edit.</small>' : ''}`
      : `<div class="w-empty"><span>${done ? 'All done for today.' : 'Nothing on today yet.'}</span>${done ? '' : `<button class="btn" data-add="todo">Add a task</button>`}</div>`;
  } else if (w.id === 'spaces') {
    const sps = allSpaces(); const n = size === 'S' ? 1 : size === 'M' ? (wide() ? 3 : 3) : 4;
    head = `<b>Spaces</b><small>${sps.length ? `<button data-goto="spaces" class="faint">${sps.length} ↗</button>` : ''}</small>`;
    body = sps.length ? `<div class="mini-spaces" style="${size === 'L' ? 'grid-auto-flow:row;grid-template-columns:repeat(2,minmax(0,1fr))' : ''}">${sps.slice(0, n).map(sp =>
      `<button class="mini" style="--c:${sp.color}" data-open-space="${sp.id}"><span class="mk"><span class="dot" style="--c:${sp.color}"></span>${SPACE_TYPES[sp.type]?.name || ''}</span><b>${esc(sp.name)}</b>${weekDots(sp.id, sp.color)}</button>`).join('')}</div>`
      : `<div class="w-empty"><span>No spaces yet.</span><button class="btn" data-new-space>Add a space</button></div>`;
  } else if (w.id === 'rhythm') {
    const st = overallStreaks(), days = lastDays(7);
    head = `<b>Rhythm</b><small>best ${st.best}</small>`;
    body = activeHabits().length
      ? `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:10px">${dm(st.cur, size === 'S' ? 5 : 6)}<span class="muted" style="font-size:12px">day rhythm</span><span class="week">${days.map(d => `<i class="${d.r ? 'on' : ''}" style="--c:var(--good)"></i>`).join('')}</span></div>`
      : `<div class="w-empty"><span>Add a habit to start a rhythm.</span></div>`;
  } else if (w.id === 'next') {
    const due = allSpaces().filter(p => p.type === 'project' && p.due && !['paid', 'done'].includes(p.state)).sort((a, b) => (a.due < b.due ? -1 : 1))[0];
    const alert = homeAlerts().filter(a => a.kind !== 'cash')[0];
    head = `<b>Next up</b>`;
    if (due) { const d = daysLeft(due.due); body = `<button style="flex:1;display:flex;flex-direction:column;justify-content:space-between;text-align:left" data-open-space="${due.id}"><span class="big">${d < 0 ? -d : d}<small style="font-size:13px;font-weight:600;letter-spacing:0"> ${d < 0 ? 'days late' : d === 1 ? 'day' : 'days'}</small></span><span style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(due.name)}</span>${size !== 'S' && due.next ? `<small class="muted">${esc(due.next)}</small>` : ''}</button>`; }
    else if (alert) body = `<button style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:6px;text-align:left" data-open-space="${alert.id}"><b style="font-size:15px">${esc(alert.text)}</b><small class="muted">${esc(alert.val)}</small></button>`;
    else body = `<div class="w-empty"><span>Nothing due. Enjoy the room.</span></div>`;
  } else if (w.id === 'moments' && size === 'S' && live(S.entries).some(e => e.kind === 'image' || (e.kind === 'video' && e.poster))) {
    const e = live(S.entries).filter(e => e.kind === 'image' || (e.kind === 'video' && e.poster)).sort((a, b) => (b.c || b.u) - (a.c || a.u))[0];
    return `<article class="w glass photo" data-w="${w.id}" data-size="${size}" style="grid-column:${w.c} / span ${w.sw};grid-row:${w.r} / span ${w.sh}">${tools}<button class="w-photo" data-view="${e.id}" aria-label="Open latest moment"><img data-img="${e.kind === 'video' ? e.poster : e.img}" alt=""></button></article>`;
  } else if (w.id === 'moments') {
    const m = live(S.entries).filter(e => e.kind === 'image' || (e.kind === 'video' && e.poster)).sort((a, b) => (b.c || b.u) - (a.c || a.u));
    const n = size === 'S' ? 1 : size === 'M' ? (wide() ? 3 : 4) : 6;
    head = `<b>Moments</b><small>${m.length || ''}</small>`;
    body = m.length ? `<div class="thumbs" style="${size === 'L' ? 'grid-auto-flow:row;grid-template-columns:repeat(3,minmax(0,1fr))' : ''}">${m.slice(0, n).map(e => `<button data-view="${e.id}" aria-label="Open photo"><img data-img="${e.kind === 'video' ? e.poster : e.img}" alt=""></button>`).join('')}</div>`
      : `<div class="w-empty"><span>Photos you throw in land here.</span><button class="btn" data-add="image">Add a photo</button></div>`;
  } else if (w.id === 'week') {
    const ws = weekSummary();
    head = `<b>Your week</b><small>${ws.done ? `${ws.done} done` : ''}</small>`;
    body = `<p style="font-size:${size === 'S' ? 14 : 17}px;font-weight:650;line-height:1.3;overflow:hidden">${esc(ws.line)}</p>`;
  }
  return `<article class="w glass" data-w="${w.id}" data-size="${size}" style="grid-column:${w.c} / span ${w.sw};grid-row:${w.r} / span ${w.sh}">${tools}<div class="w-h">${head}</div><div class="w-body">${body}</div></article>`;
}
function renderHome() {
  const d = new Date();
  $('#homeDate').textContent = `${DAYS_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const h = d.getHours();
  $('#homeEyebrow').textContent = h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Your day' : 'This evening';
  const open = todayList().list.length;
  $('#homeScore').innerHTML = `${dm(open, 5, 2)}<span class="eyebrow">Open today</span>`;
  const { placed, left } = pack(wconf());
  $('#widgets').innerHTML = placed.map(widgetHTML).join('');
  hydrateImages($('#widgets'));
  requestAnimationFrame(fitRows);
  renderTray(left);
}
/* show only the rows that fully fit; no hard crop, no overflow */
function fitRows() {
  for (const box of $$('#widgets .rows')) {
    const rows = $$('.row', box); rows.forEach(r => (r.hidden = false));
    const limit = box.clientHeight;
    for (const r of rows) if (r.offsetTop - box.offsetTop + r.offsetHeight > limit + 1) r.hidden = true;
    const shown = rows.filter(r => !r.hidden); if (shown.length) shown[shown.length - 1].style.borderBottom = '0';
  }
}
function renderTray(left) {
  const tray = $('#tray');
  const list = wconf();
  tray.innerHTML = `<span class="lead">${left.length ? 'Add' : 'Hold and drag to move · pick a size'}</span>` + left.map(w => {
    const can = ['S', 'M', 'L'].some(z => fits(list.map(x => x.id === w.id ? { ...x, off: false, size: z } : x)));
    return `<button class="chip glass" data-w-show="${w.id}" ${can ? '' : 'disabled style="opacity:.4"'}>${icon('i-plus')}${WIDGETS[w.id].name}</button>`;
  }).join('');
}
/* tick in a widget: the row leaves, the next one steps in, the widget stays */
function completeToday(key, row) {
  const [type, id] = key.split(':');
  if (type === 'habit') setCheck(id, dkey(), 1);
  else { const t = live(S.tasks).find(x => x.id === id); if (t) { t.done = 1; t.doneAt = now(); touch(t); } }
  row?.querySelector('.check')?.classList.add('on');
  row?.classList.add('out');
  setTimeout(render, reducedMotion() ? 0 : 380);
}
const reducedMotion = () => matchMedia('(prefers-reduced-motion:reduce)').matches;

/* --- editing: long press, sizes, Done --- */
function enterEdit() {
  if (homeEdit) return;
  homeEdit = true; document.body.classList.add('editing'); $('#done').hidden = false;
  if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {}
  render();
}
function exitEdit() {
  homeEdit = false; document.body.classList.remove('editing'); $('#done').hidden = true; render();
}
(function bindWidgets() {
  const box = $('#widgets'); let timer = null, start = null, drag = null;
  box.addEventListener('pointerdown', e => {
    const w = e.target.closest('.w'); if (!w) return;
    if (homeEdit) {
      if (e.target.closest('.w-tools')) return;
      drag = { id: w.dataset.w, el: w, pid: e.pointerId }; w.classList.add('dragging');
      try { w.setPointerCapture(e.pointerId); } catch (err) {}
      return;
    }
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => { timer = null; enterEdit(); }, 520);
  });
  const cancel = () => { clearTimeout(timer); timer = null; };
  box.addEventListener('pointermove', e => { if (start && timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) cancel(); });
  box.addEventListener('pointerup', e => {
    cancel();
    if (!drag) return;
    const d = drag; drag = null; d.el.classList.remove('dragging');
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('.w');
    if (under && under.dataset.w !== d.id) {
      const list = wconf(); const from = list.findIndex(x => x.id === d.id), to = list.findIndex(x => x.id === under.dataset.w);
      const trial = list.slice(); const [it] = trial.splice(from, 1); trial.splice(to, 0, it);
      if (fits(trial.filter(x => !x.off && pack(list).placed.some(p => p.id === x.id)))) { saveW(trial); render(); }
    }
  });
  box.addEventListener('pointercancel', () => { cancel(); if (drag) { drag.el.classList.remove('dragging'); drag = null; } });
  box.addEventListener('contextmenu', e => { if (e.target.closest('.w')) e.preventDefault(); });
  box.addEventListener('click', e => {
    if (homeEdit) {
      const sz = e.target.closest('[data-size-set]');
      if (sz) {
        const id = sz.closest('.w').dataset.w, list = wconf();
        const trial = list.map(x => x.id === id ? { ...x, size: sz.dataset.sizeSet } : x);
        const visible = pack(list).placed.map(p => p.id);
        if (fits(trial.filter(x => visible.includes(x.id)))) { saveW(trial); render(); } else toast('Not enough room. Make another widget smaller.');
        return;
      }
      if (e.target.closest('[data-w-hide]')) { const id = e.target.closest('.w').dataset.w; saveW(wconf().map(x => x.id === id ? { ...x, off: true } : x)); render(); }
      return;
    }
    const row = e.target.closest('[data-today]');
    if (row && e.target.closest('.check')) return completeToday(row.dataset.today, row);
    if (row) { const [type, id] = row.dataset.today.split(':'); if (type === 'task') return openTaskSheet(id); const h = live(S.habits).find(x => x.id === id); if (h) return showTab('spaces', { space: h.space }); }
  });
  $('#tray').addEventListener('click', e => {
    const b = e.target.closest('[data-w-show]'); if (!b || b.disabled) return;
    const list = wconf(); const visible = pack(list).placed.map(p => p.id);
    for (const z of ['S', 'M', 'L']) {
      const trial = list.map(x => x.id === b.dataset.wShow ? { ...x, off: false, size: z } : x);
      if (fits(trial.filter(x => visible.includes(x.id) || x.id === b.dataset.wShow))) {
        const it = trial.find(x => x.id === b.dataset.wShow);
        const rest = trial.filter(x => x.id !== it.id); const lastVisible = rest.map(x => x.id).lastIndexOf(visible[visible.length - 1]);
        rest.splice(lastVisible + 1, 0, it); saveW(rest); render(); return;
      }
    }
    toast('Not enough room. Make another widget smaller.');
  });
  $('#done').onclick = exitEdit;
  addEventListener('keydown', e => { if (e.key === 'Escape' && homeEdit) exitEdit(); });
})();

/* =====================================================================
   SPACES — carousel of cards, detail with inner scroll
   ===================================================================== */
const TYPE_FILTERS = [['all', 'All'], ['personal', 'Personal'], ['client', 'Clients'], ['project', 'Projects']];
function needsYou(sp) {
  const k = dkey();
  if (activeHabits().some(h => h.space === sp.id && !isChecked(h.id, k))) return true;
  return live(S.tasks).some(t => t.space === sp.id && !t.done);
}
function renderSpaces() { currentSpace && spaceById(currentSpace) ? renderSpaceDetail(spaceById(currentSpace)) : (currentSpace = null, renderSpaceList()); syncDetailMode(); }
/* inside a space the card takes the whole height; the nav steps aside */
function syncDetailMode() { document.body.classList.toggle('in-detail', currentTab === 'spaces' && !!currentSpace); }
addEventListener('keydown', e => { if (e.key === 'Escape' && currentTab === 'spaces' && currentSpace && $('#viewer').hidden && !$('#sheet').open && !homeEdit) { currentSpace = null; renderSpaces(); } });

function renderSpaceList() {
  const all = allSpaces();
  const list = spaceFilter === 'all' ? all : all.filter(s => s.type === spaceFilter);
  const need = all.filter(needsYou).length;
  $('#spacesHead').innerHTML = `
    <div class="bar"><span class="wordmark" aria-label="Aurora">AUR<svg aria-hidden="true"><use href="#sym"/></svg>RA</span><button class="icon-btn primary" data-new-space aria-label="New space">${icon('i-plus')}</button></div>
    <div class="titlerow"><h1 class="title">Spaces</h1><div class="count">${all.length ? `${all.length}${need ? ` · ${need} need you today` : ''}` : ''}</div></div>
    ${all.length ? `<div class="filters" role="group" aria-label="Filter spaces">${TYPE_FILTERS.map(([k, n]) => `<button class="chip glass${spaceFilter === k ? ' on' : ''}" data-sfilter="${k}" aria-pressed="${spaceFilter === k}">${n}</button>`).join('')}</div>` : ''}`;
  const body = $('#spacesBody');
  if (!all.length) {
    body.innerHTML = `<div class="empty-space"><span class="eyebrow">Spaces</span><h2>A space to begin.</h2><p class="muted" style="max-width:30ch">A space is a piece of your world: an area of life, a client or a project.</p>
      <div class="quick">${[['Health', 'personal'], ['Work', 'personal'], ['Creative', 'personal'], ['Money', 'personal'], ['A client', 'client'], ['A project', 'project']].map(([n, t]) => `<button class="chip glass" data-quick-space="${t}" data-name="${n}">${icon('i-plus')}${n}</button>`).join('')}</div></div>`;
    return;
  }
  const cards = list.map((sp, i) => spaceCard(sp, i, list.length)).join('') + `<button class="scard add" data-new-space>${icon('i-plus')}<b style="font-size:18px">New space</b></button>`;
  const total = list.length + 1;
  stackIndex = Math.max(0, Math.min(stackIndex, total - 1));
  body.innerHTML = `<div class="stack" id="stack" aria-roledescription="carousel">${cards}</div><div class="pager" id="pager">${total > 1 ? Array.from({ length: total }, (_, i) => `<i class="${i === stackIndex ? 'on' : ''}"></i>`).join('') : ''}</div>`;
  layoutStack();
}
/* Cards sit behind each other. The ones that are not up next fall back into blur. */
let stackIndex = 0, stackDrag = null, stackMoved = false;
function layoutStack(dx = 0) {
  const cards = $$('#stack .scard'); if (!cards.length) return;
  const desk = wide();
  cards.forEach((c, i) => {
    const r = i - stackIndex; let t, o = 1, f = 'none', z = 20;
    if (r < 0) { t = desk ? 'translateX(-40%) scale(.92)' : 'translateX(-112%) rotate(-5deg)'; o = 0; }
    else if (r === 0) t = `translateX(${dx}px) rotate(${(dx / 30).toFixed(2)}deg)`;
    else if (r <= 3) { const k = r - Math.max(0, Math.min(1, -dx / 260)); t = desk ? `translateX(${(k * 90).toFixed(1)}px) scale(${(1 - k * .08).toFixed(3)})` : `translateY(${(-k * 15).toFixed(1)}px) scale(${(1 - k * .055).toFixed(3)})`; o = 1 - k * .2; f = `blur(${(k * 2.6).toFixed(1)}px)`; z = 20 - r; }
    else { t = desk ? 'translateX(300px) scale(.72)' : 'translateY(-60px) scale(.8)'; o = 0; f = 'blur(8px)'; z = 1; }
    c.style.transform = t; c.style.opacity = String(o); c.style.filter = f; c.style.zIndex = String(z);
    c.tabIndex = r === 0 ? 0 : -1; c.setAttribute('aria-hidden', String(r !== 0)); c.style.pointerEvents = r === 0 ? 'auto' : 'none';
  });
  $$('#pager i').forEach((p, i) => p.classList.toggle('on', i === stackIndex));
}
function stackGo(d) { const n = $$('#stack .scard').length; const i = Math.max(0, Math.min(n - 1, stackIndex + d)); if (i !== stackIndex) { stackIndex = i; layoutStack(); } }
(function bindStack() {
  const root = $('#spacesBody');
  root.addEventListener('pointerdown', e => { const st = e.target.closest('#stack'); if (!st || e.button > 0) return; stackDrag = { x: e.clientX, y: e.clientY, id: e.pointerId }; stackMoved = false; });
  root.addEventListener('pointermove', e => {
    if (!stackDrag || e.pointerId !== stackDrag.id) return;
    const dx = e.clientX - stackDrag.x, dy = e.clientY - stackDrag.y;
    if (!stackMoved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { stackMoved = true; $('#stack').classList.add('dragging'); try { $('#stack').setPointerCapture(e.pointerId); } catch (err) {} }
    if (stackMoved) layoutStack(dx);
  });
  const end = e => {
    if (!stackDrag) return; const dx = e.clientX - stackDrag.x; stackDrag = null;
    const st = $('#stack'); if (!st) return; st.classList.remove('dragging');
    if (stackMoved) { if (dx < -60) stackGo(1); else if (dx > 60) stackGo(-1); else layoutStack(); }
  };
  root.addEventListener('pointerup', end); root.addEventListener('pointercancel', end);
  root.addEventListener('click', e => { if (stackMoved && e.target.closest('#stack')) { e.stopPropagation(); e.preventDefault(); stackMoved = false; } }, true);
  let lock = false;
  root.addEventListener('wheel', e => { if (!e.target.closest('#stack')) return; e.preventDefault(); if (lock) return; const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if (Math.abs(d) < 10) return; lock = true; stackGo(d > 0 ? 1 : -1); setTimeout(() => (lock = false), 450); }, { passive: false });
  addEventListener('keydown', e => { if (currentTab !== 'spaces' || currentSpace || !$('#stack') || e.target.closest('input,textarea') || !$('#viewer').hidden || $('#sheet').open) return; if (e.key === 'ArrowRight') stackGo(1); if (e.key === 'ArrowLeft') stackGo(-1); });
})();
function spaceCard(sp, i, n) {
  const c = sp.color || '#888';
  let metric = '', pill = '';
  if (sp.type === 'personal') {
    const k = dkey(), hs = activeHabits().filter(h => h.space === sp.id), done = hs.filter(h => isChecked(h.id, k)).length;
    const wk = sectorWeek(sp.id);
    metric = `${dm(sectorStreak(sp.id), 7, 3)}<small>day rhythm</small><span class="week" style="--c:${c};gap:9px">${wk.map(d => `<i class="${d.on ? 'on' : ''}" style="width:13px;height:13px"></i>`).join('')}</span>`;
    pill = hs.length ? `${done} of ${hs.length} today` : 'No habits yet';
  } else if (sp.type === 'client') {
    const pr = clientProjects(sp.id).length;
    metric = `${dm(pr, 7, 3)}<small>${pr === 1 ? 'project' : 'projects'}</small>`;
    pill = RELATIONS[sp.rel]?.name || 'Client';
  } else {
    const d = daysLeft(sp.due), st = projectState(sp);
    metric = d == null ? `<small>No deadline</small>` : `${dm(Math.abs(d), 7, 3)}<small>${d < 0 ? 'days late' : d === 1 ? 'day left' : 'days left'}</small>`;
    pill = st.name;
  }
  return `<button class="scard" style="--c:${c}" data-open-space="${sp.id}">
    <span class="kind"><span class="dot" style="--c:${c}"></span>${SPACE_TYPES[sp.type]?.name || 'Space'}<span class="n">${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}</span></span>
    <h2>${esc(sp.name)}</h2>${sp.note ? `<p>${esc(sp.note)}</p>` : ''}
    <div class="metric">${metric}</div>
    <div class="foot"><span class="pill" style="--c:${c}">${esc(pill)}</span>${icon('i-arrow')}</div></button>`;
}

/* --- detail --- */
function heatCells(sid) {
  const today = new Date(); const start = addDays(today, -((today.getDay() + 6) % 7) - 28);   // Monday, 4 weeks back
  const out = [];
  for (let i = 0; i < 35; i++) { const d = addDays(start, i), k = dkey(d); const future = d > today && k !== dkey(today); out.push(`<i class="${!future && touchedOn(sid, k) ? 'on' : ''}${k === dkey(today) ? ' today' : ''}" style="${future ? 'opacity:.25' : ''}"></i>`); }
  return `<div class="heat-days">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(x => `<span>${x}</span>`).join('')}</div><div class="heat">${out.join('')}</div>`;
}
function insight(sid) {
  const counts = Array(7).fill(0); let total = 0;
  for (let i = 0; i < 56; i++) { const d = addDays(new Date(), -i); if (touchedOn(sid, dkey(d))) { counts[d.getDay()]++; total++; } }
  if (total < 5) return '';
  const best = counts.indexOf(Math.max(...counts));
  return `You show up here most on ${DAYS_LONG[best]}s.`;
}
function momentsOf(sid) { return live(S.entries).filter(e => e.space === sid && (e.kind === 'image' || e.kind === 'video')).sort((a, b) => (b.c || b.u) - (a.c || a.u)); }
function notesOf(sid) { return live(S.entries).filter(e => e.space === sid && e.kind === 'note').sort((a, b) => (b.c || b.u) - (a.c || a.u)); }
function tasksOf(sid) { return live(S.tasks).filter(t => t.space === sid && !t.done).sort((a, b) => (a.c || a.u) - (b.c || b.u)); }
function momentGrid(sid, n = 9) {
  const m = momentsOf(sid);
  return `<div class="mgrid">${m.slice(0, n).map(e => `<button data-view="${e.id}" aria-label="Open"><img data-img="${e.kind === 'video' ? e.poster : e.img}" alt=""></button>`).join('')}<button data-add="image" data-add-space="${sid}" aria-label="Add a photo" style="display:grid;place-items:center;border:1px dashed rgba(246,236,220,.3);background:transparent;color:#f6ecdc">${icon('i-plus')}</button></div>`;
}
function taskItems(sid) {
  return tasksOf(sid).map(t => `<div class="item"><button class="check" style="--c:var(--c)" data-task-done="${t.id}" aria-label="Done: ${esc(t.text)}">${CHECK}</button><button class="grow" style="text-align:left" data-task-open="${t.id}">${esc(t.text)}</button></div>`).join('');
}
function addLine(kind, sid, ph) {
  return `<form class="addline" data-addline="${kind}" data-sid="${sid}" autocomplete="off"><label class="sr" for="al-${kind}">${ph}</label><input id="al-${kind}" placeholder="${ph}" maxlength="160"><button aria-label="${ph}">${icon('i-plus')}</button></form>`;
}
function renderSpaceDetail(sp) {
  const c = sp.color || '#888';
  $('#spacesHead').innerHTML = `<div class="bar"><button class="chip glass" data-back style="padding:0 16px 0 12px;height:44px">${icon('i-back')}Spaces</button>
    <div class="bar-r"><span class="muted" style="font-size:14px">${esc(SPACE_TYPES[sp.type]?.name || '')}</span><button class="icon-btn glass" data-edit-space="${sp.id}" aria-label="Edit space">${icon('i-lines')}</button></div></div>`;
  const k = dkey();
  const copy = SPACE_COPY[sp.type] || SPACE_COPY.personal;
  let card = `<span class="kind" style="display:flex;align-items:center;gap:8px;font-size:11px;font-weight:600;letter-spacing:.18em;color:rgba(246,236,220,.78);text-transform:uppercase"><span class="dot" style="--c:${c}"></span>${SPACE_TYPES[sp.type]?.name}${sp.type === 'project' && projectClient(sp) ? ` · ${esc(projectClient(sp).name)}` : ''}</span>
    <h1>${esc(sp.name)}</h1>
    <button class="note" style="text-align:left;${sp.note ? '' : 'opacity:.55'}" data-edit-space="${sp.id}">${esc(sp.note || copy.note)}</button>`;
  let panel = '';
  const notes = notesOf(sp.id).slice(0, 4);
  const notesHTML = notes.length ? `<div class="lbl">Notes</div>${notes.map(n => `<button class="item" data-view="${n.id}" style="text-align:left"><span class="grow" style="font-weight:500;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(n.text)}</span></button>`).join('')}` : '';
  const tasks = tasksOf(sp.id);

  if (sp.type === 'personal') {
    const hs = activeHabits().filter(h => h.space === sp.id), done = hs.filter(h => isChecked(h.id, k)).length;
    const offers = suggestFor(sp).filter(n => !hs.some(h => h.name.toLowerCase() === n.toLowerCase())).slice(0, 3);
    const tip = insight(sp.id);
    card += `<div class="sec"><b>Today</b><small>${hs.length ? `${done} of ${hs.length}` : ''}</small></div>
      ${hs.map(h => `<div class="item"><button class="check${isChecked(h.id, k) ? ' on' : ''}" style="--c:${c}" data-habit="${h.id}" aria-label="${esc(h.name)}" aria-pressed="${isChecked(h.id, k)}">${CHECK}</button><span class="grow">${esc(h.name)}</span><small>${habitStreak(h.id) ? habitStreak(h.id) + ' d' : ''}</small><button class="x" data-habit-del="${h.id}" aria-label="Remove habit ${esc(h.name)}">${icon('i-x')}</button></div>`).join('')}
      ${addLine('habit', sp.id, 'Add a habit')}
      ${hs.length < 3 && offers.length ? `<div class="offers">${offers.map(o => `<button data-offer-habit="${esc(o)}" data-sid="${sp.id}">+ ${esc(o)}</button>`).join('')}</div>` : ''}
      <div class="desk-hide" style="display:flex;flex-direction:column;gap:12px"><div class="sec"><b>Your rhythm</b><small>5 weeks</small></div>${heatCells(sp.id)}
      <div class="sec"><b>Moments</b><small>${momentsOf(sp.id).length || ''}</small></div>${momentGrid(sp.id, 8)}
      ${tip ? `<div class="noticed" style="--c:${c}"><span>AURORA NOTICED</span><p>${tip}</p></div>` : ''}</div>
      <div class="sec"><b>Tasks</b><small>${tasks.length || ''}</small></div>${taskItems(sp.id)}${addLine('task', sp.id, 'Add a task')}${notesHTML}`;
    const t7 = sectorTouches(sp.id).total, month = momentsOf(sp.id).filter(e => (e.c || 0) >= addDays(new Date(), -30).getTime()).length;
    const checks7 = hs.reduce((n, h) => n + [...Array(7)].filter((_, i) => isChecked(h.id, dkey(addDays(new Date(), -i)))).length, 0);
    const best = hs.reduce((m, h) => Math.max(m, habitStreak(h.id)), 0);
    const rows14 = hs.map(h => { let n = 0; const dots = [...Array(14)].map((_, i) => { const k2 = dkey(addDays(new Date(), -(13 - i))); const on = isChecked(h.id, k2); if (on) n++; return `<i class="${on ? 'on' : isSkipped(h.id, k2) ? 'skip' : ''}"></i>`; }).join(''); return `<div class="hrow"><div><b>${esc(h.name)}</b><small>${n} / 14</small></div><span class="d14" style="--c:${c}">${dots}</span></div>`; }).join('');
    panel = `<div class="ptile glass"><span class="eyebrow">This week</span><div class="statline">${dm(hs.length ? checks7 : t7, 6, 3)}<small>${hs.length ? `of ${hs.length * 7} check-ins` : 'times you showed up'}</small></div></div>
      <div class="ptile glass"><span class="eyebrow">Rhythm</span><div class="statline">${dm(sectorStreak(sp.id), 6, 3)}<small>days${best ? ` · best ${best}` : ''}</small></div></div>
      <div class="ptile glass"><span class="eyebrow">Moments</span><div class="statline">${dm(month, 6, 3)}<small>this month</small></div></div>
      <div class="ptile glass wide split" style="--c:${c}"><div class="half"><div class="sec" style="padding:0"><b>Your rhythm</b><small class="muted">5 weeks</small></div>${heatCells(sp.id)}</div>
        <div class="half grow"><div class="sec" style="padding:0"><b>Habits</b><small class="muted">14 days · a day off never breaks it</small></div>${rows14 || '<small class="muted">Add a habit on the card.</small>'}</div></div>
      <div class="ptile glass two thumbs4">${momentsOf(sp.id).slice(0, 4).map(e => `<button data-view="${e.id}" aria-label="Open"><img data-img="${e.kind === 'video' ? e.poster : e.img}" alt=""></button>`).join('')}${momentsOf(sp.id).length < 4 ? `<button data-add="image" data-add-space="${sp.id}" class="addm" aria-label="Add a photo">${icon('i-plus')}</button>` : ''}</div>
      <div class="ptile noticed-tile" style="--c:${c}"><span class="eyebrow" style="color:color-mix(in srgb,var(--c) 45%,#fff)">Aurora noticed</span><p>${tip || (hs.length ? `Keep ${esc(hs[0].name.toLowerCase())} going today.` : 'Start with one small habit. Aurora learns from there.')}</p>${hs.length && !isChecked(hs[0].id, k) ? `<button class="btn" data-habit="${hs[0].id}" style="height:40px;padding:0 16px;font-size:13px;align-self:flex-start">Done today</button>` : ''}</div>`;
  } else if (sp.type === 'client') {
    const prj = clientProjects(sp.id), q = quietDays(sp.id);
    const contact = q == null ? 'No contact yet' : q === 0 ? 'Today' : `${q} ${q === 1 ? 'day' : 'days'} ago`;
    card += `<div class="states" role="group" aria-label="Relationship">${Object.entries(RELATIONS).map(([key, r]) => `<button data-rel="${key}" class="${sp.rel === key ? 'on' : ''}" aria-pressed="${sp.rel === key}">${r.name}</button>`).join('')}</div>
      <div class="stats desk-hide"><div class="stat"><small>PROJECTS</small><b>${prj.length}</b></div><div class="stat"><small>OPEN TASKS</small><b>${tasks.length}</b></div><div class="stat"><small>LAST CONTACT</small><b style="font-size:15px">${contact}</b></div></div>
      <div class="sec"><b>Projects</b><small>${prj.length || ''}</small></div>
      ${prj.map(p => `<button class="item" data-open-space="${p.id}" style="text-align:left"><span class="dot" style="--c:${p.color}"></span><span class="grow">${esc(p.name)}</span><small>${esc(projectState(p).name)}</small></button>`).join('')}
      ${addLine('project', sp.id, 'New project')}
      <div class="sec"><b>Tasks</b><small>${tasks.length || ''}</small></div>${taskItems(sp.id)}${addLine('task', sp.id, 'Add a task')}
      <div class="desk-hide" style="display:flex;flex-direction:column;gap:12px"><div class="sec"><b>Moments</b></div>${momentGrid(sp.id, 8)}</div>${notesHTML}`;
    panel = `<div class="ptile glass"><span class="eyebrow">Open tasks</span>${dm(tasks.length, 6, 3)}<small class="muted">for ${esc(sp.name)}</small></div>
      ${CONNECT_TILE}
      <div class="ptile glass"><span class="eyebrow">Last contact</span><b class="big" style="font-size:30px">${contact}</b></div>
      <div class="ptile glass two"><span class="eyebrow">Projects</span>${prj.length ? prj.map(p => { const d = daysLeft(p.due); return `<button data-open-space="${p.id}" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--line);text-align:left"><span class="dot" style="--c:${p.color}"></span><span style="flex:1;font-weight:600">${esc(p.name)}</span><span class="muted" style="font-size:13px">${esc(projectState(p).name)}${d != null ? ` · ${d < 0 ? -d + ' d late' : d + ' d'}` : ''}</span></button>`; }).join('') : '<small class="muted">No projects yet.</small>'}</div>
      <div class="ptile glass" style="--c:${c}"><span class="eyebrow">Aurora noticed</span><p style="font-size:18px;font-weight:700;line-height:1.25">${q != null && q >= 7 ? `No contact in ${q} days. Send a quick update?` : 'All calm here.'}</p></div>
      <div class="ptile glass wide"><div class="sec" style="padding:0"><b>Moments</b></div>${momentGrid(sp.id, 11).replace('class="mgrid"', 'class="mgrid" style="grid-template-columns:repeat(6,minmax(0,1fr))"')}</div>`;
  } else {
    const d = daysLeft(sp.due), st = projectState(sp);
    const doneT = live(S.tasks).filter(t => t.space === sp.id && t.done).length, allT = doneT + tasks.length;
    const offers = allT ? [] : firstTasksFor(sp);
    card += `<div class="states" role="group" aria-label="Where it stands">${Object.entries(PSTATES).map(([key, s]) => `<button data-pstate="${key}" class="${(sp.state || 'me') === key ? 'on' : ''}" aria-pressed="${(sp.state || 'me') === key}">${s.name}</button>`).join('')}</div>
      <div class="stats desk-hide"><div class="stat"><small>${d == null ? 'DEADLINE' : d < 0 ? 'LATE' : 'LEFT'}</small><b>${d == null ? '—' : Math.abs(d) + ' d'}</b></div><div class="stat"><small>TASKS</small><b>${doneT} / ${allT}</b></div><div class="stat"><small>STATUS</small><b style="font-size:15px">${esc(st.name)}</b></div></div>
      <div class="lbl">Next step</div>
      <form class="addline" data-next="${sp.id}" autocomplete="off"><label class="sr" for="nextIn">Next step</label><input id="nextIn" value="${esc(sp.next || '')}" placeholder="The one next step" maxlength="160"><button aria-label="${sp.next ? 'Mark next step done' : 'Save next step'}">${icon(sp.next ? 'i-check' : 'i-plus')}</button></form>
      <div class="sec"><b>Tasks</b><small>${allT ? `${doneT} of ${allT}` : ''}</small></div>${taskItems(sp.id)}${addLine('task', sp.id, 'Add a task')}
      ${offers.length ? `<div class="offers">${offers.map(o => `<button data-offer-task="${esc(o)}" data-sid="${sp.id}">+ ${esc(o)}</button>`).join('')}</div>` : ''}
      <div class="desk-hide" style="display:flex;flex-direction:column;gap:12px"><div class="sec"><b>Moments</b></div>${momentGrid(sp.id, 8)}</div>${notesHTML}`;
    const started = sp.c || sp.u || now(), end = sp.due ? parseKey(sp.due).getTime() : null;
    const pct = end ? Math.max(0, Math.min(100, Math.round((now() - started) / Math.max(1, end - started) * 100))) : null;
    panel = `<div class="ptile glass"><span class="eyebrow">${d == null ? 'Deadline' : d < 0 ? 'Late by' : 'Time left'}</span>${d == null ? '<b class="big">—</b>' : dm(Math.abs(d), 6, 3)}<small class="muted">${d == null ? 'Set one in the card options' : 'days'}</small></div>
      <div class="ptile glass"><span class="eyebrow">Tasks</span><b class="big">${doneT} / ${allT}</b><div class="prog"><i style="width:${allT ? Math.round(doneT / allT * 100) : 0}%;background:${c}"></i></div></div>
      <div class="ptile glass"><span class="eyebrow">Status</span><b class="big" style="font-size:30px">${esc(st.name)}</b><small class="muted">${st.days ? `${st.days} days with them` : ''}</small></div>
      <div class="ptile glass two"><span class="eyebrow">Timeline</span>${pct == null ? '<small class="muted">No deadline yet.</small>' : `<div class="prog" style="height:8px"><i style="width:${pct}%;background:${c}"></i></div><div style="display:flex;justify-content:space-between;font-size:13px" class="muted"><span>${fmtShort(new Date(started))}</span><span>${fmtShort(parseKey(sp.due))}</span></div>`}</div>
      ${CONNECT_TILE}
      <div class="ptile glass wide"><div class="sec" style="padding:0"><b>Moments</b></div>${momentGrid(sp.id, 11).replace('class="mgrid"', 'class="mgrid" style="grid-template-columns:repeat(6,minmax(0,1fr))"')}</div>`;
  }
  $('#spacesBody').innerHTML = `<div class="detail"><article class="dcard" style="--c:${c}"><div class="scroller"><div class="inner">${card}</div></div></article><aside class="panel" aria-label="Insights">${panel}</aside></div>`;
  hydrateImages($('#spacesBody'));
}
const CONNECT_TILE = `<div class="ptile glass"><span class="eyebrow">Invoicing</span><p style="font-size:16px;font-weight:650;line-height:1.3">Connect Fakturoid to see money here.</p><button class="btn ghost" data-connect style="height:40px;padding:0 16px;font-size:13px;align-self:flex-start">Connect</button></div>`;
function openSpace(id) { showTab('spaces', { space: id }); }

/* --- space actions --- */
$('#spaces').addEventListener('click', async e => {
  const t = e.target;
  const f = t.closest('[data-sfilter]'); if (f) { spaceFilter = f.dataset.sfilter; stackIndex = 0; return renderSpaces(); }
  if (t.closest('[data-back]')) { currentSpace = null; return renderSpaces(); }
  const q = t.closest('[data-quick-space]'); if (q) { const name = q.dataset.name.replace(/^A /, ''); createSpace(q.dataset.quickSpace === 'personal' ? q.dataset.name : '', q.dataset.quickSpace, q.dataset.quickSpace !== 'personal'); return; }
  const hb = t.closest('[data-habit]'); if (hb) { const id = hb.dataset.habit, k = dkey(); setCheck(id, k, !isChecked(id, k)); return renderSpaces(); }
  const hd = t.closest('[data-habit-del]'); if (hd) { const h = live(S.habits).find(x => x.id === hd.dataset.habitDel); if (h && await confirmSheet(`Remove “${h.name}”?`)) { h.del = 1; touch(h); renderSpaces(); } return; }
  const oh = t.closest('[data-offer-habit]'); if (oh) { const tm = now(); S.habits.push({ id: uid(), name: oh.dataset.offerHabit, space: oh.dataset.sid, c: tm, u: tm }); touch(); return renderSpaces(); }
  const ot = t.closest('[data-offer-task]'); if (ot) { const tm = now(); S.tasks.push({ id: uid(), text: ot.dataset.offerTask, space: ot.dataset.sid, done: 0, c: tm, u: tm }); touch(); return renderSpaces(); }
  const td = t.closest('[data-task-done]'); if (td) { const x = live(S.tasks).find(y => y.id === td.dataset.taskDone); if (x) { td.classList.add('on'); x.done = 1; x.doneAt = now(); touch(x); setTimeout(renderSpaces, 320); } return; }
  const to = t.closest('[data-task-open]'); if (to) return openTaskSheet(to.dataset.taskOpen);
  const rel = t.closest('[data-rel]'); if (rel) { const sp = spaceById(currentSpace); sp.rel = rel.dataset.rel; touch(sp); return renderSpaces(); }
  const ps = t.closest('[data-pstate]'); if (ps) { const sp = spaceById(currentSpace); if (sp.state !== ps.dataset.pstate) { sp.state = ps.dataset.pstate; sp.stateAt = now(); touch(sp); } return renderSpaces(); }
});
$('#spaces').addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target, input = form.querySelector('input'), v = input.value.trim(), tm = now();
  if (form.dataset.next) {
    const sp = spaceById(form.dataset.next); if (!sp) return;
    if (v && v === (sp.next || '').trim()) { S.tasks.push({ id: uid(), text: v, space: sp.id, done: 1, doneAt: tm, c: tm, u: tm }); sp.next = ''; touch(sp); toast('Next step done'); }
    else { sp.next = v; touch(sp); toast(v ? 'Next step saved' : 'Cleared'); }
    return renderSpaces();
  }
  if (!v) return input.focus();
  const sid = form.dataset.sid, kind = form.dataset.addline;
  if (kind === 'habit') S.habits.push({ id: uid(), name: v, space: sid, c: tm, u: tm });
  else if (kind === 'task') S.tasks.push({ id: uid(), text: v, space: sid, done: 0, c: tm, u: tm });
  else if (kind === 'project') { createSpace(v, 'project', false, sid); return; }
  touch(); renderSpaces();
  requestAnimationFrame(() => $(`#al-${kind}`)?.focus());
});
function createSpace(name, type, askName, client) {
  if (askName || !name) return openSpaceSheet(null, type);
  const tm = now(), used = new Set(live(S.spaces).map(x => x.color));
  const sp = { id: uid(), name, type, color: SPACE_COLORS.find(c => !used.has(c)) || SPACE_COLORS[live(S.spaces).length % SPACE_COLORS.length], order: S.spaces.reduce((m, x) => Math.max(m, x.order ?? 0), -1) + 1, c: tm, u: tm };
  if (type === 'client') sp.rel = 'oneoff';
  if (type === 'project') { sp.state = 'me'; sp.stateAt = tm; if (client) sp.client = client; }
  S.spaces.push(sp); touch(); openSpace(sp.id); toast('Space added');
}

/* =====================================================================
   BOARD — clean gallery, nothing under the pictures
   ===================================================================== */
const TUTORIAL = () => S.settings.hideTutorial ? null : { id: 'tutorial', bundled: true, kind: 'video', src: 'assets/aurora-tutorial.mp4', posterSrc: 'assets/tutorial-poster.jpg', pinned: !!S.settings.tutorialPinned, c: 0 };
function boardItems(filter = boardFilter) {
  let list = live(S.entries).slice();
  const tut = TUTORIAL(); if (tut) list.push(tut);
  list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.pinned && a.pinned ? (b.boardOrder || 0) - (a.boardOrder || 0) : 0) || (b.c || b.u || 0) - (a.c || a.u || 0));
  if (!live(S.entries).length && tut) list = [tut];
  if (filter === 'image') list = list.filter(e => e.kind === 'image');
  if (filter === 'note') list = list.filter(e => e.kind === 'note');
  if (filter === 'video') list = list.filter(e => e.kind === 'video');
  return list;
}
function renderBoard() {
  const all = live(S.entries);
  const n = { image: all.filter(e => e.kind === 'image').length, note: all.filter(e => e.kind === 'note').length, video: all.filter(e => e.kind === 'video').length };
  $('#boardCount').textContent = [n.image && plural(n.image, 'photo', 'photos'), n.note && plural(n.note, 'note', 'notes'), n.video && plural(n.video, 'clip', 'clips')].filter(Boolean).join(' · ');
  $('#boardFilters').innerHTML = [['all', 'All'], ['image', 'Photos'], ['note', 'Notes'], ['video', 'Clips']].map(([k, l]) => `<button class="chip glass${boardFilter === k ? ' on' : ''}" data-bfilter="${k}" aria-pressed="${boardFilter === k}">${l}</button>`).join('');
  const list = boardItems();
  const g = $('#gallery');
  if (!list.length) { g.innerHTML = `<div class="gallery-empty"><p style="font-size:18px;font-weight:700;color:var(--fg);margin-bottom:12px">${boardFilter === 'all' ? 'Throw in a photo, a clip or a thought.' : 'Nothing here yet.'}</p><button class="btn" data-add="${boardFilter === 'all' ? 'note' : boardFilter}">Throw it in</button></div>`; return; }
  g.innerHTML = '<div class="cols">' + list.map((e, i) => {
    if (e.kind === 'note') return `<button class="tile note glass" data-view="${e.id}" style="${e.noteTint ? `background:color-mix(in srgb,${e.noteTint} 40%,transparent)` : ''}">${esc(e.text)}</button>`;
    const src = e.bundled ? `src="${e.posterSrc}"` : `data-img="${e.kind === 'video' ? (e.poster || '') : e.img}"`;
    return `<button class="tile" data-view="${e.id}" aria-label="${e.kind === 'video' ? 'Open clip' : 'Open photo'}"><img ${src} alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ph'}))"></button>`;
  }).join('') + '</div>';
  hydrateImages(g);
}
$('#board').addEventListener('click', e => { const f = e.target.closest('[data-bfilter]'); if (f) { boardFilter = f.dataset.bfilter; renderBoard(); } });

/* images live in IndexedDB; fill them in after the markup is on screen */
function hydrateImages(root) {
  for (const img of $$('img[data-img]', root)) {
    const id = img.dataset.img; img.removeAttribute('data-img');
    if (!id) { img.replaceWith(Object.assign(document.createElement('div'), { className: 'ph' })); continue; }
    imageUrl(id).then(u => { if (u) img.src = u; else img.replaceWith(Object.assign(document.createElement('div'), { className: 'ph' })); });
  }
}

/* =====================================================================
   VIEWER — fullscreen, swipe on phone, scroll on desktop, no arrows
   ===================================================================== */
const V = { list: [], index: 0, fit: 'fill', opener: null };
function findItem(id) { if (id === 'tutorial') return TUTORIAL(); return live(S.entries).find(e => e.id === id) || null; }
function openViewer(id, list) {
  const items = list || (currentTab === 'board' ? boardItems() : [findItem(id)].filter(Boolean));
  const index = Math.max(0, items.findIndex(x => x.id === id));
  if (!items.length) return;
  V.list = items; V.index = index; V.fit = 'fill'; V.opener = document.activeElement;
  const el = $('#viewer'); el.hidden = false; el.dataset.fit = 'fill'; el.classList.add('opening'); setTimeout(() => el.classList.remove('opening'), 400);
  $('#vTrack').innerHTML = items.map((it, i) => `<div class="slide" data-i="${i}">${it.kind === 'note' ? `<div class="vnote" style="${it.noteTint ? `color:#fff` : ''}">${esc(it.text)}</div>` : ''}</div>`).join('');
  $('#vDots').innerHTML = items.length > 1 && items.length <= 14 ? items.map((_, i) => `<i class="${i === index ? 'on' : ''}"></i>`).join('') : '';
  requestAnimationFrame(() => { $('#vTrack').scrollLeft = index * $('#vTrack').clientWidth; loadAround(index); syncViewer(); });
  el.focus({ preventScroll: true });
}
async function loadSlide(i) {
  const it = V.list[i], slide = $(`#vTrack .slide[data-i="${i}"]`); if (!it || !slide || slide.dataset.loaded) return;
  slide.dataset.loaded = '1';
  if (it.kind === 'note') return;
  const url = it.bundled ? it.src : await imageUrl(it.img);
  if (!url) { slide.innerHTML = '<p class="muted">This item could not be loaded.</p>'; return; }
  if (it.kind === 'video') {
    const v = document.createElement('video'); v.src = url; v.playsInline = true; v.muted = true; v.loop = !it.bundled; v.preload = 'metadata';
    if (it.bundled) v.poster = it.posterSrc; else if (it.poster) imageUrl(it.poster).then(p => { if (p) v.poster = p; });
    v.addEventListener('click', () => { if (v.muted) { v.muted = false; v.play().catch(() => {}); } else if (v.paused) v.play().catch(() => {}); else v.pause(); });
    v.addEventListener('loadedmetadata', () => markFit(slide, v.videoWidth, v.videoHeight));
    const amb = document.createElement('div'); amb.className = 'amb';
    if (it.bundled) amb.style.backgroundImage = `url(${it.posterSrc})`; else if (it.poster) imageUrl(it.poster).then(p => { if (p) amb.style.backgroundImage = `url(${p})`; });
    slide.append(amb, v);
  } else {
    const amb = document.createElement('div'); amb.className = 'amb'; amb.style.backgroundImage = `url(${url})`;
    const im = new Image(); im.alt = it.text || 'Photo'; im.draggable = false; im.onload = () => markFit(slide, im.naturalWidth, im.naturalHeight); im.src = url; slide.append(amb, im);
  }
}
/* Fill covers the screen. When the picture and the screen disagree a lot
   (a tall photo on a wide screen) it keeps the whole picture and fills the
   rest with its own colours, so nothing is cropped away or stretched. */
function markFit(slide, w, h) {
  if (!w || !h) return;
  const a = w / h, s = innerWidth / innerHeight;
  slide.classList.toggle('mismatch', Math.abs(Math.log(a / s)) > .55);
}
function loadAround(i) { for (let d = -1; d <= 2; d++) loadSlide(i + d); }
function syncViewer() {
  const it = V.list[V.index]; if (!it) return;
  $('#vFit').hidden = it.kind === 'note';
  $$('#vFit button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.fit === V.fit)));
  const pinned = it.bundled ? !!S.settings.tutorialPinned : !!it.pinned;
  $('#vPin').setAttribute('aria-pressed', String(pinned)); $('#vPin').setAttribute('aria-label', pinned ? 'Unpin' : 'Pin');
  $('#vDel').setAttribute('aria-label', it.bundled ? 'Hide tutorial' : 'Delete');
  $$('#vDots i').forEach((d, i) => d.classList.toggle('on', i === V.index));
  $$('#vTrack video').forEach(v => { const s = v.closest('.slide'); if (Number(s.dataset.i) === V.index) v.play().catch(() => {}); else v.pause(); });
}
function closeViewer() {
  const el = $('#viewer'); if (el.hidden) return;
  $$('#vTrack video').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
  el.hidden = true; $('#vTrack').innerHTML = '';
  render();
  if (V.opener?.isConnected) V.opener.focus({ preventScroll: true });
}
function goTo(i) { i = Math.max(0, Math.min(V.list.length - 1, i)); const tr = $('#vTrack'); tr.scrollTo({ left: i * tr.clientWidth, behavior: reducedMotion() ? 'auto' : 'smooth' }); }
(function bindViewer() {
  const tr = $('#vTrack');
  tr.addEventListener('scroll', debounce(() => { const i = Math.round(tr.scrollLeft / Math.max(1, tr.clientWidth)); if (i !== V.index) { V.index = i; loadAround(i); } syncViewer(); }, 60));
  let wheelLock = false;
  $('#viewer').addEventListener('wheel', e => {
    if (e.target.closest('.vnote') && e.target.closest('.vnote').scrollHeight > e.target.closest('.vnote').clientHeight) return;
    e.preventDefault(); if (wheelLock) return;
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if (Math.abs(d) < 12) return;
    wheelLock = true; goTo(V.index + (d > 0 ? 1 : -1)); setTimeout(() => (wheelLock = false), 520);
  }, { passive: false });
  let ts = null;
  tr.addEventListener('touchstart', e => { const p = e.touches[0]; ts = { x: p.clientX, y: p.clientY }; }, { passive: true });
  tr.addEventListener('touchend', e => { if (!ts) return; const p = e.changedTouches[0]; const dx = p.clientX - ts.x, dy = p.clientY - ts.y; ts = null; if (dy > 110 && Math.abs(dx) < 50) closeViewer(); }, { passive: true });
  $('#vClose').onclick = closeViewer;
  $('#vFit').addEventListener('click', e => { const b = e.target.closest('[data-fit]'); if (!b) return; V.fit = b.dataset.fit; $('#viewer').dataset.fit = V.fit; syncViewer(); });
  $('#vPin').onclick = () => { const it = V.list[V.index]; if (!it) return; if (it.bundled) { S.settings.tutorialPinned = !S.settings.tutorialPinned; touch(S.settings); } else { const e = findItem(it.id); e.pinned = !e.pinned; e.boardOrder = now(); it.pinned = e.pinned; touch(e); } syncViewer(); toast(($('#vPin').getAttribute('aria-pressed') === 'true') ? 'Pinned to the top' : 'Unpinned'); };
  $('#vDel').onclick = async () => {
    const it = V.list[V.index]; if (!it) return;
    if (!await confirmSheet(it.bundled ? 'Hide the tutorial from Board?' : 'Delete this for good?')) return;
    if (it.bundled) { S.settings.hideTutorial = true; touch(S.settings); }
    else { const e = findItem(it.id); if (e) { e.del = 1; touch(e); for (const m of [e.img, e.poster]) if (m) { forgetImage(m); Store.media.del(m).catch(() => {}); } } }
    V.list.splice(V.index, 1);
    if (!V.list.length) return closeViewer();
    const i = Math.min(V.index, V.list.length - 1); openViewer(V.list[i].id, V.list);
  };
  addEventListener('keydown', e => {
    if ($('#viewer').hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeViewer(); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goTo(V.index + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goTo(V.index - 1); }
  });
})();

/* =====================================================================
   TO DO
   ===================================================================== */
function renderTodo() {
  const k = dkey();
  const three = S.settings.three?.k === k ? (S.settings.three.ids || []).filter(x => x.type === 'task').map(x => x.id) : [];
  const open = live(S.tasks).filter(t => !t.done).sort((a, b) => (three.includes(b.id) - three.includes(a.id)) || ((a.c || a.u) - (b.c || b.u)));
  const doneToday = live(S.tasks).filter(t => t.done && dkey(new Date(t.doneAt || t.u || 0)) === k);
  $('#todoCount').textContent = `${open.length} open${doneToday.length ? ` · ${doneToday.length} done today` : ''}`;
  const row = (t, done) => { const sp = spaceById(t.space), c = sp?.color || 'var(--good)';
    return `<div class="task${done ? ' done' : ''}"><button class="check${done ? ' on' : ''}" style="--c:${c}" data-tcheck="${t.id}" aria-pressed="${done}" aria-label="${done ? 'Undo' : 'Done'}: ${esc(t.text)}">${CHECK}</button><button class="t" data-task-open="${t.id}"><b>${esc(t.text)}</b>${sp || three.includes(t.id) ? `<small>${sp ? `<span class="dot" style="--c:${c}"></span>${esc(sp.name)}` : ''}${three.includes(t.id) ? `${sp ? ' · ' : ''}Today's three` : ''}</small>` : ''}</button></div>`; };
  // this week, Monday → Sunday
  const mon = addDays(new Date(), -((new Date().getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => { const d = addDays(mon, i), dk = dkey(d); return { d, dk, n: live(S.tasks).filter(t => t.done && dkey(new Date(t.doneAt || t.u || 0)) === dk).length }; });
  const max = Math.max(1, ...week.map(w => w.n));
  $('#todoList').innerHTML = `<div class="todo-grid"><div class="todo-main">${open.length ? open.map(t => row(t, false)).join('') : `<p class="muted" style="padding:18px 0">Nothing open. Add the next thing above.</p>`}</div>
    <aside class="todo-side">${doneToday.length ? `<div class="subhead">Done today</div>${doneToday.map(t => row(t, true)).join('')}` : ''}
    <div class="subhead">This week</div>
    <div class="cal">${week.map(w => `<div class="${w.dk === k ? 'today' : ''}"><small>${['M', 'T', 'W', 'T', 'F', 'S', 'S'][(w.d.getDay() + 6) % 7]}</small><b>${w.d.getDate()}</b><i><u style="width:${Math.round(w.n / max * 100)}%"></u></i></div>`).join('')}</div></aside></div>`;
}
$('#todoForm').addEventListener('submit', e => {
  e.preventDefault(); const i = $('#todoInput'), v = i.value.trim(); if (!v) return i.focus();
  const tm = now(); S.tasks.push({ id: uid(), text: v, done: 0, c: tm, u: tm }); touch(); i.value = ''; renderTodo(); toast('Task added');
});
$('#todoList').addEventListener('click', e => {
  const c = e.target.closest('[data-tcheck]');
  if (c) { const t = live(S.tasks).find(x => x.id === c.dataset.tcheck); if (!t) return; const done = !t.done; t.done = done ? 1 : 0; t.doneAt = done ? now() : undefined; touch(t); c.classList.toggle('on', done); const r = c.closest('.task'); if (r && done) r.classList.add('out'); setTimeout(renderTodo, done && !reducedMotion() ? 330 : 0); return; }
  const o = e.target.closest('[data-task-open]'); if (o) openTaskSheet(o.dataset.taskOpen);
});

/* =====================================================================
   SETTINGS
   ===================================================================== */
function renderSettings() {
  applyLook();
  const n = $('#setName'); if (document.activeElement !== n) n.value = S.settings.name || '';
  $('#setMorning').setAttribute('aria-checked', String(S.settings.v2morning !== false));
  $('#setIntro').setAttribute('aria-checked', String(S.settings.v2intro !== false));
  $('#ver').textContent = `Aurora ${VERSION} · Liquid + Atmos`;
}
$('#modes').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (!b) return; S.settings.theme = b.dataset.mode; touch(S.settings); applyLook(); });
$('#bgFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const blob = await shrinkImage(f, 3200, .9); const id = 'bg-' + uid(); await Store.media.put(id, blob); const old = S.settings.bg?.img; S.settings.bg = { img: id }; touch(S.settings); if (old) { forgetImage(old); Store.media.del(old).catch(() => {}); } applyLook(); toast('Background set'); }
  catch (err) { toast('Could not read that image'); }
};
$('#bgReset').onclick = () => { const old = S.settings.bg?.img; S.settings.bg = null; touch(S.settings); if (old) { forgetImage(old); Store.media.del(old).catch(() => {}); } applyLook(); toast('Back to the Aurora background'); };
$('#setDim').addEventListener('input', e => { S.settings.v2dim = Number(e.target.value) / 100; applyLook(); });
$('#setDim').addEventListener('change', () => touch(S.settings));
$('#dimReset').onclick = () => { delete S.settings.v2dim; touch(S.settings); applyLook(); };
$('#setName').addEventListener('change', e => { S.settings.name = e.target.value.trim(); touch(S.settings); });
$('#setMorning').onclick = () => { S.settings.v2morning = S.settings.v2morning === false; touch(S.settings); renderSettings(); };
$('#setIntro').onclick = () => { S.settings.v2intro = S.settings.v2intro === false; touch(S.settings); renderSettings(); };
$('#exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify(exportObject(), null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `aurora-backup-${dkey()}.json`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
$('#importFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const obj = JSON.parse(await f.text()); const st = obj.state || obj;
    if (!st || !st.settings || !Array.isArray(st.spaces)) throw Error('bad');
    if (!await confirmSheet('Replace what is on this device with the backup?')) return;
    const d = defaultState(), m = Store.migrate(structuredClone(st));
    S = { ...d, ...m, settings: { ...d.settings, ...m.settings }, meta: { ...d.meta, ...(m.meta || {}) } };
    touch(); applyLook(); toast('Backup restored'); showTab('home');
  } catch (err) { toast('That file is not an Aurora backup'); }
};
$('#wipeBtn').onclick = async () => { if (!await confirmSheet('Erase everything on this device? Your cloud copy stays.')) return; await Store.wipe(); location.reload(); };

/* =====================================================================
   SHEETS — add, space, task
   ===================================================================== */
let addState = { kind: 'note', space: null, blob: null, video: null };
function sheet(html) { const d = $('#sheet'); d.innerHTML = `<div class="grab"></div>${html}`; if (!d.open) d.showModal(); return d; }
function closeSheet() { const d = $('#sheet'); if (d.open) d.close(); }
function openAdd(kind = 'note', space = null) {
  addState = { kind, space: space || (currentTab === 'spaces' ? currentSpace : null), blob: null, video: null };
  drawAdd();
}
function drawAdd() {
  const k = addState.kind;
  const field = k === 'note' ? `<div class="field"><label for="addText">What's on your mind</label><textarea id="addText" maxlength="4000"></textarea></div>`
    : k === 'todo' ? `<div class="field"><label for="addText">Task</label><input id="addText" maxlength="200" autocomplete="off"></div>`
    : `<div class="field"><span class="lab">${k === 'image' ? 'Photo' : `Clip · up to ${VIDEO_MAX_S} s`}</span><label class="drop" id="drop"><span>${k === 'image' ? 'Choose a photo' : 'Choose a video'}</span><input type="file" id="addFile" accept="${k === 'image' ? 'image/*' : 'video/*'}"></label></div>`;
  const sps = taggerSpaces();
  sheet(`<div class="sh-h"><div><h2 id="sheetTitle">Throw it in</h2><p>Sort it now or later.</p></div><button class="icon-btn glass" data-close aria-label="Close">${icon('i-x')}</button></div>
    <div class="kinds" role="group" aria-label="Kind">${[['note', 'Note', 'i-note'], ['image', 'Photo', 'i-photo'], ['video', 'Video', 'i-video'], ['todo', 'To do', 'i-todo']].map(([id, n, ic]) => `<button data-kind="${id}" aria-pressed="${k === id}">${icon(ic)}${n}</button>`).join('')}</div>
    ${field}
    ${sps.length ? `<div class="field"><span class="lab">Where does it go</span><div class="tags">${sps.map(sp => `<button data-tag="${sp.id}" aria-pressed="${addState.space === sp.id}"><span class="dot" style="--c:${sp.color}"></span>${esc(sp.name)}</button>`).join('')}</div></div>` : ''}
    <div class="sh-actions"><button class="btn" id="addSave">${k === 'todo' ? 'Add task' : 'Save'}</button></div>`);
  setTimeout(() => $('#addText')?.focus(), 60);
  const file = $('#addFile'); if (file) file.onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return; const drop = $('#drop');
    if (k === 'image') { try { addState.blob = await shrinkImage(f); drop.firstElementChild.outerHTML = `<img src="${URL.createObjectURL(addState.blob)}" alt="">`; } catch { toast('Could not read that photo'); } }
    else {
      if (f.size > VIDEO_MAX_MB * 1048576) return toast(`Keep videos under ${VIDEO_MAX_MB} MB`);
      drop.firstElementChild.textContent = 'Reading…';
      try { const info = await probeVideo(f); if (info.dur > VIDEO_MAX_S + .5) { drop.firstElementChild.textContent = 'Choose a video'; return toast(`Trim it to ${VIDEO_MAX_S} s or less`); } addState.video = { file: f, ...info }; drop.firstElementChild.outerHTML = `<video src="${URL.createObjectURL(f)}" muted playsinline></video>`; }
      catch { drop.firstElementChild.textContent = 'Choose a video'; toast('Could not read that video'); }
    }
  };
}
async function saveAddSheet() {
  const k = addState.kind, t = now(), space = addState.space || undefined;
  if (k === 'note' || k === 'todo') {
    const v = $('#addText').value.trim(); if (!v) return $('#addText').focus();
    if (k === 'note') S.entries.push({ id: uid(), kind: 'note', text: v, space, c: t, u: t });
    else S.tasks.push({ id: uid(), text: v, done: 0, space, c: t, u: t });
  } else if (k === 'image') {
    if (!addState.blob) return toast('Choose a photo first');
    const img = uid(); await Store.media.put(img, addState.blob);
    S.entries.push({ id: uid(), kind: 'image', text: '', img, space, mime: 'image/jpeg', c: t, u: t });
  } else {
    if (!addState.video) return toast('Choose a video first');
    const img = uid(), poster = uid(); await Store.media.put(img, addState.video.file);
    if (addState.video.poster) await Store.media.put(poster, addState.video.poster);
    S.entries.push({ id: uid(), kind: 'video', text: '', img, space, poster: addState.video.poster ? poster : null, mime: addState.video.file.type || 'video/mp4', dur: Math.round(addState.video.dur), c: t, u: t });
  }
  touch(); closeSheet(); render();
  toast(k === 'todo' ? 'Task added' : space ? `Saved to ${spaceName(space)}` : 'Saved to Board');
}
function openSpaceSheet(id, type = 'personal') {
  const sp = id ? spaceById(id) : null; const tp = sp?.type || type;
  const clients = allSpaces().filter(s => s.type === 'client');
  const copy = SPACE_COPY[tp] || SPACE_COPY.personal;
  sheet(`<div class="sh-h"><div><h2 id="sheetTitle">${sp ? 'Edit space' : 'New space'}</h2><p>${esc(SPACE_TYPES[tp]?.hint || '')}</p></div><button class="icon-btn glass" data-close aria-label="Close">${icon('i-x')}</button></div>
    <form id="spaceForm" autocomplete="off">
    ${sp ? '' : `<div class="field"><span class="lab">Type</span><div class="tags">${Object.entries(SPACE_TYPES).map(([k, t]) => `<button type="button" data-sptype="${k}" aria-pressed="${tp === k}">${t.name}</button>`).join('')}</div></div>`}
    <div class="field"><label for="spName">Name</label><input id="spName" required maxlength="40" value="${esc(sp?.name || '')}"></div>
    <div class="field"><label for="spNote">${copy.note}</label><input id="spNote" maxlength="120" value="${esc(sp?.note || '')}"></div>
    ${tp === 'project' ? `<div class="field"><label for="spClient">Client</label><select id="spClient"><option value="">None</option>${clients.map(c => `<option value="${c.id}"${sp?.client === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="spDue">Deadline</label><input id="spDue" type="date" value="${esc(sp?.due || '')}"></div>
` : ''}
    ${sp ? `<div class="field"><span class="lab">Colour</span><div class="swatches">${SPACE_COLORS.map(c => `<button type="button" data-color="${c}" style="--c:${c}" aria-label="Colour ${c}" aria-pressed="${sp.color === c}"></button>`).join('')}</div></div>` : ''}
    <div class="sh-actions">${sp ? `<button type="button" class="btn danger" id="spDelete">Delete</button>` : ''}<button class="btn">${sp ? 'Save' : 'Create'}</button></div></form>`);
  const d = $('#sheet'); d.dataset.newType = tp; d.dataset.spid = id || '';
  setTimeout(() => $('#spName').focus(), 60);
}
function openTaskSheet(id) {
  const t = live(S.tasks).find(x => x.id === id); if (!t) return;
  sheet(`<div class="sh-h"><div><h2 id="sheetTitle">Task</h2></div><button class="icon-btn glass" data-close aria-label="Close">${icon('i-x')}</button></div>
    <form id="taskForm" autocomplete="off"><div class="field"><label for="tkText">Task</label><input id="tkText" maxlength="200" value="${esc(t.text)}" required></div>
    <div class="field"><span class="lab">Space</span><div class="tags"><button type="button" data-tktag="" aria-pressed="${!t.space}">None</button>${taggerSpaces().map(sp => `<button type="button" data-tktag="${sp.id}" aria-pressed="${t.space === sp.id}"><span class="dot" style="--c:${sp.color}"></span>${esc(sp.name)}</button>`).join('')}</div></div>
    <div class="sh-actions"><button type="button" class="btn danger" id="tkDelete">Delete</button><button class="btn">Save</button></div></form>`);
  $('#sheet').dataset.task = id;
}
$('#sheet').addEventListener('click', async e => {
  const t = e.target, d = $('#sheet');
  if (t.closest('[data-close]')) return closeSheet();
  const kd = t.closest('[data-kind]'); if (kd) { addState.kind = kd.dataset.kind; addState.blob = addState.video = null; return drawAdd(); }
  const tg = t.closest('[data-tag]'); if (tg) { addState.space = addState.space === tg.dataset.tag ? null : tg.dataset.tag; $$('[data-tag]', d).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tag === addState.space))); return; }
  if (t.closest('#addSave')) return saveAddSheet();
  const st = t.closest('[data-sptype]'); if (st) { openSpaceSheet(null, st.dataset.sptype); return; }
  const col = t.closest('[data-color]'); if (col) { $$('[data-color]', d).forEach(b => b.setAttribute('aria-pressed', String(b === col))); return; }
  if (t.closest('#spDelete')) { const sp = spaceById(d.dataset.spid); if (sp && await confirmSheet(`Delete “${sp.name}”? Its items stay on the Board.`)) { sp.del = 1; touch(sp); closeSheet(); currentSpace = null; renderSpaces(); toast('Space deleted'); } return; }
  const tk = t.closest('[data-tktag]'); if (tk) { $$('[data-tktag]', d).forEach(b => b.setAttribute('aria-pressed', String(b === tk))); return; }
  if (t.closest('#tkDelete')) { const x = live(S.tasks).find(y => y.id === d.dataset.task); if (x && await confirmSheet('Delete this task?')) { x.del = 1; touch(x); closeSheet(); render(); } return; }
});
$('#sheet').addEventListener('submit', e => {
  e.preventDefault(); const d = $('#sheet');
  if (e.target.id === 'spaceForm') {
    const name = $('#spName').value.trim(); if (!name) return $('#spName').focus();
    let sp = spaceById(d.dataset.spid);
    if (!sp) { createSpace(name, d.dataset.newType, false); sp = spaceById(currentSpace); if (!sp) return closeSheet(); }
    sp.name = name; sp.note = $('#spNote').value.trim() || undefined;
    if (sp.type === 'project') {
      sp.client = $('#spClient').value || undefined; sp.due = $('#spDue').value || '';
    }
    const col = $('[data-color][aria-pressed="true"]', d); if (col) sp.color = col.dataset.color;
    touch(sp); closeSheet(); renderSpaces();
  } else if (e.target.id === 'taskForm') {
    const x = live(S.tasks).find(y => y.id === d.dataset.task); if (!x) return closeSheet();
    const v = $('#tkText').value.trim(); if (!v) return $('#tkText').focus();
    x.text = v; const tg = $('[data-tktag][aria-pressed="true"]', d); x.space = tg?.dataset.tktag || undefined; touch(x); closeSheet(); render();
  }
});

/* =====================================================================
   MORNING — pick three
   ===================================================================== */
function shouldMorning() {
  const h = new Date().getHours();
  return S.settings.v2morning !== false && S.settings.v2mSeen !== dkey() && h >= 4 && h < 13;
}
function yesterdayLine() {
  const y = dkey(addDays(new Date(), -1));
  const tasks = live(S.tasks).filter(t => t.done && dkey(new Date(t.doneAt || t.u || 0)) === y).length;
  let checks = 0; for (const h of activeHabits()) if (isChecked(h.id, y)) checks++;
  const best = activeHabits().map(h => ({ h, s: habitStreak(h.id) })).sort((a, b) => b.s - a.s)[0];
  if (!tasks && !checks) return 'A fresh day. Pick up to three things that matter.';
  return `Yesterday you closed ${plural(tasks + checks, 'thing', 'things')}.${best && best.s > 1 ? ` ${esc(spaceName(best.h.space) || best.h.name)} is on a ${best.s}-day rhythm.` : ''}`;
}
function showMorning() {
  S.settings.v2mSeen = dkey(); touch(S.settings);
  const k = dkey();
  const cand = [
    ...live(S.tasks).filter(t => !t.done).sort((a, b) => { const pa = spaceById(a.space), pb = spaceById(b.space); const da = pa?.due ? daysLeft(pa.due) : 99, db = pb?.due ? daysLeft(pb.due) : 99; return da - db || (a.c || 0) - (b.c || 0); }).map(t => ({ type: 'task', id: t.id, text: t.text, space: t.space })),
    ...activeHabits().filter(h => !isChecked(h.id, k)).map(h => ({ type: 'habit', id: h.id, text: h.name, space: h.space })),
  ].slice(0, 7);
  const picked = [];
  const name = (S.settings.name || '').trim();
  const d = new Date();
  const draw = () => {
    $('#morningInner').innerHTML = `
      <div class="bar"><span class="wordmark" aria-label="Aurora">AUR<svg aria-hidden="true"><use href="#sym"/></svg>RA</span><span class="muted" style="font-size:13px">${DAYS_LONG[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}</span></div>
      <div style="margin-top:clamp(12px,5vh,48px);flex-shrink:0"><span class="eyebrow">Good morning</span><h1>${name ? `Morning,<br>${esc(name)}.` : 'Good<br>morning.'}</h1><p class="lead">${yesterdayLine()}</p></div>
      ${cand.length ? `<div class="pick glass"><div class="w-h" style="margin-bottom:4px"><b>Pick three for today</b><small>${picked.length} of 3</small></div>${cand.map((c, i) => { const sp = spaceById(c.space), n = picked.indexOf(i);
        return `<button class="opt" data-pick="${i}" aria-pressed="${n >= 0}"><span class="dot" style="--c:${sp?.color || 'var(--fg-3)'}"></span><span class="t" style="flex:1;min-width:0;display:flex;flex-direction:column;gap:1px"><b style="font-size:15px;font-weight:600">${esc(c.text)}</b><small class="muted" style="font-size:12px">${esc(sp?.name || (c.type === 'habit' ? 'Habit' : 'Task'))}</small></span><span class="num">${n >= 0 ? n + 1 : ''}</span></button>`; }).join('')}</div>`
      : `<div class="pick glass"><p style="font-size:16px;font-weight:650">Nothing is waiting yet.</p><p class="muted" style="font-size:14px;margin-top:4px">Throw in the first thing and Aurora starts to take shape.</p></div>`}
      <div class="m-act"><button class="btn" id="mStart">${cand.length ? (picked.length ? 'Start the day' : 'Start the day') : 'Throw something in'}</button><button class="btn ghost" id="mSkip" style="border:0;height:40px">Skip to Home</button></div>`;
  };
  draw();
  const box = $('#morning'); box.hidden = false;
  box.onclick = e => {
    const p = e.target.closest('[data-pick]');
    if (p) { const i = Number(p.dataset.pick), at = picked.indexOf(i); if (at >= 0) picked.splice(at, 1); else if (picked.length < 3) picked.push(i); else toast('Three is enough'); draw(); return; }
    if (e.target.closest('#mSkip')) { box.hidden = true; return; }
    if (e.target.closest('#mStart')) {
      box.hidden = true;
      if (!cand.length) return openAdd('note');
      if (picked.length) { S.settings.three = { k, ids: picked.map(i => ({ type: cand[i].type, id: cand[i].id })) }; touch(S.settings); }
      showTab('home');
    }
  };
}

/* =====================================================================
   GLOBAL BINDINGS
   ===================================================================== */
$('#nav').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
document.addEventListener('click', e => {
  const t = e.target;
  if (homeEdit && !t.closest('#widgets,#done,#tray')) return;
  const add = t.closest('[data-add]'); if (add && !t.closest('#sheet')) { e.preventDefault(); return openAdd(add.dataset.add || 'note', add.dataset.addSpace || null); }
  const ns = t.closest('[data-new-space]'); if (ns) return openSpaceSheet(null, spaceFilter !== 'all' ? spaceFilter : 'personal');
  const os = t.closest('[data-open-space]'); if (os && !homeEdit) return openSpace(os.dataset.openSpace);
  const es = t.closest('[data-edit-space]'); if (es) return openSpaceSheet(es.dataset.editSpace);
  const vw = t.closest('[data-view]'); if (vw && !homeEdit) { const id = vw.dataset.view; const it = findItem(id); if (!it) return; const list = currentTab === 'board' ? boardItems() : (currentTab === 'spaces' && currentSpace ? [...momentsOf(currentSpace), ...notesOf(currentSpace)] : live(S.entries).filter(e => e.kind === 'image' || e.kind === 'video').sort((a, b) => (b.c || b.u) - (a.c || a.u))); return openViewer(id, list.some(x => x.id === id) ? list : [it]); }
  const go = t.closest('[data-goto]'); if (go) return showTab(go.dataset.goto);
  if (t.closest('[data-connect]')) return toast('Invoicing connection is coming soon.', 2600);
});
/* the shell never scrolls: only the areas meant to scroll do */
for (const el of [document.documentElement, document.body, $('#app'), $('#view'), ...$$('.tab')]) el.addEventListener('scroll', () => { if (el.scrollTop || el.scrollLeft) { el.scrollTop = 0; el.scrollLeft = 0; } });
$('#sheet').addEventListener('close', () => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); });
let lastW = innerWidth;
addEventListener('resize', debounce(() => { if ((innerWidth >= 900) !== (lastW >= 900)) render(); else if (currentTab === 'home') fitRows(); lastW = innerWidth; }, 120));
document.addEventListener('visibilitychange', () => { if (!document.hidden && currentTab === 'home') renderHome(); });

/* =====================================================================
   BOOT
   ===================================================================== */
async function playIntro() {
  if (S.settings.v2intro === false || !window.AuroraIntro) return;
  const root = document.getElementById('aurora-intro');
  const done = AuroraIntro.play({ theme: 'spectrum' });
  const auto = setTimeout(() => { if (root && root.style.display !== 'none') root.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); }, 3400);
  await Promise.race([done, wait(8000)]);
  clearTimeout(auto);
  if (root) root.style.display = 'none';
}
(async function boot() {
  S = await Store.load();
  applyLook();
  showTab('home');
  try { await Promise.race([document.fonts.ready, wait(1500)]); } catch (e) {}
  await playIntro();
  let seen = false; try { seen = localStorage.getItem('aurora.tutorial.seen.v2') === '1'; } catch (e) {}
  if (!seen && !S.settings.hideTutorial) {
    try { localStorage.setItem('aurora.tutorial.seen.v2', '1'); } catch (e) {}
    const tut = TUTORIAL(); if (tut) openViewer('tutorial', [tut]);
  } else if (shouldMorning()) showMorning();
  Store.keep();
  window.AURORA_BOOTED = true;
  try { AuroraCloud.start(); } catch (e) { console.warn('cloud', e); }
})().catch(err => { console.error(err); toast('Aurora could not start. Reload to try again.', 6000); });
