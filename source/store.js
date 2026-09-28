
/* =====================================================================
   STORE — the one data layer
   ---------------------------------------------------------------------
   Screens never touch storage directly. Everything goes through Store.
   Today IndexedDB sits underneath. When there is a login, only the inside
   gets swapped — the method signatures stay.
   ===================================================================== */
const Store = (() => {
  const KEY = 'state';

  /* --- migrations ------------------------------------------------------
     Every change to the shape of the data = a new version + a step below.
     Fixing the app must never wipe someone's data. Steps run in order from
     the stored version up to SCHEMA. */
  const steps = {
    // 1 → 2: sectors become data (S.spaces); items carry `space` instead of `sector`
    2(st) {
      const legacy = [
        { id: '00_Identity',      name: 'Identity',      c: '#6b5bd6' },
        { id: '01_Work',          name: 'Work',          c: '#3b6bdb' },
        { id: '02_Creative',      name: 'Creative',      c: '#d24f97' },
        { id: '03_Finance',       name: 'Money',         c: '#2f9e6a' },
        { id: '04_Goals',         name: 'Goals',         c: '#e08a1e' },
        { id: '05_Health',        name: 'Health',        c: '#1fa39a' },
        { id: '06_Relationships', name: 'Relationships', c: '#e0553a' },
        { id: '07_Knowledge',     name: 'Learning',      c: '#5a7cff' },
      ];
      const on = new Set(st.settings?.sectors || legacy.map(x => x.id));
      // A sector that was switched off but still holds something has to come
      // across too — otherwise that data is orphaned and shows up nowhere.
      for (const arr of ['habits', 'tasks', 'entries', 'goals'])
        for (const it of st[arr] || []) if (it.sector) on.add(it.sector);
      st.spaces = legacy
        .filter(x => on.has(x.id))
        .map((x, i) => ({ id: x.id, name: x.name, color: x.c, order: i, type: 'personal', u: now() }));
      for (const arr of ['habits', 'tasks', 'entries', 'goals']) {
        for (const it of st[arr] || []) {
          if (it.sector !== undefined) { it.space = it.sector; delete it.sector; }
        }
      }
      const meta = st.settings?.secMeta || {};
      for (const sp of st.spaces) if (meta[sp.id]?.meaning) sp.meaning = meta[sp.id].meaning;
      if (st.settings) { delete st.settings.sectors; delete st.settings.secMeta; }
      return st;
    },
    // 2 → 3: a finished task remembers WHEN it was finished (it used to read the edit time)
    3(st) {
      for (const t of st.tasks || []) if (t.done && !t.doneAt) t.doneAt = t.u || t.c || now();
      return st;
    },
    // 3 → 4: Drive is gone, and so are the leftover references to remote files
    4(st) {
      for (const e of st.entries || []) { delete e.driveId; delete e.posterDriveId; }
      if (st.settings?.bg) delete st.settings.bg.driveId;
      for (const k in (st.settings?.secBg || {})) delete st.settings.secBg[k].driveId;
      if (st.meta) { delete st.meta.lastSync; delete st.meta.dirty; }
      return st;
    },
    /* 4 → 5: People becomes Client. A friend and a client need different
       cards — one wants "when did we last speak", the other wants money.
       Trying to serve both left the card empty for everyone. Nothing is
       thrown away: every People Space carries across as a Client. */
    5(st) {
      for (const sp of st.spaces || []) {
        if (sp.type === 'people') {
          sp.type = 'client';
          /* a contact target was the closest thing to a relationship */
          sp.rel = sp.every ? 'retainer' : 'oneoff';
          delete sp.every;
        }
        if (sp.type === 'project' && !sp.state) { sp.state = 'me'; sp.stateAt = sp.u || now(); }
        if (sp.type === 'client' && !sp.rel) sp.rel = 'oneoff';
      }
      /* Home was rebuilt: the blocks are not the same blocks any more. */
      if (st.settings) st.settings.blocks = { focus: true, today: true, alerts: true, board: true, goals: true };
      return st;
    },
    /* 5 → 6: Goals fold into Projects. A goal was a name and a date; a job
       is a name, a date, a next step and tasks — the same thing with more
       room. Two places for "something with an end" meant neither got used. */
    6(st) {
      const colors = ['#6b5bd6','#3b6bdb','#d24f97','#2f9e6a','#1fa39a','#e0553a','#5a7cff','#e08a1e','#8a56c9','#2f8f86'];
      st.spaces ||= [];
      let order = st.spaces.reduce((m, x) => Math.max(m, x.order ?? 0), -1);
      for (const g of st.goals || []) {
        if (g.del) continue;
        const used = new Set(st.spaces.map(x => x.color));
        st.spaces.push({
          id: g.id, name: g.name || 'Goal', type: 'project',
          color: colors.find(c => !used.has(c)) || colors[st.spaces.length % colors.length],
          order: ++order, due: g.due || '', state: 'me', stateAt: g.u || g.c || now(),
          client: g.space && st.spaces.some(x => x.id === g.space && x.type === 'client') ? g.space : undefined,
          c: g.c, u: g.u,
        });
      }
      st.goals = [];
      if (st.settings?.blocks) delete st.settings.blocks.goals;
      return st;
    },
  };

  function migrate(saved) {
    let st = saved, from = Number(st.v || 1);
    for (let v = from + 1; v <= SCHEMA; v++) {
      if (steps[v]) { try { st = steps[v](st) || st; } catch (e) { console.warn('migrace ' + v, e); } }
      st.v = v;
    }
    return st;
  }

  async function load() {
    let saved = null;
    try { saved = await DB.get('kv', KEY); } catch (e) { console.warn('load', e); }
    if (!saved || !saved.settings) return defaultState();
    const st = migrate(saved);
    const d = defaultState();
    const out = { ...d, ...st };
    out.settings = { ...d.settings, ...st.settings };
    out.settings.blocks = { ...d.settings.blocks, ...(st.settings.blocks || {}) };
    out.meta = { ...d.meta, ...(st.meta || {}) };
    out.spaces = Array.isArray(st.spaces) && st.spaces.length ? st.spaces : d.spaces;
    return out;
  }

  let saveRevision=0;
  function save(){
    const revision=++saveRevision, snapshot=structuredClone(S);
    const status=(value)=>{window.AURORA_SAVE_STATE=value;parent.postMessage({type:'aurora-storage-status',status:value},auroraTargetOrigin())};
    status('saving');
    return DB.set('kv',KEY,snapshot).then(()=>{if(revision===saveRevision)status('saved')}).catch(error=>{status('error');console.warn('Save failed',error);if(typeof toast==='function')toast('Changes could not be saved. Make a backup in Settings.');parent.postMessage({type:'aurora-design-error',message:'Changes could not be saved locally. Download your app or a backup.'},auroraTargetOrigin())});
  }

  /* media lives in the same layer, so screens never deal with it */
  const media = {
    put: (id, blob) => DB.set('images', id, blob),
    get: id => DB.get('images', id).catch(() => null),
    del: id => DB.del('images', id),
  };

  async function wipe() {
    await DB.clear('kv'); await DB.clear('images');
    localStorage.clear(); sessionStorage.clear();
  }

  /* ask the browser not to evict the data when it needs room */
  async function keep() {
    try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); }
    catch (e) {}
  }

  return { load, save, media, wipe, keep, migrate };
})();

/* =====================================================================
   BOOT
   ===================================================================== */
