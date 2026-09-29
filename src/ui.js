/* ==========================================================================
   DART SCOREBOARD: UI (rendering, input, persistence, sheets)
   Rendering is string templates into three roots (screen, sheet, dialog).
   All clicks go through one delegated handler keyed by data-act.
   ========================================================================== */
(() => {
  'use strict';
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const fmt2 = (n) => (Number.isFinite(n) ? n : 0).toFixed(2);
  const fmtPct = (n) => fmt2(n) + '%';

  /* ---------- icons ---------- */
  function gear(cx, cy, r, teeth) {
    const pts = [], inner = r * 0.78;
    for (let i = 0; i < teeth * 2; i++) {
      const rad = i % 2 ? inner : r;
      const a0 = ((i - 0.35) / (teeth * 2)) * Math.PI * 2, a1 = ((i + 0.35) / (teeth * 2)) * Math.PI * 2;
      pts.push([cx + rad * Math.sin(a0), cy - rad * Math.cos(a0)], [cx + rad * Math.sin(a1), cy - rad * Math.cos(a1)]);
    }
    return 'M' + pts.map((p) => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('L') + 'Z';
  }
  const sv = (body, extra) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra || ''}>${body}</svg>`;
  const I = {
    home: sv('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1z"/>'),
    players: sv('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.8"/><path d="M16.5 14.6c2.6.1 4.4 1.8 5 4.9"/>'),
    stats: sv('<rect x="4" y="12" width="4" height="8" rx="1"/><rect x="10" y="5" width="4" height="15" rx="1"/><rect x="16" y="9" width="4" height="11" rx="1"/>'),
    history: sv('<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4v4.5h4.5"/><path d="M12 7.5V12l3 2"/>'),
    settings: sv(`<path d="${gear(9, 10, 6.4, 8)}"/><circle cx="9" cy="10" r="2.2"/><path d="${gear(17.6, 17.4, 4.2, 6)}"/><circle cx="17.6" cy="17.4" r="1.3"/>`, 'stroke-width="1.7"'),
    share: sv('<path d="M12 3v12"/><path d="m7.5 7.5 4.5-4.5 4.5 4.5"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/>'),
    robotPlus: sv('<rect x="3" y="8" width="12" height="10" rx="2.5"/><path d="M9 8V5"/><circle cx="9" cy="4" r="1"/><circle cx="6.8" cy="12.5" r=".9" fill="currentColor"/><circle cx="11.2" cy="12.5" r=".9" fill="currentColor"/><path d="M7 15.5h4"/><path d="M19.5 9v6M16.5 12h6"/>'),
    personPlus: sv('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M19 8v6M16 11h6"/>'),
    trash: sv('<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>'),
    menu: sv('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    dart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.6 21.4 8 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M7.2 17.8 6.2 16.8l1-2.2 6.8-6.8 2.2 2.2-6.8 6.8z" fill="currentColor"/><path d="m15 7.4 1.6-4.8 1.3 2.7 2.8 1.2-4.8 1.7z" fill="currentColor"/></svg>`,
    dia: sv('<circle cx="12" cy="12" r="7"/><path d="M5 19 19 5"/>'),
    lock: sv('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    undo: sv('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
    close: sv('<path d="M6 6l12 12M18 6 6 18"/>'),
    back: sv('<path d="m15 5-7 7 7 7"/>'),
    more: sv('<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>'),
    info: sv('<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.5" r=".8" fill="currentColor"/>'),
    edit: sv('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
    plus: sv('<path d="M12 5v14M5 12h14"/>'),
    trophy: sv('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3"/><path d="M12 13v4M8.5 20h7M10 17h4v3h-4z"/>'),
    end: sv('<path d="M5 12h11"/><path d="m12 7 5 5-5 5"/><path d="M20 5v14"/>'),
    check: sv('<path d="m5 12.5 4.5 4.5L19 7"/>'),
    target: sv('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>'),
  };
  const markSvg = (n) => {
    if (n <= 0) return '';
    const slash = '<path d="M7 17 17 7"/>', back = '<path d="M7 7l10 10"/>';
    if (n === 1) return sv(slash, 'stroke-width="2.6"');
    if (n === 2) return sv(slash + back, 'stroke-width="2.6"');
    return sv('<circle cx="12" cy="12" r="9"/>' + slash + back, 'stroke-width="2.4"');
  };
  const markText = (n) => (n <= 0 ? 'no marks' : n === 1 ? 'one mark' : n === 2 ? 'two marks' : 'closed');

  /* ---------- names ---------- */
  const OUT_NAMES = { straight: 'Straight Out', double: 'Double Out', master: 'Master Out' };
  const IN_NAMES = { straight: 'Straight In', double: 'Double In', master: 'Master In' };
  const FORMAT_NAMES = { firstTo: 'First to', bestOf: 'Best of' };
  const SCORING_NAMES = { standard: 'Standard', cutthroat: 'Cut-Throat', noscore: 'No Score' };
  const HOUSE_NAME = 'One Bust, Low Score';
  const ORD = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth'];

  /* ---------- storage (localStorage with in-memory fallback) ---------- */
  const STORE_KEY = 'dartScoreboard.v1', UI_KEY = 'dartScoreboard.ui';
  const mem = {};
  let storageWarned = false;
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return k in mem ? mem[k] : null; } }
  function lsSet(k, v) {
    try { window.localStorage.setItem(k, v); } catch (e) {
      mem[k] = v;
      if (!storageWarned) { storageWarned = true; toast('Saving is unavailable in this browser. Data lasts until the page closes.'); }
    }
  }
  function ssGet(k) { try { return window.sessionStorage.getItem(k); } catch (e) { return mem['s:' + k] || null; } }
  function ssSet(k, v) { try { window.sessionStorage.setItem(k, v); } catch (e) { mem['s:' + k] = v; } }

  function defaultStore() {
    return {
      v: 1, players: [], matches: [], activeMatchId: null,
      home: {
        mode: 'x01', roster: [], randomOrder: false,
        x01: { points: 501, checkOut: 'straight', checkIn: 'straight', format: 'firstTo', sets: 3, legs: 1, houseRule: { oneBustLowScore: false, bustAllowance: 1 } },
        cricket: { scoring: 'standard', numbers: 'standard', format: 'firstTo', sets: 3, legs: 1 },
      },
      settings: { sound: true, vibration: true, earlyEnd: true, suggestions: true, wakeLock: false, theme: 'system', voice: false, inputMode: 'dart' },
      statsFilter: { mode: 'x01', range: 'all', hidden: [] },
      gamesFilter: { mode: 'all', player: '' },
      lastBackupAt: null,
    };
  }
  function mergeStore(data) {
    const d = defaultStore();
    if (!data || typeof data !== 'object') return d;
    const out = Object.assign(d, {
      players: Array.isArray(data.players) ? data.players : [],
      matches: Array.isArray(data.matches) ? data.matches : [],
      activeMatchId: data.activeMatchId || null,
    });
    if (data.home) {
      out.home = Object.assign(d.home, data.home);
      out.home.x01 = Object.assign(defaultStore().home.x01, data.home.x01 || {});
      out.home.x01.houseRule = Object.assign({ oneBustLowScore: false, bustAllowance: 1 }, (data.home.x01 || {}).houseRule || {});
      out.home.cricket = Object.assign(defaultStore().home.cricket, data.home.cricket || {});
      if (!Array.isArray(out.home.roster)) out.home.roster = [];
    }
    out.settings = Object.assign(d.settings, data.settings || {});
    out.statsFilter = Object.assign(d.statsFilter, data.statsFilter || {});
    out.gamesFilter = Object.assign(d.gamesFilter, data.gamesFilter || {});
    out.lastBackupAt = data.lastBackupAt || null;
    return out;
  }
  function hydrateMatch(m) {
    m.legs = (m.legs || []).map((l) => ({ events: (l.e || l.events || []).map(DL.decodeEvent).filter(Boolean) }));
    if (!m.legs.length) m.legs = [{ events: [] }];
    refresh(m, true);
    return m;
  }
  function serializeMatch(m) {
    return { id: m.id, createdAt: m.createdAt, updatedAt: m.updatedAt, endedAt: m.endedAt, status: m.status, mode: m.mode,
      settings: m.settings, players: m.players, winnerId: m.winnerId, legs: m.legs.map((l) => ({ e: l.events.map(DL.encodeEvent) })) };
  }
  function serializeStore() { return JSON.stringify(Object.assign({}, store, { matches: store.matches.map(serializeMatch) })); }
  function save() { lsSet(STORE_KEY, serializeStore()); }
  let store = defaultStore();
  function loadStore(fallback) {
    let data = null;
    try { const raw = lsGet(STORE_KEY); data = raw ? JSON.parse(raw) : null; } catch (e) { data = null; }
    if (!data && fallback) { try { data = JSON.parse(fallback); } catch (e) { data = null; } }
    store = mergeStore(data);
    store.matches.forEach((m) => { try { hydrateMatch(m); } catch (e) { m._broken = true; } });
    store.matches = store.matches.filter((m) => !m._broken);
  }

  /* ---------- match helpers ---------- */
  function refresh(m, quiet) {
    const rs = DL.replayMatch(m);
    Object.defineProperty(m, '_rs', { value: rs, writable: true, configurable: true, enumerable: false });
    if (rs.winnerId && m.status !== 'finished') { m.status = 'finished'; m.endedAt = m.endedAt || Date.now(); }
    if (!rs.winnerId && m.status === 'finished') { m.status = 'active'; m.endedAt = null; }
    if (!quiet) m.updatedAt = Date.now();
    return rs;
  }
  const matchById = (id) => store.matches.find((m) => m.id === id);
  const activeMatch = () => matchById(store.activeMatchId);
  const playerById = (id) => store.players.find((p) => p.id === id);
  const isHouse = (m) => !!(m && m.mode === 'x01' && m.settings.houseRule && m.settings.houseRule.oneBustLowScore);
  const countTurns = (m) => m.legs.reduce((a, l) => a + (l.turns ? l.turns.length : 0), 0);
  const cloneForReplay = (m) => ({ mode: m.mode, settings: m.settings, players: m.players, legs: m.legs.map((l) => ({ events: l.events.slice() })) });
  function legSnapshot(m, li) {
    const leg = m.legs[li];
    const starter = Math.max(0, m.players.findIndex((p) => p.id === leg.starterId));
    return m.mode === 'cricket' ? DL.replayCricketLeg(m.settings, m.players, starter, leg.events) : DL.replayX01Leg(m.settings, m.players, starter, leg.events);
  }
  function formatText(S) {
    const f = FORMAT_NAMES[S.format];
    if (S.sets > 1) return `${f} ${S.sets} sets` + (S.legs > 1 ? `, ${S.format === 'bestOf' ? 'best of' : 'first to'} ${S.legs} legs each` : '');
    return `${f} ${S.legs} ${S.legs === 1 ? 'leg' : 'legs'}`;
  }
  function settingsSummary(m) {
    const S = m.settings;
    if (m.mode === 'cricket') {
      return `Cricket ${SCORING_NAMES[S.scoring]}, ${S.numbersMode === 'random' ? 'Random numbers' : '15-20 and Bull'}, ${formatText(S)}`;
    }
    return `${S.points}, ${S.checkIn !== 'straight' ? IN_NAMES[S.checkIn] + ', ' : ''}${OUT_NAMES[S.checkOut]}, ${formatText(S)}`;
  }
  function scoreLine(m) {
    const rs = m._rs, S = m.settings;
    const src = S.sets > 1 ? rs.setsWon : rs.legsWonTotal;
    return m.players.map((p) => src[p.id] || 0).join('-') + (S.sets > 1 ? ' sets' : ' legs');
  }
  const nameHtml = (p) => `<span class="${p.isBot ? 'bot-name' : ''}">${esc(p.name)}</span>`;
  const skillText = (p) => (p.isBot ? `Computer · Level ${p.skill} ${DL.SKILL_NAMES[p.skill]}` : 'Human') + (p.label ? ' · ' + p.label : '');

  /* ---------- feedback: sound, vibration, voice, wake lock ---------- */
  let audioCtx = null;
  function beep(freq, dur, type, vol, delay) {
    if (!store.settings.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audioCtx.currentTime + (delay || 0);
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.08, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) { /* audio unavailable */ }
  }
  const sounds = {
    dart: () => beep(880, 0.05, 'square', 0.03),
    bust: () => { beep(220, 0.22, 'sawtooth', 0.06); beep(150, 0.3, 'sawtooth', 0.05, 0.18); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.18, 'triangle', 0.07, i * 0.1)),
    lock: () => { beep(660, 0.12, 'triangle', 0.07); beep(440, 0.2, 'triangle', 0.07, 0.1); },
  };
  function vibrate(p) { if (!store.settings.vibration) return; try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* ignore */ } }
  function speak(text) {
    if (!store.settings.voice) return;
    try { const u = new SpeechSynthesisUtterance(text); window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); } catch (e) { /* ignore */ }
  }
  // Ask the browser to protect saved data from automatic cleanup.
  let persisted = null;
  async function ensurePersist() {
    try {
      if (!navigator.storage || !navigator.storage.persisted) return;
      persisted = await navigator.storage.persisted();
      if (!persisted && navigator.storage.persist) persisted = await navigator.storage.persist();
    } catch (e) { persisted = null; }
  }
  const backupStale = () => !store.lastBackupAt || Date.now() - store.lastBackupAt > 7 * 86400000;
  function markBackup() { store.lastBackupAt = Date.now(); save(); }
  let wakeLock = null;
  async function updateWakeLock() {
    const want = store.settings.wakeLock && ui.screen === 'game';
    try {
      if (want && !wakeLock && navigator.wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener && wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!want && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { wakeLock = null; }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') updateWakeLock(); });

  /* ---------- ui state ---------- */
  const ui = {
    tab: 'home', screen: null, detailId: null, detailFrom: null,
    sheet: null, dialog: null, review: null, reviewTimer: null,
    botTimer: null, botKey: '', botFast: false,
    pad: { mult: 1, buf: '' }, edit: null, infoOpen: false,
  };
  function saveUi() { ssSet(UI_KEY, JSON.stringify({ tab: ui.tab, screen: ui.screen, detailId: ui.detailId, detailFrom: ui.detailFrom })); }

  /* ---------- toasts ---------- */
  function toast(msg, tone) {
    const root = $('#toast-root'); if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast' + (tone ? ' ' + tone : '');
    el.setAttribute('role', 'status');
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => el.remove(), 2600);
    while (root.children.length > 3) root.firstChild.remove();
  }

  /* ---------- dialogs ---------- */
  function confirmBox(opts) {
    ui.dialog = opts;
    renderDialog();
  }
  function renderDialog() {
    const root = $('#dialog-root');
    const d = ui.dialog;
    if (!d) { root.innerHTML = ''; return; }
    const buttons = d.buttons || [
      { label: 'Cancel', style: '', run: null },
      { label: d.confirm || 'OK', style: d.danger ? 'red' : d.amber ? 'amber' : 'green', run: d.onConfirm },
    ];
    d._buttons = buttons;
    root.innerHTML = `<div class="dialog-wrap" data-act="dialog-bg"><div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-m">
      <h2 id="dlg-t">${esc(d.title)}</h2>${d.message ? `<p id="dlg-m">${esc(d.message)}</p>` : ''}
      <div class="btn-row">${buttons.map((b, i) => `<button class="pill-btn ${b.style || ''}" data-act="dialog-btn" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>
    </div></div>`;
    const btns = root.querySelectorAll('button');
    btns[btns.length - 1].focus();
  }
  function closeDialog() { ui.dialog = null; renderDialog(); scheduleBot(); }

  /* ---------- sheets ---------- */
  function openSheet(sheet) { ui.sheet = sheet; renderSheet(true); scheduleBot(); }
  function closeSheet() {
    const s = ui.sheet;
    ui.sheet = null; ui.edit = null; renderSheet();
    if (s && s.type === 'recap') afterRecap(s);
    render();
  }
  function renderSheet(focus) {
    const root = $('#sheet-root');
    const s = ui.sheet;
    if (!s) { root.innerHTML = ''; return; }
    const prevFocus = document.activeElement && document.activeElement.id;
    const scroller = root.querySelector('.sheet');
    const prevScroll = scroller ? scroller.scrollTop : 0;
    const r = SHEETS[s.type](s);
    root.innerHTML = `<div class="overlay" data-act="sheet-bg"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div class="grabber"></div>
      <div class="sheet-head"><h2 id="sheet-title" tabindex="-1">${esc(r.title)}</h2>${r.noClose ? '' : `<button class="icon-plain" data-act="sheet-close" aria-label="Close">${I.close}</button>`}</div>
      ${r.body}</div></div>`;
    const sh = root.querySelector('.sheet');
    if (sh) sh.scrollTop = prevScroll;
    if (prevFocus && document.getElementById(prevFocus)) document.getElementById(prevFocus).focus();
    else if (focus) { const t = $('#sheet-title'); t && t.focus({ preventScroll: true }); }
  }

  /* ---------- navigation ---------- */
  function go(tab) {
    ui.tab = tab; ui.screen = null; ui.detailId = null; ui.infoOpen = false;
    saveUi(); render(); window.scrollTo(0, 0); updateWakeLock();
  }
  function openGame() { ui.screen = 'game'; ui.botFast = false; saveUi(); render(); updateWakeLock(); }
  function openDetail(id, from) { ui.screen = 'match'; ui.detailId = id; ui.detailFrom = from || 'games'; saveUi(); render(); window.scrollTo(0, 0); updateWakeLock(); }

  /* ======================================================================
     RENDER
     ====================================================================== */
  function render() {
    const root = $('#screen-root');
    let html = '';
    if (ui.screen === 'game' && activeMatch()) html = renderGame();
    else if (ui.screen === 'match' && matchById(ui.detailId)) html = renderDetail();
    else {
      if (ui.screen) { ui.screen = null; saveUi(); }
      html = `<main class="app" id="main">${({ home: renderHome, players: renderPlayers, stats: renderStats, games: renderGames, settings: renderSettings })[ui.tab]()}</main>` + renderTabbar();
    }
    root.innerHTML = html;
    if (ui.screen === 'game') {
      const act = root.querySelector('.pcard.active, .cplayer.active');
      if (act) act.scrollIntoView({ block: 'nearest' });
    }
    scheduleBot();
  }
  function renderTabbar() {
    const tabs = [['home', 'Home', I.home], ['players', 'Players', I.players], ['stats', 'Statistics', I.stats], ['games', 'All Games', I.history], ['settings', 'Settings', I.settings]];
    return `<nav class="tabbar" aria-label="Main">${tabs.map(([k, l, ic]) =>
      `<button class="tab" data-act="tab" data-tab="${k}" ${ui.tab === k ? 'aria-current="page"' : ''}>${ic}<span>${l}</span></button>`).join('')}</nav>`;
  }
  const seg = (act, opts, cur, cls) => `<div class="seg ${cls || ''}" role="group">${opts.map(([v, l]) =>
    `<button type="button" data-act="${act}" data-v="${v}" aria-pressed="${String(v) === String(cur)}">${l}</button>`).join('')}</div>`;
  const topbar = (title, right, left) => `<header class="topbar">${left || '<span></span>'}<h1>${esc(title)}</h1>${right || '<span></span>'}</header>`;
  const switchHtml = (id, on, act, label, cls) => `<label class="switch ${cls || ''}"><input type="checkbox" role="switch" id="${id}" data-change="${act}" ${on ? 'checked' : ''} aria-label="${esc(label)}"><span></span></label>`;

  /* ---------- home ---------- */
  function renderHome() {
    const h = store.home, cfg = h.mode === 'x01' ? h.x01 : h.cricket;
    const am = activeMatch();
    const resume = am && am.status !== 'finished' ? `<div class="resume-card"><div><strong>Match in progress</strong><span>${esc(settingsSummary(am))} · ${am.players.map((p) => esc(p.name)).join(', ')}</span></div>
      <button class="pill-btn green" data-act="resume" data-id="${am.id}">Resume</button></div>` : '';
    const tile = (label, value, color, act, cls) => `<div class="tile-wrap ${cls || ''}"><span class="tile-label" id="tl-${act}">${label}</span>
      <button class="tile ${color}" data-act="pick" data-pick="${act}" aria-labelledby="tl-${act} tv-${act}"><span id="tv-${act}">${esc(value)}</span></button></div>`;
    let tiles;
    if (h.mode === 'x01') {
      tiles = [
        tile('Points', cfg.points, 'green', 'points'), tile('Check-Out', OUT_NAMES[cfg.checkOut], 'red', 'checkOut'), tile('Sets', cfg.sets, 'green', 'sets'),
        tile('Set/Leg', FORMAT_NAMES[cfg.format], 'green', 'format'), tile('Check-In', IN_NAMES[cfg.checkIn], 'red', 'checkIn'), tile('Legs', cfg.legs, 'green', 'legs'),
        tile('House Rules', cfg.houseRule.oneBustLowScore ? HOUSE_NAME : 'Off', 'amber' + (cfg.houseRule.oneBustLowScore ? '' : ' off'), 'house', 'full'),
      ].join('');
    } else {
      tiles = [
        tile('Scoring', SCORING_NAMES[cfg.scoring], 'red', 'scoring'), tile('Numbers', cfg.numbers === 'random' ? 'Random' : '15-20, Bull', 'red', 'numbers'), tile('Sets', cfg.sets, 'green', 'sets'),
        tile('Set/Leg', FORMAT_NAMES[cfg.format], 'green', 'format', 'span2'), tile('Legs', cfg.legs, 'green', 'legs'),
      ].join('');
    }
    const roster = h.roster.map(playerById).filter(Boolean);
    const min = h.mode === 'x01' ? 1 : 2, max = h.mode === 'x01' ? 8 : 6;
    let hint = '';
    if (roster.length < min) hint = h.mode === 'x01' ? 'Add at least one player to start.' : 'Cricket needs at least 2 players.';
    else if (roster.length > max) hint = `${h.mode === 'x01' ? 'X01' : 'Cricket'} allows up to ${max} players. Remove ${roster.length - max}.`;
    const list = roster.length ? `<ul class="list" data-reorder="roster" aria-label="Players in this game">${roster.map((p, i) => `
      <li class="row" data-idx="${i}">
        <span class="dart-ic ${i === 0 && !h.randomOrder ? 'on' : ''}" ${i === 0 && !h.randomOrder ? 'title="Throws first"' : ''}>${I.dart}</span>
        <div class="row-main"><span class="row-name ${p.isBot ? 'bot-name' : ''}">${esc(p.name)}</span><span class="row-sub">${i === 0 && !h.randomOrder ? 'Throws first · ' : ''}${esc(skillText(p))}</span></div>
        <button class="icon-plain" data-act="roster-remove" data-id="${p.id}" aria-label="Remove ${esc(p.name)} from this game">${I.trash}</button>
        <button class="drag-handle" data-drag="roster" data-idx="${i}" aria-label="Move ${esc(p.name)}. Drag, or use the up and down arrow keys.">${I.menu}</button>
      </li>`).join('')}</ul>${h.randomOrder ? '<p class="hint">The order is shuffled when you tap START.</p>' : ''}`
      : `<div class="empty">${I.target}<strong>Add players to begin</strong>Tap Add Players for people, or the robot button for a computer opponent.</div>`;
    return `
      <header class="home-head"><h1>Dart Scoreboard</h1><button class="circle-btn" data-act="share" aria-label="Share the last match">${I.share}</button></header>
      ${resume}
      ${seg('home-mode', [['x01', 'X01'], ['cricket', 'Cricket']], h.mode)}
      <div class="tiles">${tiles}</div>
      <p class="format-note">${esc(formatText(cfg))}${h.mode === 'x01' && cfg.houseRule.oneBustLowScore ? ` · ${HOUSE_NAME} (${cfg.houseRule.bustAllowance} free ${cfg.houseRule.bustAllowance === 1 ? 'bust' : 'busts'})` : ''}</p>
      <button class="btn-start" data-act="start" ${hint ? 'disabled aria-describedby="start-hint"' : ''}>START</button>
      ${hint ? `<p class="hint" id="start-hint">${esc(hint)}</p>` : ''}
      <div class="home-actions">
        <label class="check"><input type="checkbox" id="random-order" data-change="random-order" ${h.randomOrder ? 'checked' : ''}><span>Random order</span></label>
        <button class="sq-btn" data-act="add-bot" aria-label="Add a computer player">${I.robotPlus}</button>
        <button class="pill-btn green" data-act="add-players">${I.personPlus}<span>Add Players</span></button>
      </div>
      <h2 class="section-h">Players</h2>
      ${list}`;
  }

  /* ---------- players tab ---------- */
  function renderPlayers() {
    const ps = store.players;
    const body = ps.length ? `<ul class="list" data-reorder="players" aria-label="Saved players">${ps.map((p, i) => `
      <li class="row" data-idx="${i}">
        <button class="row-main" data-act="player-edit" data-id="${p.id}" aria-label="Edit ${esc(p.name)}"><span class="row-name ${p.isBot ? 'bot-name' : ''}">${esc(p.name)}</span><span class="row-sub">${esc(skillText(p))}</span></button>
        <button class="drag-handle" data-drag="players" data-idx="${i}" aria-label="Move ${esc(p.name)}. Drag, or use the up and down arrow keys.">${I.menu}</button>
      </li>`).join('')}</ul>`
      : `<div class="empty">${I.players}<strong>No players yet</strong>Add the people you play with, and computer opponents at five skill levels.</div>`;
    return topbar('Players', `<button class="circle-btn" data-act="player-new" aria-label="Add a player">${I.plus}</button>`) + body;
  }

  /* ---------- statistics tab ---------- */
  function statsFilter() {
    const f = store.statsFilter;
    return { range: f.range, hidden: f.hidden, order: store.players.map((p) => p.id), now: Date.now() };
  }
  function statTable(cols, rows, cells) {
    return `<div class="table-wrap"><table class="stat"><thead><tr><th scope="col">Players</th>${cols.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r, i) => {
        const fs = r.name.length > 14 ? 12 : r.name.length > 10 ? 13.5 : 15;
        return `<tr><td style="font-size:${fs}px"><span class="pidx">${i + 1}.</span><span class="${r.isBot ? 'bot-name' : ''}">${esc(r.name)}</span></td>${cells(r).map((v) => `<td>${v}</td>`).join('')}</tr>`;
      }).join('')}</tbody></table></div>`;
  }
  function sectorChart(title, counts, labels, ticks) {
    const left = 4, right = 26, top = 10, h = 120, bottom = 22;
    const W = 344, slot = (W - left - right) / labels.length, H = top + h + bottom;
    const bw = Math.max(2, Math.min(4, slot * 0.6));
    const max = Math.max(0, ...counts);
    const step = max <= 50 ? 10 : max <= 100 ? 20 : max <= 250 ? 50 : max <= 500 ? 100 : Math.ceil(max / 5 / 100) * 100;
    const yMax = Math.max(step, Math.ceil(max / step) * step);
    const y = (v) => top + h - (v / yMax) * h;
    let g = '';
    for (let v = step; v <= yMax; v += step) {
      g += `<line x1="${left}" x2="${W - right + 4}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)" stroke-width="1"/>`;
      g += `<text x="${W - right + 8}" y="${y(v) + 4}" font-size="10" fill="var(--muted)">${v}</text>`;
    }
    g += `<line x1="${left}" x2="${W - right + 4}" y1="${y(0)}" y2="${y(0)}" stroke="var(--muted)" stroke-width="1"/>`;
    labels.forEach((l, i) => {
      if (!ticks.includes(l)) return;
      const x = left + i * slot + slot / 2;
      g += `<line x1="${x}" x2="${x}" y1="${top}" y2="${y(0)}" stroke="var(--grid)" stroke-dasharray="2 3" stroke-width="1"/>`;
      g += `<text x="${x}" y="${H - 6}" font-size="10" fill="var(--muted)" text-anchor="middle">${l}</text>`;
    });
    counts.forEach((c, i) => {
      if (!c) return;
      const x = left + i * slot + slot / 2 - bw / 2;
      g += `<rect x="${x}" y="${y(c)}" width="${bw}" height="${Math.max(1, y(0) - y(c))}" rx="1" fill="var(--bar)"><title>${labels[i]}: ${c}</title></rect>`;
    });
    return `<div class="chart-card"><h3>${title}</h3><div class="chart-scroll"><svg style="width:100%;min-width:300px;height:auto" viewBox="0 0 ${W} ${H}" role="img" aria-label="Hits per sector, highest ${max}">${g}</svg></div></div>`;
  }
  function renderStats() {
    const f = store.statsFilter;
    const head = topbar('Statistics', `<button class="circle-btn" data-act="stats-filter" aria-label="Choose players and reset statistics">${I.menu}</button>`) +
      seg('stats-mode', [['x01', 'X01'], ['cricket', 'Cricket']], f.mode) +
      seg('stats-range', [['today', 'Today'], ['7d', '7 Days'], ['30d', '30 Days'], ['all', 'All time']], f.range, 'small');
    const sec = (t, inner, extra) => `<h2 class="stat-h">${t}${extra || ''}</h2>${inner}`;
    const none = '<div class="no-data">No data yet</div>';
    if (f.mode === 'x01') {
      const s = DL.statsX01(store.matches, statsFilter());
      const R = s.rows, ok = s.hasData && R.length;
      const T = (cols, cells) => (ok ? statTable(cols, R, cells) : none);
      const info = `<button class="info-btn" data-act="info" aria-expanded="${ui.infoOpen}" aria-label="How checkout percentage is calculated">${I.info}</button>`;
      let html = head;
      html += sec('Games', T(['Games', 'Wins', 'Wins %'], (r) => [r.games, r.wins, fmtPct(r.winPct)]));
      html += sec('Legs', T(['Legs', 'Legs won', 'Legs win %'], (r) => [r.legs, r.legsWon, fmtPct(r.legPct)]));
      html += sec('Throws', T(['Throws ⌀', 'Double %', 'Triple %'], (r) => [fmt2(r.dartsPerLeg), fmtPct(r.doublePct), fmtPct(r.triplePct)]));
      html += sec('Average and Highest Score', T(['Average ⌀', 'First-9 ⌀', 'Max Score'], (r) => [fmt2(r.avg), fmt2(r.first9), r.maxScore]));
      html += sec('Points', T(['60+', '100+', '140+', '180'], (r) => [r.b60, r.b100, r.b140, r.b180]));
      html += sec('Checkout', (ui.infoOpen ? `<p class="popover" id="co-info">Checkout % is successful checkouts divided by darts thrown while one dart could finish the leg under that match's check-out rule (for Double Out: 40 or less and even, or 50). Legs decided by low score and turns entered as a total do not count. Min Darts is the fewest darts in a leg won by checkout.</p>` : '') +
        T(['Max Checkout', 'Min Darts', 'Checkout %'], (r) => [r.maxCheckout, r.minDarts || 0, fmtPct(r.checkoutPct)]), info);
      if (ok && s.hasHouse) {
        html += sec(HOUSE_NAME, statTable(['Locks', 'Busts', 'Auto-locks', 'Final-round wins'], R, (r) => [r.locks, r.busts, r.autoLocks, `${r.finalWins} / ${r.finalAttempts}`]) +
          '<p class="hint">Busts count only in house rule matches. Final-round wins are legs won after taking a final turn.</p>');
      }
      html += sec('Hits in Sector', ok ? R.map((r, i) => sectorChart(`<span class="pidx">${i + 1}.</span> <span class="${r.isBot ? 'bot-name' : ''}">${esc(r.name)}</span>`, r.sectors, s.labels, s.ticks)).join('') : none);
      return html;
    }
    const s = DL.statsCricket(store.matches, statsFilter());
    const R = s.rows, ok = s.hasData && R.length;
    const T = (cols, cells) => (ok ? statTable(cols, R, cells) : none);
    let html = head;
    html += sec('Games', T(['Games', 'Wins', 'Wins %'], (r) => [r.games, r.wins, fmtPct(r.winPct)]));
    html += sec('Legs', T(['Legs', 'Legs won', 'Legs win %'], (r) => [r.legs, r.legsWon, fmtPct(r.legPct)]));
    html += sec('MPR', T(['MPR ⌀', 'Rounds', 'Darts'], (r) => [fmt2(r.mpr), r.rounds, r.darts]));
    html += sec('Marks', T(['Marks', 'Triples', 'Bulls'], (r) => [r.marks, r.triples, r.bulls]));
    html += sec('Points per Round', T(['Points', 'Per round ⌀'], (r) => [r.points, fmt2(r.ppr)]));
    html += sec('Highest Marks in a Turn', T(['Max marks'], (r) => [r.maxMarks]));
    html += sec('Hits in Sector', ok ? R.map((r, i) => sectorChart(`<span class="pidx">${i + 1}.</span> <span class="${r.isBot ? 'bot-name' : ''}">${esc(r.name)}</span>`, r.sectors, s.labels, s.ticks)).join('') : none);
    return html + '<p class="hint">Marks count darts that closed a number or scored on it.</p>';
  }

  /* ---------- all games tab ---------- */
  function renderGames() {
    const gf = store.gamesFilter;
    const allPlayers = new Map();
    store.matches.forEach((m) => m.players.forEach((p) => allPlayers.set(p.id, p)));
    const list = store.matches.filter((m) => (gf.mode === 'all' || m.mode === gf.mode) && (!gf.player || m.players.some((p) => p.id === gf.player)))
      .slice().sort((a, b) => (b.endedAt || b.updatedAt || b.createdAt) - (a.endedAt || a.updatedAt || a.createdAt));
    const filters = `<div class="filters">${seg('games-mode', [['all', 'All'], ['x01', 'X01'], ['cricket', 'Cricket']], gf.mode, 'small')}
      <label class="sr-only" for="games-player">Filter by player</label>
      <select class="select" id="games-player" data-change="games-player"><option value="">All players</option>${[...allPlayers.values()].map((p) => `<option value="${p.id}" ${gf.player === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>`;
    const body = list.length ? `<ul class="list">${list.map(gameItem).join('')}</ul>`
      : `<div class="empty">${I.history}<strong>${store.matches.length ? 'No games match this filter' : 'No games yet'}</strong>${store.matches.length ? 'Try another mode or player.' : 'Finished and unfinished matches appear here.'}</div>`;
    return topbar('All Games') + (store.matches.length ? filters : '') + body;
  }
  function gameItem(m) {
    const when = new Date(m.endedAt || m.createdAt);
    const date = when.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    const winner = m.players.find((p) => p.id === m.winnerId);
    const unfinished = m.status !== 'finished';
    const status = m.status === 'abandoned' ? '<span class="chip muted">Abandoned</span>' : unfinished ? '<span class="chip green">In progress</span>' : '';
    return `<li class="game-item"><button class="gi-main" data-act="open-match" data-id="${m.id}">
      <div class="gi-top"><span>${esc(date)}</span><span class="chip">${m.mode === 'x01' ? 'X01' : 'Cricket'}</span>${isHouse(m) ? `<span class="chip amber">${HOUSE_NAME}</span>` : ''}${status}</div>
      <div class="gi-settings">${esc(settingsSummary(m))}</div>
      <div class="gi-players">${m.players.map(nameHtml).join(', ')}</div>
      <div class="gi-result">${winner ? `${I.trophy}${nameHtml(winner)} won · ${esc(scoreLine(m))}` : `Score ${esc(scoreLine(m))}`}</div>
    </button><div class="gi-actions">${unfinished ? `<button class="pill-btn green" data-act="resume" data-id="${m.id}">Resume</button>` : ''}
      <button class="icon-plain" data-act="delete-match" data-id="${m.id}" aria-label="Delete this match">${I.trash}</button></div></li>`;
  }

  /* ---------- match detail ---------- */
  function renderDetail() {
    const m = matchById(ui.detailId), rs = m._rs, S = m.settings;
    const back = `<button class="icon-plain" data-act="detail-back" aria-label="Back">${I.back}</button>`;
    const winner = m.players.find((p) => p.id === m.winnerId);
    const unfinished = m.status !== 'finished';
    const when = new Date(m.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    let html = topbar('Match', ui.detailFrom === 'game' ? '' : `<button class="icon-plain" data-act="delete-match" data-id="${m.id}" aria-label="Delete this match">${I.trash}</button>`, back);
    html += `<div class="card"><div class="gi-top"><span>${esc(when)}</span><span class="chip">${m.mode === 'x01' ? 'X01' : 'Cricket'}</span>${isHouse(m) ? `<span class="chip amber">${HOUSE_NAME}</span>` : ''}</div>
      <div class="gi-settings">${esc(settingsSummary(m))}</div><div class="gi-players">${m.players.map(nameHtml).join(', ')}</div>
      <div class="gi-result">${winner ? `${I.trophy}${nameHtml(winner)} won · ${esc(scoreLine(m))}` : `${m.status === 'abandoned' ? 'Abandoned' : 'In progress'} · ${esc(scoreLine(m))}`}</div>
      ${unfinished && ui.detailFrom !== 'game' ? `<div class="btn-row"><button class="pill-btn green" data-act="resume" data-id="${m.id}">Resume</button></div>` : ''}
      ${ui.detailFrom === 'game' ? `<div class="btn-row"><button class="pill-btn green" data-act="detail-back">Back to the game</button></div>` : ''}</div>`;
    // per-player stats
    const f = { range: 'all', includeUnfinished: true, order: m.players.map((p) => p.id) };
    if (m.mode === 'x01') {
      const s = DL.statsX01([m], f);
      html += '<h2 class="stat-h">Players</h2>' + statTable(['Avg ⌀', 'First-9', 'Max', 'Legs'], s.rows, (r) => [fmt2(r.avg), fmt2(r.first9), r.maxScore, r.legsWon]);
      html += '<div style="height:8px"></div>' + statTable(['Darts', '100+', '180', 'Best out'], s.rows, (r) => [r.darts, r.b100 + r.b140, r.b180, r.maxCheckout]);
    } else {
      const s = DL.statsCricket([m], f);
      html += '<h2 class="stat-h">Players</h2>' + statTable(['MPR', 'Marks', 'Points', 'Legs'], s.rows, (r) => [fmt2(r.mpr), r.marks, r.points, r.legsWon]);
    }
    // leg timeline
    const pn = (id) => { const p = m.players.find((x) => x.id === id); return p ? nameHtml(p) : '?'; };
    html += '<h2 class="stat-h">Legs</h2><div class="card">' + m.legs.map((leg, li) => {
      if (!leg.turns || (!leg.turns.length && !leg.winnerId && !leg.events.length)) return li === 0 ? '<div class="leg-line">No darts thrown yet.</div>' : '';
      const lbl = `${S.sets > 1 ? `Set ${leg.setNo} · ` : ''}Leg ${leg.legNo}`;
      let txt;
      if (!leg.winnerId) txt = 'In progress';
      else if (leg.resultType === 'lowScore') txt = `${pn(leg.winnerId)} won on low score (${leg.finalScores[leg.winnerId]} left)`;
      else if (m.mode === 'x01') { const last = leg.turns[leg.turns.length - 1]; const nd = leg.turns.filter((t) => t.pid === leg.winnerId).reduce((a, t) => a + t.darts.length, 0); txt = `${pn(leg.winnerId)} checked out ${last.start} in ${nd} darts`; }
      else txt = `${pn(leg.winnerId)} closed out (${leg.finalScores[leg.winnerId]} points)`;
      if (isHouse(m) && leg.lockerId) {
        const auto = leg.turns.some((t) => t.autoLocked && t.pid === leg.lockerId);
        txt += `<br><span class="lock-tag">${I.lock}${pn(leg.lockerId)} ${auto ? 'auto-locked' : 'locked'} at ${leg.lockedScore}</span>`;
      }
      if (isHouse(m) && leg.bustCounts) {
        const b = m.players.filter((p) => leg.bustCounts[p.id]).map((p) => `${esc(p.name)} ${leg.bustCounts[p.id]}`);
        if (b.length) txt += `<br><span style="color:var(--muted)">Busts: ${b.join(', ')}</span>`;
      }
      return `<div class="leg-line"><span class="lno">${lbl}</span><span>${txt}</span></div>`;
    }).join('') + '</div>';
    // turn log
    html += '<h2 class="stat-h">Turn log</h2>';
    const legsWithTurns = m.legs.map((leg, li) => ({ leg, li })).filter((x) => x.leg.turns && x.leg.turns.length);
    if (!legsWithTurns.length) html += '<div class="no-data">No turns yet</div>';
    html += legsWithTurns.map(({ leg, li }, k) => `<details class="turns" ${k === legsWithTurns.length - 1 ? 'open' : ''}><summary>${S.sets > 1 ? `Set ${leg.setNo} · ` : ''}Leg ${leg.legNo}</summary>
      ${leg.turns.map((t, ti) => {
        const p = m.players.find((x) => x.id === t.pid);
        const darts = t.totalEntry ? 'Total' : t.darts.map(DL.dartLabel).join(' ') || '-';
        let flags = '';
        if (t.busted) flags += '<span class="flag bust">BUST</span>';
        if (t.lockedThisTurn) flags += '<span class="flag lock">LOCK</span>';
        if (t.autoLocked) flags += '<span class="flag lock">AUTO-LOCK</span>';
        if (t.isFinalTurn) flags += '<span class="flag final">FINAL</span>';
        if (t.checkout || t.win) flags += '<span class="flag co">OUT</span>';
        const right = m.mode === 'x01' ? `${t.score} <span style="color:var(--muted)">→ ${t.end}</span>` : `${t.marks} mk${t.points ? ' · ' + t.points : ''}`;
        return `<div class="trow"><span class="tn">${nameHtml(p)}${flags}</span><span class="td">${esc(darts)}</span><span class="ts">${right}</span>
          <button class="icon-plain" data-act="edit-turn" data-li="${li}" data-ti="${ti}" aria-label="Edit ${esc(p.name)}'s turn ${ti + 1}">${I.edit}</button></div>`;
      }).join('')}</details>`).join('');
    return `<main class="app" id="main">${html}</main>`;
  }

  /* ---------- settings tab ---------- */
  function renderSettings() {
    const s = store.settings;
    const row = (label, sub, ctl) => `<div class="srow"><span class="grow">${label}${sub ? `<small>${sub}</small>` : ''}</span>${ctl}</div>`;
    return topbar('Settings') + `
      <h2 class="group-title">Game</h2><div class="group">
        ${row('Allow early end turn', 'End a turn before three darts to bank the score', switchHtml('set-early', s.earlyEnd, 'set-earlyEnd', 'Allow early end turn'))}
        ${row('Checkout suggestions', 'Show a route when a finish is possible', switchHtml('set-sugg', s.suggestions, 'set-suggestions', 'Checkout suggestions'))}
        ${row('Keep screen awake', 'During a match, where the browser allows it', switchHtml('set-wake', s.wakeLock, 'set-wakeLock', 'Keep screen awake'))}
      </div>
      <h2 class="group-title">Feedback</h2><div class="group">
        ${row('Sound effects', '', switchHtml('set-sound', s.sound, 'set-sound', 'Sound effects'))}
        ${row('Vibration', 'On devices that support it', switchHtml('set-vib', s.vibration, 'set-vibration', 'Vibration'))}
        ${row('Voice announcer', 'Reads out each turn score', switchHtml('set-voice', s.voice, 'set-voice', 'Voice announcer'))}
      </div>
      <h2 class="group-title">Theme</h2>${seg('theme', [['system', 'System'], ['dark', 'Dark'], ['light', 'Light']], s.theme)}
      <h2 class="group-title">Data</h2><div class="group">
        ${row('Saved on this device', persisted === true ? 'Protected from automatic browser cleanup' : persisted === false ? 'This browser may clear it if unused for a while. Keep a backup.' : 'Saved after every dart', `<span class="num" style="color:var(--muted);text-align:right;font-size:13px">${store.matches.filter((m) => m.status === 'finished').length} matches</span>`)}
        <button class="srow" data-act="export"><span class="grow">Export all data (backup)<small>${store.lastBackupAt ? 'Last backup ' + new Date(store.lastBackupAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'No backup yet'}. JSON file with players, matches and settings</small></span></button>
        <button class="srow" data-act="import"><span class="grow">Import from JSON<small>Replaces the data on this device</small></span></button>
        <button class="srow danger" data-act="reset-all"><span class="grow">Reset all data</span></button>
      </div>
      <h2 class="group-title">Diagnostics</h2><div class="group">
        <button class="srow" data-act="self-test"><span class="grow">Run self-tests<small>Checks scoring rules, the house rule, bots and statistics</small></span></button>
        ${row('About', 'Dart Scoreboard', `<span class="num" style="color:var(--muted)">Version ${DL.APP_VERSION}</span>`)}
      </div>`;
  }

  /* ======================================================================
     GAME SCREEN
     ====================================================================== */
  function currentReview(m) { return ui.review && ui.review.matchId === m.id ? ui.review : null; }
  function renderGame() {
    const m = activeMatch(), rs = m._rs, S = m.settings;
    const rv = currentReview(m);
    const over = !rs.live;
    const legIdx = rv ? rv.legIndex : over ? m.legs.length - 1 : rs.liveIndex;
    const snap = (rv && rv.legEnded) || over ? legSnapshot(m, legIdx) : rs.live;
    const activeSeat = rv ? rv.turn.seat : over ? -1 : rs.live.seat;
    const title = m.mode === 'x01' ? `${S.points} · ${OUT_NAMES[S.checkOut]}` : `Cricket · ${SCORING_NAMES[S.scoring]}`;
    const sub = `${formatText(S)}${S.sets > 1 ? ` · Set ${m.legs[legIdx].setNo}` : ''} · Leg ${m.legs[legIdx].legNo}`;
    let html = `<div class="game" data-act="game-bg"><div class="game-inner">
      <div class="game-top"><button class="icon-plain" data-act="leave-game" aria-label="Leave the match">${I.close}</button>
        <div class="game-title"><strong>${esc(title)}</strong><span>${esc(sub)}${isHouse(m) ? ' · ' + HOUSE_NAME : ''}</span></div>
        <button class="icon-plain" data-act="game-log" aria-label="Match log">${I.history}</button></div>`;
    if (m.mode === 'x01' && snap.phase === 'final') html += finalBanner(m, snap, activeSeat);
    html += m.mode === 'x01' ? x01Cards(m, rs, snap, rv, activeSeat, legIdx) : cricketBoard(m, rs, snap, rv, activeSeat, legIdx);
    html += inputPanel(m, rs, rv, over);
    html += '</div></div>';
    return html;
  }
  function finalBanner(m, live, activeSeat) {
    const locker = m.players[live.lockerSeat];
    const chips = live.finalOrder.map((s, k) => {
      const cls = k < live.finalPos ? 'done' : s === activeSeat && k === live.finalPos ? 'now' : '';
      return `<span class="${cls}">${esc(m.players[s].name)}</span>`;
    }).join('');
    return `<div class="banner" role="status">Final turn: beat ${live.lockedScore} <span style="font-weight:600">(${esc(locker.name)} locked)</span>
      <div class="tracker" aria-label="Players with a final turn">${chips}</div></div>`;
  }
  function x01Cards(m, rs, snap, rv, activeSeat, legIdx) {
    const S = m.settings, P = m.players, leg = m.legs[legIdx];
    const totals = DL.matchPlayerTotals(m, rs);
    const turns = snap.turns;
    const hr = isHouse(m), allowance = hr ? S.houseRule.bustAllowance : 0;
    const cards = P.map((p, i) => {
      const active = i === activeSeat;
      const compact = P.length >= 4 && !active;
      const rem = snap.rem[i];
      let darts = [], total = '', bust = false, dim = false, totalEntry = false;
      if (active && rv) { darts = rv.turn.darts; bust = rv.turn.busted; totalEntry = rv.turn.totalEntry; total = bust ? 'BUST' : rv.turn.score; }
      else if (active && snap.current) { darts = snap.current.darts; total = darts.length ? darts.reduce((a, d) => a + (d.scored || 0), 0) : ''; }
      else {
        const last = turns.filter((t) => t.pid === p.id).pop();
        if (last) { darts = last.darts; bust = last.busted; totalEntry = last.totalEntry; total = bust ? 'BUST' : last.score; dim = true; }
      }
      const boxes = totalEntry ? `<div class="tbox ${dim ? 'dim' : ''}">Total entry</div>` : `<div class="boxes ${bust ? 'bust' : ''}">${[0, 1, 2].map((k) => {
        const d = darts[k];
        return `<span class="dbox ${dim ? 'dim' : ''}">${d ? esc(DL.dartLabel(d)) : ''}</span>`;
      }).join('')}</div>`;
      const legDarts = turns.filter((t) => t.pid === p.id).reduce((a, t) => a + t.darts.length, 0) + (snap.current && snap.current.pid === p.id && !rv ? snap.current.darts.length : 0);
      const avg = DL.safeDiv(totals[p.id].points, totals[p.id].darts) * 3;
      const starter = leg.starterId === p.id;
      let hrLine = '';
      if (hr) {
        const b = snap.busts[i];
        hrLine = `<div class="pc-hr"><span>Busts ${b}/${allowance}</span>${Array.from({ length: allowance }, (_, k) => `<span class="pip ${k < b ? 'on' : ''}"></span>`).join('')}
          ${snap.lockerSeat === i ? `<span class="lock-tag">${I.lock}${snap.lockedScore}</span>` : ''}</div>`;
      }
      const won = snap.winnerSeat === i;
      const counters = `${S.sets > 1 ? `<span class="kv"><span class="lbl">Sets:</span><b>${rs.setsWon[p.id]}</b></span>` : ''}<span class="kv"><span class="lbl">Legs:</span><b>${rs.legsWonSet[p.id]}</b></span>`;
      return `<section class="pcard ${active ? 'active' : ''} ${compact ? 'compact' : ''} ${won ? 'winner' : ''}" aria-label="${esc(p.name)}, ${rem} remaining${active ? ', throwing' : ''}">
        <div class="pc-left"><div class="pc-score ${rem >= 1000 ? 'd4' : ''}">${rem}</div><div class="pc-name">${starter ? I.dart : ''}<span class="nm ${p.isBot ? 'bot-name' : ''}">${esc(p.name)}</span></div>${compact ? '' : hrLine}</div>
        <div class="pc-mid">${boxes}<div class="pc-total ${bust ? 'bust' : ''}">${total}</div></div>
        <div class="pc-right"><span class="counters">${counters}</span>
          <span class="kv kv-darts">${I.dart}<b>${legDarts}</b></span><span class="kv">${I.dia}<b>${fmt2(avg)}</b></span>${compact && hr ? `<span class="kv"><span class="lbl">Busts</span><b>${snap.busts[i]}</b>${snap.lockerSeat === i ? `<span class="lock-tag">${I.lock}</span>` : ''}</span>` : ''}</div>
      </section>`;
    }).join('');
    return `<div class="cards" id="cards">${cards}</div>`;
  }
  function cricketBoard(m, rs, snap, rv, activeSeat, legIdx) {
    const P = m.players, S = m.settings, leg = m.legs[legIdx];
    const totals = DL.matchPlayerTotals(m, rs);
    const nums = snap.nums;
    const head = `<div class="crow head" style="--cols:${P.length}"><div></div>${P.map((p, i) => {
      const mpr = DL.safeDiv(totals[p.id].marks, totals[p.id].darts) * 3;
      return `<div class="cplayer ${i === activeSeat ? 'active' : ''}"><div class="nm">${leg.starterId === p.id ? I.dart : ''}<span class="${p.isBot ? 'bot-name' : ''}">${esc(p.name)}</span></div>
        <div class="pts">${snap.points[i]}</div><div class="sub">MPR ${fmt2(mpr)}</div><div class="sub">${S.sets > 1 ? `S ${rs.setsWon[p.id]} · ` : ''}L ${rs.legsWonSet[p.id]}</div></div>`;
    }).join('')}</div>`;
    const rows = nums.map((x) => `<div class="crow ${snap.dead[x] ? 'dead' : ''}" style="--cols:${P.length}"><div class="cnum">${x === 25 ? 'Bull' : x}</div>${P.map((p, i) =>
      `<div class="cmark" role="img" aria-label="${esc(p.name)} ${x === 25 ? 'Bull' : x}: ${markText(snap.marks[i][x])}">${markSvg(snap.marks[i][x])}</div>`).join('')}</div>`).join('');
    let strip = '';
    if (activeSeat >= 0) {
      const p = P[activeSeat];
      const t = rv ? rv.turn : snap.current;
      const darts = t ? t.darts : [];
      strip = `<div class="turn-strip"><span class="who ${p.isBot ? 'bot-name' : ''}">${esc(p.name)}</span><div class="boxes">${[0, 1, 2].map((k) => `<span class="dbox">${darts[k] ? esc(DL.dartLabel(darts[k])) : ''}</span>`).join('')}</div>
        <span class="pc-total">${t ? t.marks : 0} mk</span></div>`;
    }
    return `<div class="cards" id="cards"><div class="cboard">${head}${rows}</div></div>${strip}`;
  }
  function suggestionLine(m, rs) {
    const live = rs.live, S = m.settings, seat = live.seat, rem = live.rem[seat];
    const dartsLeft = 3 - live.current.darts.length;
    if (live.phase === 'final') {
      const target = DL.finalTarget(live);
      const leader = target === live.lockedScore ? m.players[live.lockerSeat].name : m.players[live.finalOrder.slice(0, live.finalPos).find((s) => live.rem[s] === target)].name;
      if (rem < target) return `<div class="suggest amber">You are below ${target}. End the turn to keep ${rem}.</div>`;
      const need = rem - target + 1;
      const route = S.checkOut && store.settings.suggestions ? DL.checkoutRoute(rem, S.checkOut, dartsLeft) : null;
      return `<div class="suggest amber">Need to score at least ${need} to beat ${target}${leader ? ' (' + esc(leader) + ')' : ''}${route ? ` · Out: ${esc(DL.routeString(route))}` : ''}</div>`;
    }
    if (!live.checked[seat]) return `<div class="suggest muted">${S.checkIn === 'double' ? 'Hit a double to start scoring' : 'Hit a double or triple to start scoring'}</div>`;
    if (!store.settings.suggestions) return '<div class="suggest"></div>';
    const route = rem <= 180 ? DL.checkoutRoute(rem, S.checkOut, dartsLeft) : null;
    return `<div class="suggest">${route ? 'Checkout: ' + esc(DL.routeString(route)) : ''}</div>`;
  }
  function inputPanel(m, rs, rv, over) {
    if (over) {
      return `<div class="input-panel"><div class="bot-note">Match over</div><div class="actions">
        <button data-act="undo">${I.undo}Undo</button><button data-act="open-recap">Summary</button></div></div>`;
    }
    const live = rs.live, S = m.settings, p = m.players[live.seat];
    const cur = live.current;
    const legEndReview = rv && rv.legEnded;
    const isBot = p.isBot;
    const hr = isHouse(m);
    const finalTurn = live.phase === 'final';
    let html = '<div class="input-panel">';
    html += m.mode === 'x01' ? suggestionLine(m, rs) : '';
    const mode = m.mode === 'x01' ? store.settings.inputMode : 'dart';
    if (isBot) {
      html += `<button class="bot-note" data-act="bot-fast" style="width:100%">${esc(p.name)} is throwing. Tap to speed up.</button>`;
    } else if (mode === 'total') {
      html += totalPad('game', ui.pad.buf, legEndReview);
    } else {
      html += dartPad('game', m, ui.pad.mult, legEndReview);
    }
    const canEnd = (store.settings.earlyEnd || finalTurn) && !isBot && !rv && (cur.darts.length > 0 || finalTurn);
    const hasEvents = m.legs.some((l) => l.events.length);
    html += `<div class="actions">
      <button data-act="undo" ${hasEvents ? '' : 'disabled'} aria-label="Undo the last dart">${I.undo}Undo</button>
      ${store.settings.earlyEnd || finalTurn ? `<button data-act="end-turn" ${canEnd ? '' : 'disabled'}>${I.end}End Turn</button>` : ''}
      ${hr && live.phase === 'normal' ? `<button class="lock" data-act="lock-in" ${!isBot && !rv ? '' : 'disabled'}>${I.lock}Lock In</button>` : ''}
      <button class="more" data-act="game-menu" aria-label="Match menu">${I.more}</button></div>`;
    return html + '</div>';
  }
  function dartPad(target, m, mult, disabled) {
    const dis = disabled ? 'disabled' : '';
    const multRow = `<div class="mult" role="group" aria-label="Multiplier">${[[1, 'Single'], [2, 'Double'], [3, 'Triple']].map(([v, l]) =>
      `<button class="${v === 3 ? 'triple' : ''}" data-act="mult" data-target="${target}" data-v="${v}" aria-pressed="${mult === v}" ${dis}>${l}</button>`).join('')}</div>`;
    const key = (s, label, cls, extraDis) => `<button class="key ${cls || ''}" data-act="dart" data-target="${target}" data-s="${s}" ${dis || extraDis ? 'disabled' : ''}>${label}</button>`;
    if (m.mode === 'cricket') {
      const nums = m.settings.numbers.filter((x) => x !== 25).slice().sort((a, b) => b - a);
      return multRow + `<div class="pad cricket">${nums.map((n) => key(n, n)).join('')}${key(0, 'Miss', 'miss')}${key('25', '25', '', mult === 3 ? 'disabled' : '')}${key('bull', 'Bull', '', mult === 3 ? 'disabled' : '')}</div>`;
    }
    let keys = '';
    for (let n = 1; n <= 20; n++) keys += key(n, n);
    keys += key('25', '25', '', mult === 3 ? 'disabled' : '');
    keys += key(0, 'Miss', 'miss span3') + key('bull', 'Bull', 'span2', mult === 3 ? 'disabled' : '');
    keys += `<button class="key span2" data-act="input-mode" data-target="${target}" data-v="total" ${dis}>Total</button>`;
    return multRow + `<div class="pad">${keys}</div>`;
  }
  function totalPad(target, buf, disabled) {
    const dis = disabled ? 'disabled' : '';
    const k = (v, l, cls) => `<button class="key ${cls || ''}" data-act="tkey" data-target="${target}" data-v="${v}" ${dis}>${l}</button>`;
    return `<div class="total-display ${buf ? '' : 'placeholder'}" aria-live="polite">${buf || 'Enter the turn total'}</div>
      <div class="pad keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => k(n, n)).join('')}${k('del', '⌫')}${k(0, '0')}${k('ok', 'Enter', 'green')}</div>
      <button class="key" data-act="input-mode" data-target="${target}" data-v="dart" ${dis}>Enter darts one by one</button>`;
  }

  /* ---------- game actions ---------- */
  function clearReview() {
    if (ui.reviewTimer) clearTimeout(ui.reviewTimer);
    ui.reviewTimer = null;
    ui.review = null;
  }
  function applyEvent(ev) {
    const m = activeMatch();
    if (!m || !m._rs.live) return;
    clearReview();
    const before = countTurns(m), beforeLeg = m._rs.liveIndex;
    m.legs[m.legs.length - 1].events.push(ev);
    const rs = refresh(m);
    save();
    let turn = null, legEnded = false;
    if (countTurns(m) > before) {
      const leg = m.legs[beforeLeg];
      turn = leg.turns[leg.turns.length - 1];
      legEnded = !!leg.winnerId;
    }
    feedback(m, ev, turn, legEnded, beforeLeg);
    if (!rs.live || !m.players[rs.live.seat].isBot) ui.botFast = false;
    if (m.status === 'finished') ensurePersist();
    if (turn) {
      ui.review = { matchId: m.id, legIndex: beforeLeg, turn, legEnded };
      ui.reviewTimer = setTimeout(endReview, 700);
    }
    render();
  }
  function endReview() {
    const rv = ui.review;
    ui.review = null; ui.reviewTimer = null;
    const m = activeMatch();
    if (rv && rv.legEnded && m && ui.screen === 'game') { openSheet({ type: 'recap', matchId: m.id, legIndex: rv.legIndex }); }
    render();
  }
  function feedback(m, ev, turn, legEnded, legIdx) {
    if (ev.t === 'd' || ev.t === 'tot') { sounds.dart(); vibrate(12); }
    if (!turn) return;
    const p = m.players.find((x) => x.id === turn.pid);
    const leg = m.legs[legIdx];
    if (m.mode === 'cricket') {
      if (legEnded) { sounds.win(); vibrate([40, 40, 120]); speak('Game shot'); }
      else speak(turn.marks === 1 ? '1 mark' : `${turn.marks} marks`);
      return;
    }
    if (turn.busted) {
      sounds.bust(); vibrate([60, 40, 60]);
      if (turn.autoLocked) { toast(`${ORD[turn.bustNumber] || 'Another'} bust: ${p.name} is locked in at ${turn.end}`, 'amber'); speak(`Bust. ${p.name} is locked in at ${turn.end}`); }
      else if (isHouse(m) && !turn.isFinalTurn) { toast(`Bust. Free bust ${turn.bustNumber} of ${m.settings.houseRule.bustAllowance} used`, 'red'); speak('Bust'); }
      else { toast('Bust', 'red'); speak('Bust'); }
    } else if (turn.lockedThisTurn) {
      sounds.lock(); toast(`${p.name} locked in at ${turn.end}. Everyone else gets one more turn.`, 'amber'); speak(`${p.name} locks in at ${turn.end}`);
    } else if (turn.checkout) {
      sounds.win(); vibrate([40, 40, 120]); speak('Game shot');
    } else {
      speak(turn.score === 180 ? 'One hundred and eighty' : String(turn.score));
    }
    if (legEnded && leg.resultType === 'lowScore') {
      const w = m.players.find((x) => x.id === leg.winnerId);
      sounds.win(); toast(`${w.name} wins the leg on low score (${leg.finalScores[w.id]})`, 'amber');
    }
  }
  function doUndo() {
    const m = activeMatch();
    if (!m) return;
    clearReview();
    if (!DL.undoLast(m)) return;
    refresh(m); save();
    if (ui.sheet && ui.sheet.type === 'recap') { ui.sheet = null; renderSheet(); }
    ui.botFast = false;
    render();
  }
  function afterRecap(s) {
    const m = matchById(s.matchId);
    if (m && m.status === 'finished' && s.done) { store.activeMatchId = null; save(); go('home'); }
  }

  /* ---------- bots ---------- */
  function scheduleBot() {
    const m = activeMatch();
    const ok = ui.screen === 'game' && m && m._rs.live && !ui.review && !ui.sheet && !ui.dialog && m.players[m._rs.live.seat].isBot;
    if (!ok) { if (ui.botTimer) clearTimeout(ui.botTimer); ui.botTimer = null; ui.botKey = ''; return; }
    const key = m.id + ':' + m.legs.length + ':' + m.legs[m.legs.length - 1].events.length + ':' + ui.botFast;
    if (ui.botTimer && ui.botKey === key) return;
    if (ui.botTimer) clearTimeout(ui.botTimer);
    ui.botKey = key;
    const delay = ui.botFast ? 90 : 600 + Math.random() * 300;
    ui.botTimer = setTimeout(() => {
      ui.botTimer = null; ui.botKey = '';
      const mm = activeMatch();
      if (!mm || !mm._rs.live || ui.screen !== 'game' || ui.sheet || ui.dialog || ui.review) return;
      if (!mm.players[mm._rs.live.seat].isBot) return;
      applyEvent(DL.botAction(mm, mm._rs));
    }, delay);
  }

  /* ---------- starting a match ---------- */
  function startMatch() {
    const h = store.home, mode = h.mode;
    const roster = h.roster.map(playerById).filter(Boolean);
    const order = roster.slice();
    if (h.randomOrder) for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    let settings;
    if (mode === 'x01') settings = JSON.parse(JSON.stringify(h.x01));
    else {
      const c = h.cricket;
      let numbers = DL.CRICKET_DEFAULT.slice();
      if (c.numbers === 'random') {
        const pool = Array.from({ length: 20 }, (_, i) => i + 1);
        for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
        numbers = pool.slice(0, 6).sort((a, b) => b - a).concat(25);
      }
      settings = { scoring: c.scoring, numbers, numbersMode: c.numbers, format: c.format, sets: c.sets, legs: c.legs };
    }
    const now = Date.now();
    const m = { id: uid(), createdAt: now, updatedAt: now, endedAt: null, status: 'active', mode, settings,
      players: order.map((p) => ({ id: p.id, name: p.name, isBot: !!p.isBot, skill: p.isBot ? p.skill : null })), legs: [{ events: [] }], winnerId: null };
    refresh(m);
    store.matches.unshift(m);
    store.activeMatchId = m.id;
    save();
    ui.pad = { mult: 1, buf: '' };
    openGame();
    if (h.randomOrder) toast(`${order[0].name} throws first`);
  }

  function submitTotal() {
    const m = activeMatch(); if (!m || !m._rs.live) return;
    const v = parseInt(ui.pad.buf, 10);
    if (!Number.isFinite(v)) return;
    if (!DL.isPossibleTotal(v)) { toast(`${v} is not possible with three darts`, 'red'); return; }
    const live = m._rs.live, S = m.settings, rem = live.rem[live.seat];
    ui.pad.buf = '';
    const checkedAfter = live.checked[live.seat] || v > 0;
    if (checkedAfter && rem - v === 0) {
      const opts = [1, 2, 3].filter((n) => (S.checkOut === 'straight' ? v <= 60 * n : DL.searchRoute(v, S.checkOut, n)));
      if (opts.length > 1) { openSheet({ type: 'checkoutDarts', v, opts }); return; }
      if (opts.length === 1) { applyEvent({ t: 'tot', v, n: opts[0] }); return; }
    }
    applyEvent({ t: 'tot', v, n: 3 });
  }

  /* ---------- edit turn ---------- */
  function openEditTurn(m, li, ti) {
    const t = m.legs[li].turns[ti];
    ui.edit = { matchId: m.id, li, ti, darts: t.totalEntry ? [] : t.darts.map((d) => ({ s: d.s, m: d.m })), mode: t.totalEntry ? 'total' : 'dart',
      buf: '', mult: 1, totalDarts: t.darts.length };
    const first = m.legs[li].events[t.evStart];
    if (t.totalEntry && first && first.t === 'tot') ui.edit.buf = String(first.v);
    openSheet({ type: 'edit' });
  }
  // Would this list of darts end the turn early (bust or checkout) before the last one?
  function editTurnEnds(m, t, darts) {
    if (m.mode !== 'x01') return false;
    const S = Object.assign({}, m.settings, { points: t.start, checkIn: t.startCheckedIn ? 'straight' : m.settings.checkIn, houseRule: { oneBustLowScore: false } });
    const r = DL.replayX01Leg(S, [{ id: 'x' }], 0, darts.map((d) => ({ t: 'd', s: d.s, m: d.m })));
    return r.turns.length > 0 || r.winnerId !== null;
  }
  function saveEdit(force) {
    const e = ui.edit, m = matchById(e.matchId);
    const leg = m.legs[e.li], t = leg.turns[e.ti];
    let ev;
    if (e.mode === 'total') {
      const v = parseInt(e.buf, 10);
      if (!DL.isPossibleTotal(v)) { toast('Enter a total that three darts can score', 'red'); return; }
      ev = [{ t: 'tot', v, n: Math.max(1, Math.min(3, e.totalDarts || 3)) }];
    } else {
      ev = e.darts.map((d) => ({ t: 'd', s: d.s, m: d.m }));
      if (e.darts.length < 3) ev.push(t.lockedThisTurn ? { t: 'lock' } : { t: 'end' });
      else if (t.lockedThisTurn) toast('A full three-dart turn cannot also lock in. The lock was removed.');
    }
    const trial = cloneForReplay(m);
    const tryApply = (evs) => { const c = cloneForReplay(m); c.legs[e.li].events.splice(t.evStart, t.evEnd - t.evStart, ...evs); DL.replayMatch(c); return c; };
    let c = tryApply(ev);
    const ct = (c.legs[e.li].turns || []).find((x) => x.evStart === t.evStart);
    if (ct && ct.evEnd - ct.evStart < ev.length) { ev = ev.slice(0, ct.evEnd - ct.evStart); c = tryApply(ev); }
    DL.replayMatch(trial);
    const sig = (mm) => mm.legs.map((l, i) => `${l.winnerId}:${i > e.li ? l.events.length : ''}`).join(',') + '#' + mm.legs.length;
    const changed = sig(trial) !== sig(c);
    const apply = () => {
      leg.events.splice(t.evStart, t.evEnd - t.evStart, ...ev);
      refresh(m); save();
      if (m.status !== 'finished' && m.status !== 'abandoned') store.activeMatchId = store.activeMatchId || m.id;
      ui.sheet = null; ui.edit = null; renderSheet(); render();
      toast('Turn updated');
    };
    if (changed && !force) {
      confirmBox({ title: 'This edit changes a leg result', message: 'Turns that no longer fit after this change will be removed.', confirm: 'Save edit', danger: true, onConfirm: apply });
    } else apply();
  }

  /* ======================================================================
     SHEETS
     ====================================================================== */
  const optBtn = (act, v, label, pressed, cls, dis) => `<button type="button" class="opt ${cls || ''}" data-act="${act}" data-v="${v}" aria-pressed="${pressed}" ${dis ? 'disabled' : ''}>${label}</button>`;
  const homeCfg = () => (store.home.mode === 'x01' ? store.home.x01 : store.home.cricket);
  const SHEETS = {
    points() {
      const x = store.home.x01;
      const custom = !DL.X01_POINTS.includes(x.points);
      return { title: 'Points', body: `<div class="opt-grid">${DL.X01_POINTS.map((p) => optBtn('set-points', p, p, x.points === p)).join('')}</div>
        <div class="field"><label for="custom-points">Custom (2 to 9999)</label><div class="inline"><input class="input" id="custom-points" inputmode="numeric" type="number" min="2" max="9999" value="${custom ? x.points : ''}" placeholder="e.g. 170">
        <button class="pill-btn green" data-act="set-points-custom">Use</button></div></div>` };
    },
    checkOut() {
      const x = store.home.x01;
      const d = { straight: 'Any dart that reaches exactly zero wins.', double: 'The last dart must be a double. Bull counts as a double.', master: 'The last dart must be a double or a triple. Bull counts.' };
      return { title: 'Check-Out', body: `<div class="opt-list">${Object.keys(OUT_NAMES).map((k) => optBtn('set-checkOut', k, `${OUT_NAMES[k]}<small>${d[k]}</small>`, x.checkOut === k, 'red')).join('')}</div>` };
    },
    checkIn() {
      const x = store.home.x01;
      const d = { straight: 'Every dart scores from the start.', double: 'Nothing scores until you hit a double. Bull counts.', master: 'Nothing scores until a double or triple. Bull counts.' };
      return { title: 'Check-In', body: `<div class="opt-list">${Object.keys(IN_NAMES).map((k) => optBtn('set-checkIn', k, `${IN_NAMES[k]}<small>${d[k]}</small>`, x.checkIn === k, 'red')).join('')}</div>` };
    },
    sets() { return countSheet('Sets', 'sets'); },
    legs() { return countSheet('Legs', 'legs'); },
    format() {
      const c = homeCfg();
      return { title: 'Set/Leg', body: `<div class="opt-list">${optBtn('set-format', 'firstTo', 'First to<small>First to N sets or legs wins.</small>', c.format === 'firstTo')}
        ${optBtn('set-format', 'bestOf', 'Best of<small>Best of N means first to more than half. Only odd numbers.</small>', c.format === 'bestOf')}</div>` };
    },
    house() {
      const hr = store.home.x01.houseRule;
      return { title: 'House Rules', body: `
        <div class="srow" style="padding:0"><span class="grow"><b>${HOUSE_NAME}</b><small>X01 only. Off by default.</small></span>${switchHtml('hr-on', hr.oneBustLowScore, 'hr-toggle', HOUSE_NAME, 'amber')}</div>
        <ul class="rule-list">
          <li>Play normal X01. Reaching exactly zero with a valid checkout still wins the leg at once.</li>
          <li>Busts work as usual (score goes back, turn ends). The first ${hr.bustAllowance === 1 ? 'bust is' : hr.bustAllowance + ' busts are'} free.</li>
          <li>The next bust also locks you in at the score you went back to.</li>
          <li>On your turn you can tap <b>Lock In</b> to stop at your current score.</li>
          <li>After the first lock, every other player gets exactly one more turn. Lowest remaining score wins the leg.</li>
          <li>Ties go to the player who locked. Between other players, the earlier thrower wins the tie.</li>
        </ul>
        <div class="field"><span class="lbl" id="hr-allow-l">Busts allowed before auto-lock</span><div class="stepper" role="group" aria-labelledby="hr-allow-l">
          <button data-act="hr-allow" data-v="-1" aria-label="Fewer busts" ${hr.bustAllowance <= 1 ? 'disabled' : ''}>−</button><output aria-live="polite">${hr.bustAllowance}</output>
          <button data-act="hr-allow" data-v="1" aria-label="More busts" ${hr.bustAllowance >= 3 ? 'disabled' : ''}>+</button></div></div>` };
    },
    scoring() {
      const c = store.home.cricket;
      const d = { standard: 'Points go to you. Close all seven with the higher or equal score to win.', cutthroat: 'Points go to opponents who are still open. Close all with the lowest score to win.', noscore: 'No points. First to close all seven wins.' };
      return { title: 'Scoring', body: `<div class="opt-list">${Object.keys(SCORING_NAMES).map((k) => optBtn('set-scoring', k, `${SCORING_NAMES[k]}<small>${d[k]}</small>`, c.scoring === k, 'red')).join('')}</div>` };
    },
    numbers() {
      const c = store.home.cricket;
      return { title: 'Numbers', body: `<div class="opt-list">${optBtn('set-numbers', 'standard', '15 to 20 and Bull<small>The standard board.</small>', c.numbers === 'standard', 'red')}
        ${optBtn('set-numbers', 'random', 'Random Numbers<small>Six random numbers plus Bull, drawn at START.</small>', c.numbers === 'random', 'red')}</div>` };
    },
    addPlayers() {
      const r = new Set(store.home.roster);
      const ps = store.players;
      return { title: 'Add Players', body: `${ps.length ? `<ul class="list" style="margin-bottom:8px">${ps.map((p) => `<li class="row"><label class="check" style="padding-right:10px"><input type="checkbox" data-change="roster-toggle" data-id="${p.id}" ${r.has(p.id) ? 'checked' : ''}>
          <span class="row-main" style="min-height:0"><span class="row-name ${p.isBot ? 'bot-name' : ''}">${esc(p.name)}</span><span class="row-sub">${esc(skillText(p))}</span></span></label></li>`).join('')}</ul>` : '<p style="color:var(--muted)">No saved players yet. Create one below.</p>'}
        <form class="field" data-form="new-player"><label for="np-name">New player</label><div class="inline"><input class="input" id="np-name" maxlength="24" placeholder="Name" autocomplete="off"><button class="pill-btn green" type="submit">Add</button></div></form>
        <div class="btn-row"><button class="pill-btn green" data-act="sheet-close">Done</button></div>` };
    },
    addBot() {
      const r = new Set(store.home.roster);
      const bots = store.players.filter((p) => p.isBot && !r.has(p.id));
      const s = ui.sheet.skill || 3;
      return { title: 'Computer player', body: `${bots.length ? `<p class="lbl" style="color:var(--muted);font-weight:700;font-size:13px">Saved computer players</p><div class="opt-list">${bots.map((b) => `<button class="opt" data-act="bot-pick" data-id="${b.id}"><span class="bot-name">${esc(b.name)}</span><small>Level ${b.skill} ${DL.SKILL_NAMES[b.skill]}</small></button>`).join('')}</div>` : ''}
        <div class="field"><span class="lbl">New computer player: skill level</span><div class="opt-list">${[1, 2, 3, 4, 5].map((k) => optBtn('bot-skill', k, `Level ${k} · ${DL.SKILL_NAMES[k]}<small>About ${DL.SKILL_TARGET_AVG[k]} three-dart average</small>`, s === k)).join('')}</div></div>
        <div class="btn-row"><button class="pill-btn green" data-act="bot-create">Add ${esc(nextBotName())}</button></div>` };
    },
    playerForm(s) {
      const p = s.id ? playerById(s.id) : { name: '', isBot: false, skill: 3, label: '' };
      const isBot = s.isBot !== undefined ? s.isBot : p.isBot;
      const skill = s.skill || p.skill || 3;
      return { title: s.id ? 'Edit player' : 'New player', body: `<form data-form="player">
        <div class="field"><label for="pf-name">Name</label><input class="input" id="pf-name" maxlength="24" value="${esc(s.name !== undefined ? s.name : p.name)}" placeholder="${isBot ? esc(nextBotName()) : 'Name'}" autocomplete="off"></div>
        <div class="field"><span class="lbl">Type</span>${seg('pf-type', [['human', 'Human'], ['bot', 'Computer']], isBot ? 'bot' : 'human')}</div>
        ${isBot ? `<div class="field"><span class="lbl">Skill level</span><div class="opt-grid" style="grid-template-columns:repeat(5,1fr)">${[1, 2, 3, 4, 5].map((k) => optBtn('pf-skill', k, k, skill === k)).join('')}</div><small style="color:var(--muted)">${DL.SKILL_NAMES[skill]}, about ${DL.SKILL_TARGET_AVG[skill]} average</small></div>` : ''}
        <div class="field"><label for="pf-label">Label (optional)</label><input class="input" id="pf-label" maxlength="20" value="${esc(s.label !== undefined ? s.label : p.label || '')}" placeholder="For example Left or Right handed" autocomplete="off"></div>
        <div class="btn-row">${s.id ? `<button type="button" class="pill-btn red" data-act="player-delete" data-id="${s.id}">Delete</button>` : ''}<button type="submit" class="pill-btn green">Save</button></div></form>` };
    },
    statsFilter() {
      const seen = new Map();
      store.players.forEach((p) => seen.set(p.id, p));
      store.matches.forEach((m) => m.players.forEach((p) => { if (!seen.has(p.id)) seen.set(p.id, p); }));
      const hidden = new Set(store.statsFilter.hidden);
      return { title: 'Statistics', body: `<p class="lbl" style="color:var(--muted);font-weight:700;font-size:13px">Players shown</p>
        ${seen.size ? `<ul class="list">${[...seen.values()].map((p) => `<li class="row"><label class="check"><input type="checkbox" data-change="stats-player" data-id="${p.id}" ${hidden.has(p.id) ? '' : 'checked'}><span class="${p.isBot ? 'bot-name' : ''}">${esc(p.name)}</span></label></li>`).join('')}</ul>` : '<p style="color:var(--muted)">No players yet.</p>'}
        <div class="btn-row"><button class="pill-btn red" data-act="reset-stats">Reset statistics</button><button class="pill-btn green" data-act="sheet-close">Done</button></div>` };
    },
    gameMenu() {
      const m = activeMatch();
      return { title: 'Match menu', body: `<div class="opt-list">
        <button class="opt" data-act="game-log">Match log<small>See every turn and edit a past turn</small></button>
        <button class="opt" data-act="match-settings">Settings for this match<small>Suggestions, early end turn, sound and input</small></button>
        <button class="opt" data-act="restart-leg" ${m && m._rs.live ? '' : 'disabled'}>Restart leg<small>Clears every dart in the current leg</small></button>
        <button class="opt" data-act="abandon">Abandon match<small>Ends the match without a winner. You can still resume it later.</small></button>
        <button class="opt" data-act="leave-game">Leave for now<small>Saved. Resume from Home or All Games.</small></button></div>` };
    },
    matchSettings() {
      const s = store.settings;
      const row = (label, id, key) => `<div class="srow" style="padding-inline:0"><span class="grow">${label}</span>${switchHtml(id, s[key], 'set-' + key, label)}</div>`;
      return { title: 'Settings for this match', body: row('Checkout suggestions', 'ms-sugg', 'suggestions') + row('Allow early end turn', 'ms-early', 'earlyEnd') +
        row('Sound effects', 'ms-sound', 'sound') + row('Vibration', 'ms-vib', 'vibration') + row('Voice announcer', 'ms-voice', 'voice') +
        (activeMatch() && activeMatch().mode === 'x01' ? `<div class="field"><span class="lbl">Score entry</span>${seg('ms-input', [['dart', 'Dart by dart'], ['total', 'Turn total']], s.inputMode)}</div>` : '') };
    },
    recap(s) {
      const m = matchById(s.matchId), leg = m.legs[s.legIndex], rs = m._rs, S = m.settings;
      const w = m.players.find((p) => p.id === leg.winnerId);
      const matchOver = !!leg.wonMatch;
      const title = matchOver ? 'Match won' : leg.wonSet ? 'Set won' : 'Leg won';
      const wTurns = leg.turns.filter((t) => t.pid === w.id);
      const wDarts = wTurns.reduce((a, t) => a + t.darts.length, 0);
      let result, table;
      if (m.mode === 'x01') {
        const pts = wTurns.reduce((a, t) => a + t.score, 0);
        const last = leg.turns[leg.turns.length - 1];
        result = leg.resultType === 'checkout' ? `Checkout ${last.start} · ${wDarts} darts · ${fmt2(DL.safeDiv(pts, wDarts) * 3)} average` : `Won on low score with ${leg.finalScores[w.id]} left · ${wDarts} darts`;
        const hr = isHouse(m);
        table = `<div class="table-wrap"><table class="stat"><thead><tr><th>Player</th><th>Left</th>${hr ? '<th>Busts</th><th>Lock</th>' : '<th>Leg avg</th>'}</tr></thead><tbody>${m.players.map((p) => {
          const ts = leg.turns.filter((t) => t.pid === p.id), d = ts.reduce((a, t) => a + t.darts.length, 0), sc = ts.reduce((a, t) => a + t.score, 0);
          return `<tr><td>${nameHtml(p)}</td><td>${leg.finalScores[p.id]}</td>${hr ? `<td>${leg.bustCounts[p.id]}</td><td>${leg.lockerId === p.id ? `<span class="lock-tag" style="justify-content:center">${I.lock}${leg.lockedScore}</span>` : '-'}</td>` : `<td>${fmt2(DL.safeDiv(sc, d) * 3)}</td>`}</tr>`;
        }).join('')}</tbody></table></div>`;
      } else {
        result = `Closed every number · ${wDarts} darts`;
        table = `<div class="table-wrap"><table class="stat"><thead><tr><th>Player</th><th>Points</th><th>Leg MPR</th></tr></thead><tbody>${m.players.map((p) => {
          const ts = leg.turns.filter((t) => t.pid === p.id), d = ts.reduce((a, t) => a + t.darts.length, 0), mk = ts.reduce((a, t) => a + t.marks, 0);
          return `<tr><td>${nameHtml(p)}</td><td>${leg.finalScores[p.id]}</td><td>${fmt2(DL.safeDiv(mk, d) * 3)}</td></tr>`;
        }).join('')}</tbody></table></div>`;
      }
      const score = `${S.sets > 1 ? 'Sets ' + m.players.map((p) => rs.setsWon[p.id]).join('-') + ' · ' : ''}Legs ${m.players.map((p) => (S.sets > 1 && !matchOver ? rs.legsWonSet[p.id] : rs.legsWonTotal[p.id])).join('-')}`;
      return { title, noClose: true, body: `<div style="text-align:center;margin-bottom:12px">
          <div style="font-size:30px;font-weight:800">${nameHtml(w)}</div><div style="color:var(--muted);font-weight:700;margin-top:4px">${esc(result)}</div>
          <div style="margin-top:8px;display:flex;gap:6px;justify-content:center;flex-wrap:wrap"><span class="chip">${esc(score)}</span>${isHouse(m) ? `<span class="chip amber">${HOUSE_NAME}</span>` : ''}</div></div>
        ${table}
        ${matchOver ? `<p class="saved-note">${I.check}Scores and stats saved on this device.${backupStale() ? ` <button class="link-btn" data-act="export">Save a backup file</button>` : ''}</p>` : ''}
        <div class="btn-row"><button class="pill-btn" data-act="undo">${I.undo}Undo</button>
        ${matchOver ? `<button class="pill-btn" data-act="recap-view">View match</button><button class="pill-btn green" data-act="recap-done">Done</button>` : `<button class="pill-btn green" data-act="sheet-close">Next leg</button>`}</div>` };
    },
    checkoutDarts(s) {
      return { title: `Checkout ${s.v}`, body: `<p>How many darts did the checkout take?</p><div class="opt-grid">${s.opts.map((n) => optBtn('co-darts', n, n + (n === 1 ? ' dart' : ' darts'), false)).join('')}</div>` };
    },
    edit() {
      const e = ui.edit, m = matchById(e.matchId), leg = m.legs[e.li], t = leg.turns[e.ti];
      const p = m.players.find((x) => x.id === t.pid);
      let body = `<p style="margin-top:0;color:var(--muted)">${S_LEG(m, leg)} · ${m.mode === 'x01' ? `Started on ${t.start}` : 'Cricket turn'}. Undo darts with Clear, then enter them again.</p>`;
      if (e.mode === 'total') {
        body += totalPad('edit', e.buf, false) + `<div class="field"><span class="lbl">Darts used</span>${seg('edit-tdarts', [[1, '1'], [2, '2'], [3, '3']], e.totalDarts || 3, 'small')}</div>`;
      } else {
        const ended = editTurnEnds(m, t, e.darts);
        body += `<div class="boxes" style="justify-content:center;margin-bottom:8px">${[0, 1, 2].map((k) => `<span class="dbox">${e.darts[k] ? esc(DL.dartLabel(e.darts[k])) : ''}</span>`).join('')}</div>`;
        body += dartPad('edit', m, e.mult, e.darts.length >= 3 || ended);
        if (ended) body += '<p class="hint">This dart ends the turn (bust or checkout).</p>';
      }
      body += `<div class="btn-row"><button class="pill-btn" data-act="edit-clear">Clear</button><button class="pill-btn" data-act="sheet-close">Cancel</button><button class="pill-btn green" data-act="edit-save">Save</button></div>`;
      return { title: `Edit turn: ${p.name}`, body };
    },
    text(s) {
      return { title: s.title, body: `${s.note ? `<p style="color:var(--muted)">${esc(s.note)}</p>` : ''}<textarea class="input" id="text-out" readonly aria-label="${esc(s.title)}">${esc(s.text)}</textarea>
        <div class="btn-row"><button class="pill-btn green" data-act="copy-text">Copy</button></div>` };
    },
    importData() {
      return { title: 'Import from JSON', body: `<p style="color:var(--muted)">Choose an exported file or paste its contents. Importing replaces the players, matches and settings on this device.</p>
        <div class="field"><label for="import-file">File</label><input class="input" type="file" id="import-file" accept="application/json,.json" data-change="import-file" style="padding-top:10px"></div>
        <div class="field"><label for="import-text">Or paste JSON</label><textarea class="input" id="import-text" placeholder="{ ... }"></textarea></div>
        <div class="btn-row"><button class="pill-btn green" data-act="import-run">Import</button></div>` };
    },
    selfTest() {
      const r = ui.sheet.results;
      const passed = r.filter((x) => x.pass).length;
      return { title: 'Self-tests', body: `<p><b>${passed} of ${r.length} passed.</b> ${passed === r.length ? 'Everything checks out.' : 'Some checks failed; details are below.'}</p>
        ${r.map((x) => `<div class="test-row"><b class="${x.pass ? 'ok' : 'bad'}">${x.pass ? 'PASS' : 'FAIL'}</b><span>${esc(x.name)}${x.detail ? `<small>${esc(x.detail)}</small>` : ''}</span></div>`).join('')}` };
    },
  };
  SHEETS.playerEdit = SHEETS.playerForm;
  SHEETS.playerNew = SHEETS.playerForm;
  function S_LEG(m, leg) { return `${m.settings.sets > 1 ? `Set ${leg.setNo}, ` : ''}Leg ${leg.legNo}`; }
  function countSheet(title, key) {
    const c = homeCfg();
    const opts = Array.from({ length: 21 }, (_, i) => i + 1);
    return { title, body: `<div class="opt-grid cols7">${opts.map((n) => optBtn('set-count', n, n, c[key] === n, '', c.format === 'bestOf' && n % 2 === 0)).join('')}</div>
      ${c.format === 'bestOf' ? '<p class="hint">Best of uses odd numbers only.</p>' : ''}` };
  }
  function nextBotName() {
    const names = new Set(store.players.map((p) => p.name));
    let n = 1; while (names.has('DartBot ' + n)) n++;
    return 'DartBot ' + n;
  }

  /* ---------- share / export / import ---------- */
  function lastMatchSummary() {
    const m = store.matches.slice().sort((a, b) => (b.endedAt || b.updatedAt) - (a.endedAt || a.updatedAt))[0];
    if (!m) return null;
    const lines = [`Dart Scoreboard: ${settingsSummary(m)}${isHouse(m) ? ' (' + HOUSE_NAME + ')' : ''}`];
    const w = m.players.find((p) => p.id === m.winnerId);
    lines.push(w ? `${w.name} won ${scoreLine(m)}.` : `In progress, ${scoreLine(m)}.`);
    const tot = DL.matchPlayerTotals(m, m._rs);
    lines.push(m.players.map((p) => `${p.name}: ${m.mode === 'x01' ? 'avg ' + fmt2(DL.safeDiv(tot[p.id].points, tot[p.id].darts) * 3) : 'MPR ' + fmt2(DL.safeDiv(tot[p.id].marks, tot[p.id].darts) * 3)}`).join(', '));
    return lines.join('\n');
  }
  async function share() {
    const text = lastMatchSummary();
    if (!text) { toast('Play a match first, then share the result.'); return; }
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch (e) { copied = false; }
    try { if (navigator.share) { await navigator.share({ title: 'Dart Scoreboard', text }); return; } } catch (e) { /* share refused or cancelled */ }
    if (copied) toast('Match summary copied');
    else openSheet({ type: 'text', title: 'Share the last match', text, note: 'Copy this summary.' });
  }
  function exportData() {
    const data = { app: 'Dart Scoreboard', version: DL.APP_VERSION, exportedAt: new Date().toISOString(),
      players: store.players, home: store.home, settings: store.settings,
      matches: store.matches.map((m) => Object.assign(serializeMatch(m), { legs: m.legs.map((l) => ({ e: l.events.map(DL.encodeEvent), turns: l.turns, winnerId: l.winnerId, resultType: l.resultType, lockerId: l.lockerId, lockedScore: l.lockedScore, finalRoundOrder: l.finalRoundOrder, finalScores: l.finalScores, bustCounts: l.bustCounts })) })) };
    const text = JSON.stringify(data, null, 1);
    const filename = `dart-scoreboard-${new Date().toISOString().slice(0, 10)}.json`;
    const fallback = (note) => openSheet({ type: 'text', title: 'Export all data', text, note });
    if (downloadsNs) {
      downloadsNs.save({ filename, data: text }).then(() => { markBackup(); toast('Backup saved'); render(); renderSheet(); }, (err) => {
        const code = err && err.code;
        if (code === 'declined') toast('Export cancelled');
        else if (code === 'rate_limited') toast('A save prompt is already open');
        else fallback('Saving a file is not available here. Copy this JSON and keep it somewhere safe.');
      });
      return;
    }
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      markBackup();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) { /* downloads blocked */ }
    fallback('If no file was saved, copy this JSON and keep it somewhere safe.');
  }
  function importText(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { toast('That is not valid JSON', 'red'); return; }
    if (!data || !Array.isArray(data.players) || !Array.isArray(data.matches)) { toast('This file is not a Dart Scoreboard export', 'red'); return; }
    confirmBox({ title: 'Replace all data?', message: `Import ${data.players.length} players and ${data.matches.length} matches. Current data on this device is replaced.`, confirm: 'Import', danger: true,
      onConfirm: () => {
        const keep = { statsFilter: store.statsFilter, gamesFilter: store.gamesFilter };
        const next = mergeStore(Object.assign({}, data, keep, { activeMatchId: null }));
        next.matches.forEach((m) => { try { hydrateMatch(m); } catch (e) { m._broken = true; } });
        next.matches = next.matches.filter((m) => !m._broken);
        store = next; save(); applyTheme(); ui.sheet = null; renderSheet(); go('home'); toast('Data imported');
      } });
  }

  function applyTheme() {
    const t = store.settings.theme;
    if (t === 'system') document.documentElement.removeAttribute('data-app-theme');
    else document.documentElement.setAttribute('data-app-theme', t);
  }

  /* ======================================================================
     EVENTS
     ====================================================================== */
  const ACT = {
    tab: (el) => go(el.dataset.tab),
    'home-mode': (el) => { store.home.mode = el.dataset.v; save(); render(); },
    pick: (el) => openSheet({ type: el.dataset.pick }),
    'set-points': (el) => { store.home.x01.points = +el.dataset.v; save(); closeSheet(); },
    'set-points-custom': () => {
      const v = parseInt($('#custom-points').value, 10);
      if (!(v >= 2 && v <= 9999)) { toast('Choose a number from 2 to 9999', 'red'); return; }
      store.home.x01.points = v; save(); closeSheet();
    },
    'set-checkOut': (el) => { store.home.x01.checkOut = el.dataset.v; save(); closeSheet(); },
    'set-checkIn': (el) => { store.home.x01.checkIn = el.dataset.v; save(); closeSheet(); },
    'set-count': (el) => { homeCfg()[ui.sheet.type] = +el.dataset.v; save(); closeSheet(); },
    'set-format': (el) => {
      const c = homeCfg(); c.format = el.dataset.v;
      if (c.format === 'bestOf') {
        const bumped = [];
        ['sets', 'legs'].forEach((k) => { if (c[k] % 2 === 0) { c[k] = Math.min(21, c[k] + 1); bumped.push(`${k === 'sets' ? 'Sets' : 'Legs'} set to ${c[k]}`); } });
        if (bumped.length) toast('Best of needs odd numbers. ' + bumped.join(', ') + '.');
      }
      save(); closeSheet();
    },
    'hr-allow': (el) => { const hr = store.home.x01.houseRule; hr.bustAllowance = Math.max(1, Math.min(3, hr.bustAllowance + +el.dataset.v)); save(); renderSheet(); render(); },
    'set-scoring': (el) => { store.home.cricket.scoring = el.dataset.v; save(); closeSheet(); },
    'set-numbers': (el) => { store.home.cricket.numbers = el.dataset.v; save(); closeSheet(); },
    start: () => startMatch(),
    resume: (el) => {
      const m = matchById(el.dataset.id); if (!m) return;
      if (m.status === 'abandoned') { m.status = 'active'; m.endedAt = null; }
      store.activeMatchId = m.id; save(); openGame();
    },
    share: () => share(),
    'add-players': () => openSheet({ type: 'addPlayers' }),
    'add-bot': () => openSheet({ type: 'addBot', skill: 3 }),
    'bot-skill': (el) => { ui.sheet.skill = +el.dataset.v; renderSheet(); },
    'bot-pick': (el) => { store.home.roster.push(el.dataset.id); save(); closeSheet(); },
    'bot-create': () => {
      const p = { id: uid(), name: nextBotName(), isBot: true, skill: ui.sheet.skill || 3, label: '', createdAt: Date.now() };
      store.players.push(p); store.home.roster.push(p.id); save(); closeSheet(); toast(`${p.name} added`);
    },
    'roster-remove': (el) => { store.home.roster = store.home.roster.filter((id) => id !== el.dataset.id); save(); render(); },
    'player-new': () => openSheet({ type: 'playerNew' }),
    'player-edit': (el) => openSheet({ type: 'playerEdit', id: el.dataset.id }),
    'pf-type': (el) => { captureForm(); ui.sheet.isBot = el.dataset.v === 'bot'; renderSheet(); },
    'pf-skill': (el) => { captureForm(); ui.sheet.skill = +el.dataset.v; renderSheet(); },
    'player-delete': (el) => {
      const p = playerById(el.dataset.id);
      confirmBox({ title: `Delete ${p.name}?`, message: 'Past matches stay in All Games. Choose whether their numbers stay in Statistics.',
        buttons: [
          { label: 'Cancel' },
          { label: 'Delete, keep stats', style: 'red', run: () => deletePlayer(p.id, false) },
          { label: 'Delete and hide stats', style: 'red', run: () => deletePlayer(p.id, true) },
        ] });
    },
    'stats-mode': (el) => { store.statsFilter.mode = el.dataset.v; save(); render(); },
    'stats-range': (el) => { store.statsFilter.range = el.dataset.v; save(); render(); },
    'stats-filter': () => openSheet({ type: 'statsFilter' }),
    info: () => { ui.infoOpen = !ui.infoOpen; render(); },
    'reset-stats': () => confirmBox({ title: 'Reset statistics?', message: 'This deletes every finished and abandoned match, which clears all statistics and the match history. Players and any match in progress are kept.', confirm: 'Reset', danger: true,
      onConfirm: () => { store.matches = store.matches.filter((m) => m.status === 'active'); save(); ui.sheet = null; renderSheet(); render(); toast('Statistics reset'); } }),
    'games-mode': (el) => { store.gamesFilter.mode = el.dataset.v; save(); render(); },
    'open-match': (el) => openDetail(el.dataset.id, 'games'),
    'delete-match': (el) => {
      const id = el.dataset.id;
      confirmBox({ title: 'Delete this match?', message: 'It is removed from All Games and Statistics. This cannot be undone.', confirm: 'Delete', danger: true,
        onConfirm: () => {
          store.matches = store.matches.filter((m) => m.id !== id);
          if (store.activeMatchId === id) store.activeMatchId = null;
          save(); if (ui.screen === 'match') { ui.screen = null; ui.tab = 'games'; saveUi(); } render(); toast('Match deleted');
        } });
    },
    'detail-back': () => { if (ui.detailFrom === 'game' && activeMatch()) openGame(); else go('games'); },
    'edit-turn': (el) => openEditTurn(matchById(ui.detailId), +el.dataset.li, +el.dataset.ti),
    'edit-clear': () => { ui.edit.darts = []; ui.edit.buf = ''; renderSheet(); },
    'edit-save': () => saveEdit(false),
    'edit-tdarts': (el) => { ui.edit.totalDarts = +el.dataset.v; renderSheet(); },
    theme: (el) => { store.settings.theme = el.dataset.v; save(); applyTheme(); render(); },
    export: () => exportData(),
    import: () => openSheet({ type: 'importData' }),
    'import-run': () => { const t = $('#import-text').value.trim(); if (!t) { toast('Choose a file or paste JSON first', 'red'); return; } importText(t); },
    'reset-all': () => confirmBox({ title: 'Reset all data?', message: 'Deletes every player, match and statistic and restores default settings on this device.', confirm: 'Reset everything', danger: true,
      onConfirm: () => { clearReview(); store = defaultStore(); save(); applyTheme(); go('home'); toast('All data reset'); } }),
    'self-test': () => { const results = DL.runSelfTests().concat(uiSelfTests()); openSheet({ type: 'selfTest', results }); },
    'copy-text': () => {
      const ta = $('#text-out');
      const done = () => { toast('Copied'); if (ui.sheet && ui.sheet.title === 'Export all data') markBackup(); };
      try { navigator.clipboard.writeText(ta.value).then(done, () => { ta.select(); toast('Press copy on your keyboard or menu'); }); }
      catch (e) { ta.select(); toast('Press copy on your keyboard or menu'); }
    },
    'sheet-close': () => closeSheet(),
    'sheet-bg': (el, e) => { if (e.target === el && !(ui.sheet && ui.sheet.type === 'recap')) closeSheet(); },
    'dialog-bg': (el, e) => { if (e.target === el) closeDialog(); },
    'dialog-btn': (el) => { const b = ui.dialog._buttons[+el.dataset.i]; closeDialog(); if (b && b.run) b.run(); },
    // game
    'game-bg': () => {
      const m = activeMatch();
      if (m && m._rs.live && m.players[m._rs.live.seat].isBot && !ui.botFast) { ui.botFast = true; scheduleBot(); }
    },
    'bot-fast': () => { ui.botFast = true; scheduleBot(); },
    mult: (el) => {
      const v = +el.dataset.v;
      if (el.dataset.target === 'edit') { ui.edit.mult = ui.edit.mult === v ? 1 : v; renderSheet(); }
      else { ui.pad.mult = ui.pad.mult === v ? 1 : v; render(); }
    },
    dart: (el) => {
      const raw = el.dataset.s;
      const target = el.dataset.target;
      const mult = target === 'edit' ? ui.edit.mult : ui.pad.mult;
      let d;
      if (raw === 'bull') d = { s: 25, m: 2 };
      else if (raw === '25') d = { s: 25, m: 1 };
      else if (+raw === 0) d = { s: 0, m: 0 };
      else d = { s: +raw, m: mult };
      if (target === 'edit') {
        if (ui.edit.darts.length >= 3) return;
        ui.edit.darts.push(d); ui.edit.mult = 1; renderSheet(); return;
      }
      ui.pad.mult = 1;
      applyEvent({ t: 'd', s: d.s, m: d.m });
    },
    'input-mode': (el) => {
      if (el.dataset.target === 'edit') { ui.edit.mode = el.dataset.v; ui.edit.darts = []; ui.edit.buf = ''; renderSheet(); return; }
      store.settings.inputMode = el.dataset.v; ui.pad.buf = ''; save(); render();
    },
    tkey: (el) => {
      const edit = el.dataset.target === 'edit';
      const o = edit ? ui.edit : ui.pad;
      const v = el.dataset.v;
      if (v === 'del') o.buf = o.buf.slice(0, -1);
      else if (v === 'ok') { if (edit) { saveEdit(false); return; } submitTotal(); return; }
      else if (o.buf.length < 3) o.buf = (o.buf + v).replace(/^0+(?=\d)/, '');
      if (edit) renderSheet(); else render();
    },
    'co-darts': (el) => { const s = ui.sheet; ui.sheet = null; renderSheet(); applyEvent({ t: 'tot', v: s.v, n: +el.dataset.v }); },
    undo: () => doUndo(),
    'end-turn': () => applyEvent({ t: 'end' }),
    'lock-in': () => {
      const m = activeMatch(); const live = m._rs.live; const p = m.players[live.seat];
      confirmBox({ title: `Lock in ${live.rem[live.seat]}?`, message: `Everyone else gets one more turn to beat it.${live.current.darts.length ? ' Darts already thrown this turn stay counted.' : ''}`, confirm: 'Lock In', amber: true,
        onConfirm: () => applyEvent({ t: 'lock' }) });
      void p;
    },
    'game-menu': () => openSheet({ type: 'gameMenu' }),
    'game-log': () => { ui.sheet = null; renderSheet(); openDetail(store.activeMatchId, 'game'); },
    'match-settings': () => openSheet({ type: 'matchSettings' }),
    'ms-input': (el) => { store.settings.inputMode = el.dataset.v; save(); renderSheet(); },
    'restart-leg': () => confirmBox({ title: 'Restart this leg?', message: 'Every dart in the current leg is cleared. Earlier legs stay.', confirm: 'Restart leg', danger: true,
      onConfirm: () => { const m = activeMatch(); clearReview(); m.legs[m.legs.length - 1].events = []; refresh(m); save(); ui.sheet = null; renderSheet(); render(); } }),
    abandon: () => confirmBox({ title: 'Abandon this match?', message: 'It ends without a winner and does not count in Statistics. You can resume it later from All Games.', confirm: 'Abandon', danger: true,
      onConfirm: () => { const m = activeMatch(); clearReview(); m.status = 'abandoned'; m.endedAt = Date.now(); store.activeMatchId = null; save(); ui.sheet = null; renderSheet(); go('home'); } }),
    'leave-game': () => {
      const m = activeMatch();
      const leave = () => { clearReview(); ui.sheet = null; renderSheet(); go('home'); };
      if (m && m.status === 'active') confirmBox({ title: 'Leave the match?', message: 'Progress is saved. Resume it from Home or All Games.', confirm: 'Leave', onConfirm: leave });
      else leave();
    },
    'open-recap': () => { const m = activeMatch(); openSheet({ type: 'recap', matchId: m.id, legIndex: m.legs.length - 1 }); },
    'recap-view': () => { const m = activeMatch(); ui.sheet = null; renderSheet(); store.activeMatchId = null; save(); openDetail(m.id, 'games'); },
    'recap-done': () => { ui.sheet.done = true; closeSheet(); },
  };
  function captureForm() {
    const n = $('#pf-name'), l = $('#pf-label');
    if (n) ui.sheet.name = n.value;
    if (l) ui.sheet.label = l.value;
  }
  function deletePlayer(id, hideStats) {
    store.players = store.players.filter((p) => p.id !== id);
    store.home.roster = store.home.roster.filter((x) => x !== id);
    if (hideStats && !store.statsFilter.hidden.includes(id)) store.statsFilter.hidden.push(id);
    save(); ui.sheet = null; renderSheet(); render(); toast('Player deleted');
  }

  const CHANGE = {
    'random-order': (el) => { store.home.randomOrder = el.checked; save(); render(); },
    'roster-toggle': (el) => {
      const id = el.dataset.id;
      if (el.checked) { if (!store.home.roster.includes(id)) store.home.roster.push(id); }
      else store.home.roster = store.home.roster.filter((x) => x !== id);
      save(); render();
    },
    'hr-toggle': (el) => { store.home.x01.houseRule.oneBustLowScore = el.checked; save(); render(); },
    'stats-player': (el) => {
      const id = el.dataset.id, h = new Set(store.statsFilter.hidden);
      if (el.checked) h.delete(id); else h.add(id);
      store.statsFilter.hidden = [...h]; save(); render();
    },
    'games-player': (el) => { store.gamesFilter.player = el.value; save(); render(); },
    'import-file': (el) => {
      const f = el.files && el.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { $('#import-text').value = String(r.result || ''); };
      r.readAsText(f);
    },
  };
  ['earlyEnd', 'suggestions', 'wakeLock', 'sound', 'vibration', 'voice'].forEach((k) => {
    CHANGE['set-' + k] = (el) => {
      store.settings[k] = el.checked; save();
      if (k === 'wakeLock') updateWakeLock();
      if (k === 'voice' && el.checked) speak('Voice on');
      render();
    };
  });

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = ACT[el.dataset.act];
    if (!fn) return;
    if (el.dataset.act === 'game-bg' && e.target.closest('button, input, select, a, label')) return;
    fn(el, e);
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (el && CHANGE[el.dataset.change]) CHANGE[el.dataset.change](el, e);
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-form]');
    if (!f) return;
    e.preventDefault();
    if (f.dataset.form === 'new-player') {
      const input = $('#np-name'), name = input.value.trim();
      if (!name) { toast('Type a name first', 'red'); input.focus(); return; }
      const p = { id: uid(), name, isBot: false, skill: null, label: '', createdAt: Date.now() };
      store.players.push(p); store.home.roster.push(p.id); save(); renderSheet(); render();
      const again = $('#np-name'); again && again.focus();
      toast(`${name} added`);
    } else if (f.dataset.form === 'player') {
      captureForm();
      const s = ui.sheet;
      const existing = s.id ? playerById(s.id) : null;
      const isBot = s.isBot !== undefined ? s.isBot : existing ? existing.isBot : false;
      const name = (s.name || '').trim() || (isBot ? nextBotName() : '');
      if (!name) { toast('Type a name first', 'red'); return; }
      const skill = isBot ? s.skill || (existing && existing.skill) || 3 : null;
      if (existing) Object.assign(existing, { name, isBot, skill, label: (s.label || '').trim() });
      else store.players.push({ id: uid(), name, isBot, skill, label: (s.label || '').trim(), createdAt: Date.now() });
      save(); closeSheet(); toast(existing ? 'Player saved' : `${name} added`);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (ui.dialog) { closeDialog(); return; }
      if (ui.sheet && ui.sheet.type !== 'recap') { closeSheet(); return; }
    }
    const h = e.target.closest && e.target.closest('[data-drag]');
    if (h && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const i = +h.dataset.idx, j = i + (e.key === 'ArrowUp' ? -1 : 1);
      if (moveItem(h.dataset.drag, i, j)) {
        const nh = document.querySelector(`[data-drag="${h.dataset.drag}"][data-idx="${j}"]`);
        nh && nh.focus();
      }
    }
    // Keyboard entry during a game: digits type a total in total mode.
    if (ui.screen === 'game' && !ui.sheet && !ui.dialog && store.settings.inputMode === 'total' && !e.target.closest('input, textarea, button')) {
      const k = /^[0-9]$/.test(e.key) ? e.key : e.key === 'Backspace' ? 'del' : e.key === 'Enter' ? 'ok' : null;
      if (k) { e.preventDefault(); ACT.tkey({ dataset: { v: k, target: 'game' } }); }
    }
  });

  /* ---------- drag to reorder ---------- */
  function moveItem(list, i, j) {
    const arr = list === 'roster' ? store.home.roster : store.players;
    const ids = list === 'roster' ? arr.filter((id) => playerById(id)) : arr;
    if (j < 0 || j >= ids.length || i === j) return false;
    const [x] = ids.splice(i, 1);
    ids.splice(j, 0, x);
    if (list === 'roster') store.home.roster = ids;
    save(); render();
    return true;
  }
  let drag = null;
  document.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('[data-drag]');
    if (!h || e.button > 0) return;
    const row = h.closest('.row'), listEl = row.parentElement;
    const rows = [...listEl.children];
    drag = { list: h.dataset.drag, from: +h.dataset.idx, to: +h.dataset.idx, row, rows, startY: e.clientY,
      mids: rows.map((r) => { const b = r.getBoundingClientRect(); return b.top + b.height / 2; }), h: row.getBoundingClientRect().height + 8, id: e.pointerId };
    try { h.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    row.classList.add('dragging');
    rows.forEach((r) => r !== row && r.classList.add('shift'));
    e.preventDefault();
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.startY;
    drag.row.style.transform = `translateY(${dy}px)`;
    const center = drag.mids[drag.from] + dy;
    let to = 0;
    drag.mids.forEach((m, k) => { if (k !== drag.from && center > m) to++; });
    drag.to = to;
    drag.rows.forEach((r, k) => {
      if (r === drag.row) return;
      let shift = 0;
      if (drag.from < to && k > drag.from && k <= to) shift = -drag.h;
      if (drag.from > to && k >= to && k < drag.from) shift = drag.h;
      r.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  });
  const endDrag = (e) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const d = drag; drag = null;
    d.rows.forEach((r) => { r.style.transform = ''; r.classList.remove('dragging', 'shift'); });
    if (d.to !== d.from) moveItem(d.list, d.from, d.to);
  };
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  /* ---------- UI-level self-tests ---------- */
  function uiSelfTests() {
    const out = [];
    const t = (name, fn) => { try { const r = fn(); out.push({ name, pass: r === true, detail: r === true ? '' : String(r) }); } catch (e) { out.push({ name, pass: false, detail: e.message }); } };
    t('UI: Lock In button hidden in Cricket and during final turns', () => {
      const P = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
      const mk = (mode, S, evs) => { const m = { id: 'tmp', mode, settings: S, players: P, legs: [{ events: evs }] }; refresh(m, true); return m; };
      const X = { points: 301, checkIn: 'straight', checkOut: 'double', format: 'firstTo', sets: 1, legs: 1, houseRule: { oneBustLowScore: true, bustAllowance: 1 } };
      const has = (m) => /data-act="lock-in"/.test(inputPanel(m, m._rs, null, false));
      const normal = mk('x01', X, []);
      const final = mk('x01', X, [{ t: 'd', s: 20, m: 3 }, { t: 'lock' }]);
      const cricket = mk('cricket', { scoring: 'standard', numbers: DL.CRICKET_DEFAULT, format: 'firstTo', sets: 1, legs: 1, houseRule: X.houseRule }, []);
      return (has(normal) && !has(final) && !has(cricket)) || 'visible in the wrong place';
    });
    t('UI: stats render without NaN on empty data', () => {
      const saved = store.matches; store.matches = [];
      const a = renderStats(); store.matches = saved;
      return (!/NaN/.test(a) && /No data yet/.test(a)) || 'NaN found';
    });
    t('UI: saved data round-trips through serialisation', () => {
      const s = JSON.parse(serializeStore());
      return (Array.isArray(s.matches) && s.matches.every((m) => m.legs.every((l) => Array.isArray(l.e)))) || 'bad shape';
    });
    return out;
  }

  /* ---------- boot ---------- */
  function boot(data) {
    loadStore(data && data.store);
    try { const u = JSON.parse(ssGet(UI_KEY) || 'null'); if (u) Object.assign(ui, { tab: u.tab || 'home', screen: u.screen || null, detailId: u.detailId || null, detailFrom: u.detailFrom || null }); } catch (e) { /* ignore */ }
    if (data && data.ui) Object.assign(ui, data.ui);
    // Resume the active match on refresh.
    const am = activeMatch();
    if (am && am.status === 'active' && ui.screen !== 'match') ui.screen = 'game';
    applyTheme();
    render();
    updateWakeLock();
    ensurePersist().then(() => { if (ui.tab === 'settings' && !ui.screen) render(); });
    const r = DL.runSelfTests();
    const failed = r.filter((x) => !x.pass);
    try { console.info(`Dart Scoreboard self-tests: ${r.length - failed.length}/${r.length} passed`); failed.forEach((f) => console.warn('FAIL', f.name, f.detail)); } catch (e) { /* ignore */ }
    window.__dartApp = { store: () => store, ui, runSelfTests: () => DL.runSelfTests().concat(uiSelfTests()) };
  }
  // File saves go through the viewer's downloads capability when it is available.
  let downloadsNs = null;
  try {
    if (window.claude && typeof window.claude.use === 'function') {
      window.claude.use('downloads').then((ns) => { downloadsNs = ns || null; }, () => { downloadsNs = null; });
    }
  } catch (e) { downloadsNs = null; }
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) { try { hot.snapshot(() => ({ store: serializeStore(), ui: { tab: ui.tab, screen: ui.screen, detailId: ui.detailId, detailFrom: ui.detailFrom } })); } catch (e) { /* ignore */ } }
  if (hot && hot.ready) hot.ready(boot); else boot((hot && hot.data) || {});
  // Offline support when installed from GitHub Pages.
  try {
    if ('serviceWorker' in navigator && /\.github\.io$/.test(location.hostname)) {
      window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
    }
  } catch (e) { /* ignore */ }
})();
