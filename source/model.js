
'use strict';
/* =====================================================================
   AURORA — open test
   A good-looking place to throw what you do. It shows you where your
   attention actually went.
   ---------------------------------------------------------------------
   Everything lives in Spaces. A Space is a piece of your world: a personal
   area, a person, or a project. The type decides what the card shows —
   there are no fields to configure.

   Data
     space  { id, name, color, order, type, note?, u, del }
              type 'personal' — note = what this area means to me
              type 'client'   — note = what I do for them; rel = lead|oneoff|retainer|dormant;
                                decides = who signs it off
              type 'project'  — note = where it stands; client = id of the Client it hangs under;
                                state = me|them|done|invoiced|paid; stateAt = when that was set;
                                due = deadline; next = the one next step;
                                price, fixed, deposit = none|due|paid, rounds, used, hours,
                                deliver = what gets handed over, invDue = invoice due date
     habit  { id, name, space, c, u, del }            — repeats, has a streak, moves its Space
     task   { id, text, space?, done, doneAt, c, u, del }
     entry  { id, kind:'note'|'image'|'video', text, img, mime, dur, poster, space?, c, u, del }
     goal   { id, name, space?, due, c, u, del }
     checks { [habitId]: { [YYYY-MM-DD]: { v:1|0, u } } }
     later  { [habitId]: { [YYYY-MM-DD]: { v:1|0, u } } }  — "not yet today"; never counts in the wheel
     skips  { [habitId]: { [YYYY-MM-DD]: { v:1|0, u } } }  — "does not apply today"; does not break the streak

   Attention wheel = everything that landed in a personal Space over 7 days.
   Data lives on this device only. No server, no sync.
   ===================================================================== */

const VERSION = '2.0';
const PREVIEW = window.AURORA_FORCE_PREVIEW ?? (new URLSearchParams(location.search).get('preview') === '1' || (location.protocol==='file:' && new URLSearchParams(location.search).get('personal')!=='1'));
const SCHEMA = 6;          // verze tvaru dat — viz migrace ve Store
/* Default set of personal Spaces. Generated on first run; from then on it
   is data — rename, add and remove as you like. */
const SPACE_SEED = [
  { id:'00_Identity',      name:'Identity',      color:'#6b5bd6' },
  { id:'01_Work',          name:'Work',          color:'#3b6bdb' },
  { id:'02_Creative',      name:'Creative',      color:'#d24f97' },
  { id:'03_Finance',       name:'Money',         color:'#2f9e6a' },
  { id:'05_Health',        name:'Health',        color:'#1fa39a' },
  { id:'06_Relationships', name:'Relationships', color:'#e0553a' },
  { id:'07_Knowledge',     name:'Learning',      color:'#5a7cff' },
];
const SPACE_TYPES = {
  personal: { name: 'Personal', hint: 'an area of your life' },
  client:   { name: 'Client',   hint: 'someone who pays you' },
  project:  { name: 'Project',  hint: 'a job with an end' },
};
/* A client is a relationship, not a job. The relationship decides the card. */
const RELATIONS = {
  lead:     { name: 'Lead',     hint: 'asked, not agreed yet' },
  oneoff:   { name: 'One-off',  hint: 'a job at a time' },
  retainer: { name: 'Retainer', hint: 'running, paid monthly' },
  dormant:  { name: 'Dormant',  hint: 'nothing running now' },
};
/* Who is holding the job up. This is the state that matters, not active/paused. */
const PSTATES = {
  me:       { name: 'With me',   tone: 'go'   },
  them:     { name: 'With them', tone: 'wait' },
  done:     { name: 'Done',      tone: 'go'   },
  invoiced: { name: 'Invoiced',  tone: 'wait' },
  paid:     { name: 'Paid',      tone: 'go'   },
};
const DEPOSITS = { none: 'No deposit', due: 'Deposit due', paid: 'Deposit paid' };
/* After this many days a job sitting "with them" is worth a nudge. */
const NUDGE_DAYS = 3;
/* After this many silent days a client counts as gone quiet. */
const QUIET_DAYS = 30;
/* colours for newly added Spaces, so nobody has to pick one */
const SPACE_COLORS = ['#6b5bd6','#3b6bdb','#d24f97','#2f9e6a','#1fa39a','#e0553a','#5a7cff','#e08a1e','#8a56c9','#2f8f86'];

const spaceById = id => S.spaces?.find(x => x.id === id && !x.del) || null;
const spaceColor = id => (S.settings.secColors === false ? null : spaceById(id)?.color) || null;
const secVar = id => { const c = spaceColor(id); return c ? `--sec:${c};` : ''; };
const spaceName = id => spaceById(id)?.name || '';

/* What each type calls its one free line, and what the + button makes. */
const SPACE_COPY = {
  personal: { note: 'What this area means to me', add: 'Habit' },
  client:   { note: 'What I do for them',         add: 'Project' },
  project:  { note: 'Where it stands right now',  add: 'Task' },
};

/* How long since anything happened in a Space. */
function quietDays(sid) {
  const last = lastContact(sid);
  return last ? Math.floor((Date.now() - last) / 86400000) : null;
}
const daysSince = t => (t ? Math.floor((Date.now() - t) / 86400000) : null);

/* ---- client ⇄ project ----------------------------------------------
   Money lives on the project. The client only sums up what hangs under it. */
const clientProjects = cid => allSpaces().filter(s => s.type === 'project' && s.client === cid);
const projectClient  = sp => (sp.client ? spaceById(sp.client) : null);

/* Is an issued invoice past its due date, and by how much? */
function invoiceState(sp) {
  if (sp.state !== 'invoiced' || !sp.invDue) return { over: false, days: 0 };
  const d = -daysLeft(sp.invDue);
  return { over: d > 0, days: Math.max(0, d) };
}
function clientMoney(cid) {
  let earned = 0, awaiting = 0, overdue = 0, overDays = 0;
  for (const p of clientProjects(cid)) {
    const amt = Number(p.price) || 0;
    if (p.state === 'paid') { earned += amt; continue; }
    if (p.state !== 'invoiced') continue;
    const iv = invoiceState(p);
    if (iv.over) { overdue += amt; overDays = Math.max(overDays, iv.days); }
    else awaiting += amt;
  }
  return { earned, awaiting, overdue, overDays };
}
/* Real rate — hours are logged to check the job feeds you, not to bill them. */
function projectRate(sp) {
  const h = Number(sp.hours) || 0, amt = Number(sp.price) || 0;
  if (!h || !amt || sp.fixed === false) return null;   // an hourly price already is the rate
  return { h, amt, rate: Math.round(amt / h) };
}
function projectState(sp) {
  const key = sp.state || 'me';
  const st = PSTATES[key] || PSTATES.me;
  const days = key === 'them' ? (daysSince(sp.stateAt) ?? 0) : 0;
  const iv = invoiceState(sp);
  if (iv.over) return { key: 'overdue', name: 'Overdue', tone: 'bad', days: iv.days };
  return { key, name: st.name, tone: st.tone, days };
}

/* ---- what actually needs you ---------------------------------------
   Money first, then things sitting with someone else, then silence. */
function homeAlerts() {
  const out = [];
  for (const p of allSpaces().filter(s => s.type === 'project')) {
    const iv = invoiceState(p);
    if (iv.over) {
      const c = projectClient(p);
      out.push({ kind: 'cash', id: p.id, text: `${c ? c.name : p.name} is overdue`,
                 val: fmtMoney(p.price), days: iv.days, sort: 1e9 + iv.days });
    }
  }
  for (const p of allSpaces().filter(s => s.type === 'project')) {
    const d = daysSince(p.stateAt);
    if (p.state === 'them' && d != null && d >= NUDGE_DAYS)
      out.push({ kind: 'wait', id: p.id, text: `${p.name} — with them`, val: d + ' d', days: d, sort: 1e6 + d });
  }
  for (const c of allSpaces().filter(s => s.type === 'client' && s.rel !== 'dormant' && s.rel !== 'lead')) {
    const d = quietDays(c.id);
    if (d != null && d >= QUIET_DAYS)
      out.push({ kind: 'wait', id: c.id, text: `${c.name} — no contact`, val: d + ' d', days: d, sort: d });
  }
  return out.sort((a, b) => b.sort - a.sort);
}
const fmtMoney = n => (Number(n) || 0).toLocaleString('cs-CZ').replace(/ /g, ' ');

/* Today's habits across every personal Space — the one list you tick on Home. */
function todayHabits() {
  const k = dkey();
  return activeHabits()
    .filter(h => spaceById(h.space)?.type === 'personal')
    .map(h => ({ h, done: isChecked(h.id, k) }))
    .sort((a, b) => (a.done - b.done));
}
/* Days out of the last seven this Space moved. Replaces the streak: one
   missed day should not wipe the board and make you stop opening it. */
const spaceDays7 = sid => sectorWeek(sid).filter(d => d.on).length;

const SUGGESTED = {
  '00_Identity':      ['10 min in the morning without the phone', 'One line at night on what went well'],
  '01_Work':          ['One step on the main project', 'Close the day with a short note'],
  '02_Creative':      ['30 min making something for myself', 'Save 3 references'],
  '03_Finance':       ["Write down today's spending", 'Nothing on impulse'],
  '05_Health':        ['Move', '7+ h of sleep', '2 l of water'],
  '06_Relationships': ['Reach out to someone', 'Time with people close to me'],
  '07_Knowledge':     ['20 min of reading', 'Learn one thing and write it down'],
};
/* for Spaces people add themselves */
const SUGGESTED_ANY = ['One small step', 'Ten minutes a day', 'Note down how it went'];

/* =====================================================================
   EMPTY CARD = AN OFFER
   A blank card looks broken and tells you nothing. Instead the empty space
   fills with things you can tap in. For a job the offer doubles as the
   checklist of what to nail down before you start.
   ===================================================================== */
/* Names are whatever the person calls them, so both languages are matched —
   the UI is English but nobody names their own areas in it. */
const SUGGEST_BY_WORD = [
  { re: /health|fit|body|gym|sport|train|zdrav|kondic|telo|tělo|běh|beh|posilov/i,
    list: ['Move', '2 l of water', '7+ h of sleep'] },
  { re: /money|finance|cash|budget|spend|peníz|peniz|rozpoč|rozpoc|útrat|utrat|kasa|faktur/i,
    list: ["Log what I spent", 'Weekly review', 'No delivery food'] },
  { re: /work|job|business|office|prác|prac|firma|kancelář|kancelar|byznys/i,
    list: ['One step on the main job', 'Close the day with a note'] },
  { re: /creat|design|art|music|beat|video|photo|tvor|grafik|hudb|foto|kreativ|střih|strih/i,
    list: ['Make something for myself', 'Save 3 references'] },
  { re: /learn|study|school|read|knowledge|uč|uc|škol|skol|stud|čten|cten|kniha|znalost/i,
    list: ['Read 20 min', 'Write down one thing I learned'] },
  { re: /relation|family|friend|love|vztah|rodin|kamarád|kamarad|přátel|pratel|lásk|lask/i,
    list: ['Reach out to someone', 'Time with people close to me'] },
  { re: /identity|self|mind|head|calm|hlava|klid|mysl|identit|já|ja$/i,
    list: ['10 min without the phone', 'One line at night'] },
  { re: /home|house|flat|clean|domov|byt|úklid|uklid|dům|dum/i,
    list: ['Ten minutes of tidying', 'One thing off the list'] },
];
function suggestFor(sp) {
  if (SUGGESTED[sp.id]) return SUGGESTED[sp.id];
  const hit = SUGGEST_BY_WORD.find(x => x.re.test(sp.name || ''));
  return hit ? hit.list : SUGGESTED_ANY;
}
/* First tasks offered on an empty job, guessed from its name. */
const TASKS_BY_WORD = [
  { re: /video|reel|clip|edit|film/i,   list: ['Get the brief', 'Collect the footage', 'Send a cut'] },
  { re: /web|site|page|landing/i,       list: ['Agree the pages', 'Write the copy', 'Send the first design'] },
  { re: /logo|brand|identity|visual/i,  list: ['Collect references', 'Send three directions', 'Build the guide'] },
  { re: /beat|track|music|sound|mix/i,  list: ['Agree the reference', 'Send a demo', 'Master the final'] },
  { re: /social|insta|campaign|post/i,  list: ['Agree the plan', 'Prepare the posts', 'Schedule them'] },
];
function firstTasksFor(sp) {
  const hit = TASKS_BY_WORD.find(x => x.re.test(sp.name || ''));
  return hit ? hit.list : ['Get the brief', 'Do the first pass', 'Send it over'];
}
const ACCENTS = ['#4f6bff','#7b4fd6','#e0453a','#e08a1e','#2f9e6a','#1f9bd6','#111318','#ffffff'];
const WHEEL_DAYS = 7;
const VIDEO_MAX_S = 60;
const VIDEO_MAX_MB = 120;

/* ---------- tiny helpers ---------- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2,8));
const now = () => Date.now();
const pad = n => String(n).padStart(2,'0');
const dkey = (d=new Date()) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseKey = k => { const [y,m,d] = k.split('-').map(Number); return new Date(y, m-1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const fmtShort = d => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
const fmtLong  = d => `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isPhone = () => matchMedia('(pointer:coarse)').matches && innerWidth < 900;
const DEVICE = isPhone() ? 'phone' : 'desktop';
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ---------- IndexedDB ---------- */
const DB = (() => {
  let dbp;
  const open = () => dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('aurora-test-local-v1', 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('kv'); d.createObjectStore('images'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = async (store, mode, fn) => {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode); const s = t.objectStore(store);
      const q = fn(s); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error);
    });
  };
  return {
    get: (store, k) => tx(store, 'readonly', s => s.get(k)),
    set: (store, k, v) => tx(store, 'readwrite', s => s.put(v, k)),
    del: (store, k) => tx(store, 'readwrite', s => s.delete(k)),
    keys: store => tx(store, 'readonly', s => s.getAllKeys()),
    clear: store => tx(store, 'readwrite', s => s.clear()),
  };
})();

/* ---------- state ---------- */
const defaultState = () => ({
  v: SCHEMA,
  settings: {
    u: 0, onboarded: false,
    theme: 'dark', family: 'a', accent: '#2d9f70', typo: 'condensed', dens: 'normal',
    name: '',
    blocks: { focus: true, today: true, alerts: true, board: true },
    intro: '', noise: 18, bg: null, bgBlur: 30,    // bg: { img }
    secColors: true, secBg: {},                   // secBg: { [spaceId]: { img } }
    seenYesterday: '', seenWeek: '', seenLook: false,   // first-week cards (07)
    pinned: '',                                   // a Space pinned to the top of Home
    tips: {},                                     // in-place tips already seen (v10)
  },
  spaces: [],
  habits: [], tasks: [], entries: [], goals: [], checks: {}, later: {}, skips: {},
  meta: { updatedAt: 0, device: DEVICE },
});
let S = defaultState();

/* persist (debounced write-through) */
function touch(obj) { if (obj) obj.u = now(); S.meta.updatedAt = now(); S.meta.device = DEVICE; Store.save(); }

/* ---------- derived ---------- */
const live = arr => arr.filter(x => !x.del);
const allSpaces = () => live(S.spaces || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const personalSpaces = () => allSpaces().filter(s => s.type === 'personal');
/* The wheel shows personal Spaces only — with ten clients it would stop making sense. */
const activeSectors = () => personalSpaces();
/* The tagger offers every Space, personal ones first. */
const taggerSpaces = () => [...personalSpaces(), ...allSpaces().filter(s => s.type !== 'personal')];
const activeHabits = () => live(S.habits).filter(h => !!spaceById(h.space));
const isChecked = (hid, key) => !!(S.checks[hid]?.[key]?.v);
const isLater = (hid, key = dkey()) => !!(S.later?.[hid]?.[key]?.v);
function setLater(hid, v, key = dkey()) {
  S.later ||= {}; S.later[hid] ||= {};
  S.later[hid][key] = { v: v ? 1 : 0, u: now() };
  touch();
}
const isSkipped = (hid, key = dkey()) => !!(S.skips?.[hid]?.[key]?.v);
function setSkip(hid, v, key = dkey()) {
  S.skips ||= {}; S.skips[hid] ||= {};
  S.skips[hid][key] = { v: v ? 1 : 0, u: now() };
  touch();
}
function setCheck(hid, key, v) {
  S.checks[hid] ||= {};
  S.checks[hid][key] = { v: v ? 1 : 0, u: now() };
  touch();
}
function habitStreak(hid) {
  // consecutive checked days ending today (or yesterday if today is still open).
  // A skipped day is transparent: it does not add to the streak, but it does not break it either.
  let d = new Date(); let n = 0, guard = 0;
  if (!isChecked(hid, dkey(d)) && !isSkipped(hid, dkey(d))) d = addDays(d, -1);
  while (guard++ < 3650) {
    const k = dkey(d);
    if (isChecked(hid, k)) n++;
    else if (!isSkipped(hid, k)) break;
    d = addDays(d, -1);
  }
  return n;
}
/* Attention — everything that landed in this sector over the last 7 days:
   entries (notes, photos, clips), finished tasks and checked habits.
   Target is one touch a day, so 7 touches = a full ring. */
const ATTENTION_TARGET = WHEEL_DAYS;
function sectorTouches(sid) {
  const from = parseKey(dkey(addDays(new Date(), -(WHEEL_DAYS - 1)))).getTime();
  const out = { entries: 0, tasks: 0, checks: 0 };
  for (const e of live(S.entries)) if (e.space === sid && (e.c || e.u) >= from) out.entries++;
  for (const t of live(S.tasks))   if (t.space === sid && t.done && (t.doneAt || t.c) >= from) out.tasks++;
  for (const h of activeHabits().filter(h => h.space === sid))
    for (let i = 0; i < WHEEL_DAYS; i++) if (isChecked(h.id, dkey(addDays(new Date(), -i)))) out.checks++;
  out.total = out.entries + out.tasks + out.checks;
  return out;
}
const sectorEverTouched = sid =>
  live(S.habits).some(h => h.space === sid) ||
  live(S.entries).some(e => e.space === sid) ||
  live(S.tasks).some(t => t.space === sid);
function sectorScore(sid) {
  if (!sectorEverTouched(sid)) return null;          // never used — that is information, not a zero
  return Math.min(1, sectorTouches(sid).total / ATTENTION_TARGET);
}
function dayRatio(key) {
  // share of active habits checked that day (0..1), null if no habits
  const hs = activeHabits(); if (!hs.length) return null;
  let n = 0; for (const h of hs) if (isChecked(h.id, key)) n++;
  return n / hs.length;
}
function lastDays(n) { const out = []; for (let i = n - 1; i >= 0; i--) { const k = dkey(addDays(new Date(), -i)); out.push({ k, r: dayRatio(k) }); } return out; }
function overallStreaks() {
  // day counts when every active habit is checked ("completed day");
  // current streak = consecutive days with at least one habit checked.
  const hs = activeHabits(); if (!hs.length) return { cur: 0, best: 0, done: 0 };
  const days = new Set();
  for (const h of hs) for (const k in (S.checks[h.id] || {})) if (S.checks[h.id][k].v) days.add(k);
  const sorted = [...days].sort();
  let best = 0, run = 0, prev = null;
  for (const k of sorted) { run = (prev && dkey(addDays(parseKey(prev), 1)) === k) ? run + 1 : 1; best = Math.max(best, run); prev = k; }
  let d = new Date(), cur = 0; if (!days.has(dkey(d))) d = addDays(d, -1);
  while (days.has(dkey(d))) { cur++; d = addDays(d, -1); }
  let done = 0; for (const k of sorted) if (dayRatio(k) === 1) done++;
  return { cur, best, done };
}

/* ---- goals: a name, a date, an area. Nothing else. ---- */
const daysLeft = due => due ? Math.ceil((parseKey(due) - parseKey(dkey())) / 86400000) : null;
function goalTime(g) {                                  // 0..1 elapsed toward the deadline
  if (!g.due) return null;
  const start = g.c || g.u, end = parseKey(g.due).getTime() + 86400000;
  if (end <= start) return 1;
  return Math.max(0, Math.min(1, (Date.now() - start) / (end - start)));
}
const goalsByDue = () => live(S.goals).slice().sort((a, b) => {
  if (!a.due) return 1; if (!b.due) return -1; return a.due < b.due ? -1 : 1;
});
const nextGoal = () => goalsByDue()[0] || null;
/* consecutive days ending today (or yesterday if today is still open) with at least one of `ids` checked */
function anyStreak(ids) {
  if (!ids.length) return 0;
  const hit = k => ids.some(id => isChecked(id, k));
  let d = new Date(); if (!hit(dkey(d))) d = addDays(d, -1);
  let n = 0; while (hit(dkey(d))) { n++; d = addDays(d, -1); }
  return n;
}
const sectorHabitIds = sid => activeHabits().filter(h => h.space === sid).map(h => h.id);
function touchedOn(sid, key) {
  if (sectorHabitIds(sid).some(id => isChecked(id, key))) return true;
  if (live(S.entries).some(e => e.space === sid && dkey(new Date(e.c || e.u)) === key)) return true;
  if (live(S.tasks).some(t => t.space === sid && t.done && dkey(new Date(t.doneAt || t.c)) === key)) return true;
  return false;
}
function sectorStreak(sid) {
  let d = new Date(); if (!touchedOn(sid, dkey(d))) d = addDays(d, -1);
  let n = 0; while (touchedOn(sid, dkey(d))) { n++; d = addDays(d, -1); }
  return n;
}
const sectorWeek = sid => lastDays(WHEEL_DAYS).map(d => ({ k: d.k, on: touchedOn(sid, d.k) }));

/* ---------- weekly summary (the "Your week" card) ---------------------
   Computed locally from the data. No AI, no server: the code does the
   numbers, the sentence is a template picked by those numbers. It renders
   as the first report slot — module output will land here one day. */
function weekSummary() {
  const from = parseKey(dkey(addDays(new Date(), -(WHEEL_DAYS - 1)))).getTime();
  const per = personalSpaces().map(sp => ({ sp, n: sectorTouches(sp.id).total }))
    .filter(x => x.n > 0).sort((a, b) => b.n - a.n);
  const top = per[0] || null;
  const quiet = personalSpaces()
    .map(sp => ({ sp, n: sectorTouches(sp.id).total }))
    .filter(x => sectorEverTouched(x.sp.id))
    .sort((a, b) => a.n - b.n)[0] || null;

  let best = null;
  for (const h of activeHabits()) {
    const st = habitStreak(h.id);
    if (st > 0 && (!best || st > best.days)) best = { name: h.name, days: st };
  }
  const notes = live(S.entries).filter(e => (e.c || e.u) >= from).length;
  const done  = live(S.tasks).filter(t => t.done && (t.doneAt || t.c) >= from).length;
  const reached = live(S.spaces).filter(sp => sp.type === 'client' && lastContact(sp.id) >= from)
    .map(sp => sp.name);

  let line;
  if (!per.length && !notes && !done) line = 'This week is still empty. Nothing happens until you throw something in.';
  else if (top && quiet && top.sp.id !== quiet.sp.id && quiet.n === 0)
    line = `Attention went to ${top.sp.name}. ${quiet.sp.name} sat out the whole week.`;
  else if (top && best) line = `Most of it happened in ${top.sp.name}. Longest streak: ${best.name}, ${best.days} days.`;
  else if (top) line = `Most of it happened in ${top.sp.name}.`;
  else line = 'A few things landed here, but nothing is adding up yet.';

  return { per, top, quiet, best, notes, done, reached, line, days: WHEEL_DAYS };
}

/* Last contact for a People Space = the latest note or finished task in it. */
function lastContact(sid) {
  let t = 0;
  for (const e of live(S.entries)) if (e.space === sid) t = Math.max(t, e.c || e.u || 0);
  for (const x of live(S.tasks)) if (x.space === sid && x.done) t = Math.max(t, x.doneAt || x.c || 0);
  return t;
}

function exportObject() {
  return { app: 'aurora', version: VERSION, schema: SCHEMA, exportedAt: new Date().toISOString(), state: S };
}

const imgURL = new Map();
const IMG_CACHE_MAX = 24;                       // blob URLs held at once; oldest gets revoked
async function imageUrl(id) {
  if (imgURL.has(id)) { const u = imgURL.get(id); imgURL.delete(id); imgURL.set(id, u); return u; }
  const blob = await Store.media.get(id).catch(() => null);
  if (!blob) return null;
  const u = URL.createObjectURL(blob); imgURL.set(id, u);
  while (imgURL.size > IMG_CACHE_MAX) {
    const k = imgURL.keys().next().value;
    try { URL.revokeObjectURL(imgURL.get(k)); } catch (err) {}
    imgURL.delete(k);
  }
  return u;
}
function forgetImage(id) {
  if (!imgURL.has(id)) return;
  try { URL.revokeObjectURL(imgURL.get(id)); } catch (err) {}
  imgURL.delete(id);
}
function probeVideo(file) {
  return new Promise((res, rej) => {
    const v = document.createElement('video'); const url = URL.createObjectURL(file);
    v.preload = 'metadata'; v.muted = true; v.playsInline = true;
    let settled = false;
    const done = out => { if (settled) return; settled = true; URL.revokeObjectURL(url); res(out); };
    const fail = () => { if (settled) return; settled = true; URL.revokeObjectURL(url); rej(new Error('unreadable')); };
    v.onerror = fail;
    const guard = setTimeout(() => { if (v.duration) done({ dur: v.duration, poster: null }); else fail(); }, 6000);
    v.onloadedmetadata = () => {
      const dur = v.duration || 0;
      if (!isFinite(dur) || dur <= 0) { clearTimeout(guard); return done({ dur: 0, poster: null }); }
      const draw = () => {
        clearTimeout(guard);
        try {
          const r = Math.min(1, 900 / Math.max(v.videoWidth || 1, v.videoHeight || 1));
          const c = document.createElement('canvas');
          c.width = Math.max(2, Math.round((v.videoWidth || 320) * r));
          c.height = Math.max(2, Math.round((v.videoHeight || 180) * r));
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          c.toBlob(b => done({ dur, poster: b }), 'image/jpeg', .8);
        } catch { done({ dur, poster: null }); }
      };
      v.onseeked = draw;
      setTimeout(() => { if (!settled) draw(); }, 1200);
      try { v.currentTime = Math.min(0.25, dur / 10); } catch { draw(); }
    };
    v.src = url;
  });
}
function shrinkImage(file, max = 1600, q = .82) {
  return new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => { URL.revokeObjectURL(url); b ? res(b) : rej(new Error('encode')); }, 'image/jpeg', q);
    };
    img.onerror = rej; img.src = url;
  });
}

/* ---------- ui primitives ---------- */
let toastT;
function toast(msg, ms = 1800) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }
function confirmSheet(text) {
  return new Promise(res => {
    const d = $('#confirmSheet'); $('#confirmText').textContent = text;
    const done = v => { d.close(); res(v); };
    $('#confirmYes').onclick = () => done(true); $('#confirmNo').onclick = () => done(false);
    d.onclose = () => res(false);
    d.showModal();
  });
}
function lightDismiss(d) {
  if ('closedBy' in HTMLDialogElement.prototype) { d.setAttribute('closedby', 'any'); return; }
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
}
$$('dialog').forEach(lightDismiss);
