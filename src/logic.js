/* ==========================================================================
   DART SCOREBOARD: PURE LOGIC (no DOM access in this section)
   --------------------------------------------------------------------------
   PLAN
   Data model: store raw input, derive everything else.
     Match  = { id, createdAt, updatedAt, endedAt, status, mode, settings,
                players[{id,name,isBot,skill}], legs[{ events[] }], winnerId }
     Event  = {t:'d',s,m} one dart | {t:'tot',v,n} turn total | {t:'end'} end
              turn early | {t:'lock'} house rule Lock In.
     replayMatch(match) rebuilds every derived field (turn log per leg, leg
     winners, result type, locks, final scores, set and leg counts, live
     state) from the raw events. Undo pops the last event, Edit replaces the
     events of one turn, and both simply replay. Autosave stores only raw
     events (compact strings) so history stays small.
   Actions: dart, total, end, lock, undo, editTurn, restartLeg.
   House rule state machine per leg:
     normal play -> (manual Lock In | bust beyond allowance = auto-lock)
     -> final round (each other seat once, in seat order after the locker)
     -> resolution (lowest remaining; ties to locker, then earlier thrower).
     A valid checkout ends the leg at any moment, including the final round.
   Stat formulas (pure, (matches, filter) -> numbers, zero-safe):
     3-dart average = points / darts * 3. First-9 = first three turns of each
     leg, points / darts * 3. Double % and Triple % = hits / tracked darts.
     Checkout % = checkouts / darts thrown while one dart could finish.
     MPR = marks / darts * 3.
   ========================================================================== */
const DL = (() => {
  'use strict';

  /* ---------- constants ---------- */
  const APP_VERSION = '1.0.0';
  const BOARD_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
  // Regulation board radii in millimetres.
  const RINGS = { innerBull: 6.35, outerBull: 15.9, tripleIn: 99, tripleOut: 107, doubleIn: 162, doubleOut: 170 };
  const X01_POINTS = [101, 201, 301, 401, 501, 601, 701, 801, 901, 1001];
  const IMPOSSIBLE_CHECKOUTS = [169, 168, 166, 165, 163, 162, 159];
  const SKILL_NAMES = ['', 'Beginner', 'Amateur', 'Intermediate', 'Advanced', 'Pro'];
  const SKILL_TARGET_AVG = [0, 25, 40, 55, 70, 90];
  // Gaussian spread (mm, per axis) calibrated by simulation to the averages above.
  const SKILL_SIGMA = [0, 35, 22, 15.4, 11.2, 7.6];
  const CRICKET_DEFAULT = [20, 19, 18, 17, 16, 15, 25];

  /* ---------- darts ---------- */
  function dartValue(s, m) {
    if (!s || !m) return 0;
    if (s === 25) return m === 2 ? 50 : 25;
    return s * m;
  }
  function validDart(d) {
    if (!d || typeof d.s !== 'number' || typeof d.m !== 'number') return false;
    if (d.s === 0) return d.m === 0;
    if (d.s === 25) return d.m === 1 || d.m === 2;
    return Number.isInteger(d.s) && d.s >= 1 && d.s <= 20 && (d.m === 1 || d.m === 2 || d.m === 3);
  }
  const isDoubleDart = (d) => !!d && d.s > 0 && d.m === 2;
  const isTripleDart = (d) => !!d && d.s > 0 && d.m === 3;
  function dartLabel(d) {
    if (!d) return '';
    if (d.total) return '·';
    if (!d.s) return 'M';
    if (d.s === 25) return d.m === 2 ? 'Bull' : '25';
    return (d.m === 2 ? 'D' : d.m === 3 ? 'T' : '') + d.s;
  }
  function parseDartLabel(str) {
    if (str === 'Bull') return { s: 25, m: 2 };
    if (str === '25') return { s: 25, m: 1 };
    if (str === 'M') return { s: 0, m: 0 };
    const m = str[0] === 'T' ? 3 : str[0] === 'D' ? 2 : 1;
    const s = parseInt(/^[SDT]/.test(str) ? str.slice(1) : str, 10);
    return { s, m };
  }

  const ALL_DARTS = (() => {
    const a = [];
    for (let s = 1; s <= 20; s++) a.push({ s, m: 1 }, { s, m: 2 }, { s, m: 3 });
    a.push({ s: 25, m: 1 }, { s: 25, m: 2 });
    return a;
  })();

  const POSSIBLE_TOTALS = (() => {
    const vals = [0, ...new Set(ALL_DARTS.map((d) => dartValue(d.s, d.m)))];
    const set = new Set();
    for (const a of vals) for (const b of vals) for (const c of vals) set.add(a + b + c);
    return set;
  })();
  const isPossibleTotal = (v) => Number.isInteger(v) && v >= 0 && v <= 180 && POSSIBLE_TOTALS.has(v);

  const neededWins = (format, n) => (format === 'bestOf' ? Math.ceil(n / 2) : n);

  /* ---------- checkout routes ---------- */
  function finishOk(d, rule) {
    if (!d || !d.s) return false;
    if (rule === 'straight') return true;
    if (rule === 'double') return d.m === 2;
    return d.m === 2 || d.m === 3; // master
  }
  function setupCost(d) {
    if (d.m === 3) {
      const t = { 20: 0, 19: 1, 18: 2, 17: 3, 16: 3.5, 15: 4, 14: 4.5, 13: 5, 12: 5.5, 11: 6, 10: 6.5 };
      return t[d.s] !== undefined ? t[d.s] : 7 + (10 - d.s) * 0.2;
    }
    if (d.m === 1) {
      if (d.s === 25) return 5;
      return 4 + (20 - d.s) * 0.15;
    }
    if (d.s === 25) return 6;
    return 9 + (20 - d.s) * 0.1;
  }
  const DOUBLE_PREF = { 20: 0, 16: 0.5, 8: 2, 18: 2, 12: 3, 10: 3, 4: 4, 14: 5, 6: 5, 2: 6, 25: 6, 19: 7, 17: 7, 15: 7, 13: 8, 11: 8, 9: 8, 7: 9, 5: 9, 3: 10, 1: 12 };
  function finishCost(d, rule) {
    if (d.m === 2) return DOUBLE_PREF[d.s];
    if (rule === 'master') return 3 + setupCost(d);
    return setupCost(d);
  }
  const FINISH_BY_VALUE = {};
  for (const rule of ['straight', 'double', 'master']) {
    const map = new Map();
    for (const d of ALL_DARTS) {
      if (!finishOk(d, rule)) continue;
      const v = dartValue(d.s, d.m);
      if (!map.has(v)) map.set(v, []);
      map.get(v).push(d);
    }
    FINISH_BY_VALUE[rule] = map;
  }
  const routeMemo = new Map();
  // Fewest darts first, then the most conventional route by cost.
  function searchRoute(rem, rule, maxDarts) {
    const key = rem + '|' + rule + '|' + maxDarts;
    if (routeMemo.has(key)) return routeMemo.get(key);
    let best = null;
    if (rem >= 1 && rem <= 180 && !(rule !== 'straight' && rem < 2)) {
      const fin = FINISH_BY_VALUE[rule];
      for (let k = 1; k <= maxDarts && !best; k++) {
        let bestCost = Infinity;
        const consider = (route, cost) => { if (cost < bestCost) { bestCost = cost; best = route; } };
        if (k === 1) {
          for (const f of fin.get(rem) || []) consider([f], finishCost(f, rule));
        } else if (k === 2) {
          for (const a of ALL_DARTS) {
            const need = rem - dartValue(a.s, a.m);
            if (need < 1) continue;
            for (const f of fin.get(need) || []) consider([a, f], (a.m === 3 ? 2 : 1) * setupCost(a) + finishCost(f, rule));
          }
        } else {
          for (const a of ALL_DARTS) {
            const va = dartValue(a.s, a.m);
            for (const b of ALL_DARTS) {
              const vb = dartValue(b.s, b.m);
              const need = rem - va - vb;
              if (need < 1) continue;
              for (const f of fin.get(need) || []) {
                consider([a, b, f], (a.m === 3 ? 2 : 1) * setupCost(a) + setupCost(b) + finishCost(f, rule) + (vb > va ? 0.05 : 0));
              }
            }
          }
        }
      }
    }
    routeMemo.set(key, best);
    return best;
  }
  const routeString = (route) => route.map(dartLabel).join(' ');

  // Standard Double Out routes (three darts available), 2 to 170.
  // prettier-ignore
  const CHECKOUT_TABLE = {
    170:'T20 T20 Bull', 167:'T20 T19 Bull', 164:'T20 T18 Bull', 161:'T20 T17 Bull', 160:'T20 T20 D20',
    158:'T20 T20 D19', 157:'T20 T19 D20', 156:'T20 T20 D18', 155:'T20 T19 D19', 154:'T20 T18 D20',
    153:'T20 T19 D18', 152:'T20 T20 D16', 151:'T20 T17 D20', 150:'T20 T18 D18', 149:'T20 T19 D16',
    148:'T20 T16 D20', 147:'T20 T17 D18', 146:'T20 T18 D16', 145:'T20 T15 D20', 144:'T20 T20 D12',
    143:'T20 T17 D16', 142:'T20 T14 D20', 141:'T20 T19 D12', 140:'T20 T20 D10', 139:'T20 T13 D20',
    138:'T20 T18 D12', 137:'T20 T19 D10', 136:'T20 T20 D8', 135:'T20 T17 D12', 134:'T20 T14 D16',
    133:'T20 T19 D8', 132:'T20 T20 D6', 131:'T20 T13 D16', 130:'T20 T18 D8', 129:'T20 T19 D6',
    128:'T20 T20 D4', 127:'T20 T17 D8', 126:'T20 T18 D6', 125:'T20 T19 D4', 124:'T20 T16 D8',
    123:'T20 T13 D12', 122:'T20 T18 D4', 121:'T20 T15 D8', 120:'T20 20 D20', 119:'T20 19 D20',
    118:'T20 18 D20', 117:'T20 17 D20', 116:'T20 16 D20', 115:'T20 15 D20', 114:'T20 14 D20', 113:'T20 13 D20',
    112:'T20 20 D16', 111:'T20 19 D16', 110:'T20 Bull', 109:'T20 17 D16', 108:'T20 16 D16', 107:'T19 Bull',
    106:'T20 14 D16', 105:'T20 13 D16', 104:'T18 Bull', 103:'T20 11 D16', 102:'T20 10 D16', 101:'T17 Bull',
    100:'T20 D20', 99:'T20 7 D16', 98:'T20 D19', 97:'T19 D20', 96:'T20 D18', 95:'T19 D19', 94:'T18 D20',
    93:'T19 D18', 92:'T20 D16', 91:'T17 D20', 90:'T18 D18', 89:'T19 D16', 88:'T20 D14', 87:'T17 D18',
    86:'T18 D16', 85:'T19 D14', 84:'T20 D12', 83:'T17 D16', 82:'Bull D16', 81:'T19 D12', 80:'T20 D10',
    79:'T13 D20', 78:'T18 D12', 77:'T19 D10', 76:'T20 D8', 75:'T17 D12', 74:'T18 D10', 73:'T19 D8',
    72:'T20 D6', 71:'T17 D10', 70:'T18 D8', 69:'T19 D6', 68:'T20 D4', 67:'T17 D8', 66:'Bull D8', 65:'25 D20',
    64:'T20 D2', 63:'T17 D6', 62:'T18 D4', 61:'25 D18', 60:'20 D20', 59:'19 D20', 58:'18 D20', 57:'17 D20',
    56:'16 D20', 55:'15 D20', 54:'14 D20', 53:'13 D20', 52:'20 D16', 51:'19 D16', 50:'Bull', 49:'17 D16',
    48:'16 D16', 47:'15 D16', 46:'14 D16', 45:'13 D16', 44:'12 D16', 43:'11 D16', 42:'10 D16', 41:'9 D16',
    40:'D20', 39:'7 D16', 38:'D19', 37:'5 D16', 36:'D18', 35:'19 D8', 34:'D17', 33:'17 D8', 32:'D16',
    31:'15 D8', 30:'D15', 29:'13 D8', 28:'D14', 27:'11 D8', 26:'D13', 25:'9 D8', 24:'D12', 23:'7 D8', 22:'D11',
    21:'5 D8', 20:'D10', 19:'3 D8', 18:'D9', 17:'1 D8', 16:'D8', 15:'7 D4', 14:'D7', 13:'5 D4', 12:'D6',
    11:'3 D4', 10:'D5', 9:'1 D4', 8:'D4', 7:'3 D2', 6:'D3', 5:'1 D2', 4:'D2', 3:'1 D1', 2:'D1',
  };

  function checkoutRoute(rem, rule, dartsLeft) {
    if (dartsLeft < 1 || rem < 1) return null;
    if (rule === 'double' && dartsLeft === 3) {
      const s = CHECKOUT_TABLE[rem];
      return s ? s.split(' ').map(parseDartLabel) : null;
    }
    return searchRoute(rem, rule, dartsLeft);
  }
  // A single dart could finish from this remaining score.
  function oneDartFinish(rem, rule) {
    return !!(FINISH_BY_VALUE[rule].get(rem) || []).length;
  }

  /* ---------- sectors (stats chart) ---------- */
  // 0 miss, 1..20 singles, 25, D1..D20, D25, T1..T20
  const X01_SECTOR_LABELS = (() => {
    const a = ['0'];
    for (let i = 1; i <= 20; i++) a.push(String(i));
    a.push('25');
    for (let i = 1; i <= 20; i++) a.push('D' + i);
    a.push('D25');
    for (let i = 1; i <= 20; i++) a.push('T' + i);
    return a;
  })();
  const X01_TICKS = ['0', '5', '10', '15', '25', 'D5', 'D10', 'D15', 'D25', 'T5', 'T10', 'T15', 'T20'];
  function sectorKey(d) {
    if (!d || !d.s || !d.m) return '0';
    if (d.m === 1) return String(d.s);
    return (d.m === 2 ? 'D' : 'T') + d.s;
  }
  function cricketSectorLabels(nums) {
    const singles = nums.filter((n) => n !== 25).sort((a, b) => a - b);
    const a = ['0'];
    singles.forEach((n) => a.push(String(n)));
    a.push('25');
    singles.forEach((n) => a.push('D' + n));
    a.push('D25');
    singles.forEach((n) => a.push('T' + n));
    return a;
  }

  /* ---------- X01 leg replay ---------- */
  const checkInOk = (d, rule) => rule === 'straight' || (d.s > 0 && (d.m === 2 || (rule === 'master' && d.m === 3)));
  const checkOutOk = (d, rule) => finishOk(d, rule);

  function replayX01Leg(S, P, starter, events) {
    const n = P.length;
    const hr = !!(S.houseRule && S.houseRule.oneBustLowScore);
    const allowance = hr ? Math.max(1, Math.min(3, S.houseRule.bustAllowance || 1)) : 0;
    const rule = S.checkOut;
    const rem = P.map(() => S.points);
    const checked = P.map(() => S.checkIn === 'straight');
    const busts = P.map(() => 0);
    const turns = [];
    let seat = starter, cur = null, phase = 'normal';
    let lockerSeat = null, lockedScore = null, finalOrder = [], finalPos = 0;
    let winnerSeat = null, resultType = null, consumed = 0, idx = 0;

    const startTurn = () => {
      cur = {
        pid: P[seat].id, seat, darts: [], start: rem[seat], startCheckedIn: checked[seat],
        busted: false, checkout: false, endedEarly: false, isFinalTurn: phase === 'final',
        lockedThisTurn: false, autoLocked: false, bustNumber: 0, totalEntry: false, score: 0,
        checkedIn: checked[seat], evStart: idx, evEnd: idx,
      };
    };
    const closeTurn = () => {
      cur.end = rem[seat];
      cur.score = cur.busted ? 0 : cur.start - cur.end;
      cur.checkedIn = checked[seat];
      cur.evEnd = idx + 1;
      turns.push(cur);
      cur = null;
    };
    const resolveLow = () => {
      let best = null;
      for (const s of [lockerSeat, ...finalOrder]) if (best === null || rem[s] < rem[best]) best = s;
      winnerSeat = best;
      resultType = 'lowScore';
      phase = 'done';
    };
    const advance = () => {
      if (winnerSeat !== null) return;
      if (phase === 'normal') { seat = (seat + 1) % n; return; }
      finalPos++;
      if (finalPos >= finalOrder.length) resolveLow();
      else seat = finalOrder[finalPos];
    };
    const startFinal = (s) => {
      phase = 'final';
      lockerSeat = s;
      lockedScore = rem[s];
      finalOrder = [];
      for (let k = 1; k < n; k++) finalOrder.push((s + k) % n);
      finalPos = -1;
    };
    const bust = () => {
      rem[seat] = cur.start;
      checked[seat] = cur.startCheckedIn;
      cur.busted = true;
      for (const x of cur.darts) x.scored = 0;
      busts[seat]++;
      cur.bustNumber = busts[seat];
      const s = seat;
      if (hr && phase === 'normal' && busts[seat] > allowance) {
        cur.autoLocked = true;
        closeTurn();
        startFinal(s);
      } else closeTurn();
      advance();
    };
    const win = () => {
      cur.checkout = true;
      closeTurn();
      winnerSeat = seat;
      resultType = 'checkout';
      phase = 'done';
    };

    for (idx = 0; idx < events.length; idx++) {
      if (winnerSeat !== null) break;
      const ev = events[idx];
      consumed = idx + 1;
      if (ev.t === 'd') {
        if (!validDart(ev)) continue;
        if (!cur) startTurn();
        const d = { s: ev.s, m: ev.m, v: dartValue(ev.s, ev.m), total: false, scored: 0, rb: rem[seat], ci: checked[seat] };
        cur.darts.push(d);
        if (!checked[seat]) {
          if (checkInOk(d, S.checkIn)) { checked[seat] = true; cur.checkInDart = cur.darts.length; }
          else { if (cur.darts.length >= 3) { closeTurn(); advance(); } continue; }
        }
        const next = rem[seat] - d.v;
        if (next < 0 || (next === 0 && !checkOutOk(d, rule)) || (next === 1 && rule !== 'straight')) { bust(); continue; }
        d.scored = d.v;
        rem[seat] = next;
        if (next === 0) { win(); continue; }
        if (cur.darts.length >= 3) { closeTurn(); advance(); }
      } else if (ev.t === 'tot') {
        if (cur && cur.darts.length) continue;
        const v = ev.v, nd = Math.max(1, Math.min(3, ev.n || 3));
        if (!isPossibleTotal(v)) continue;
        startTurn();
        cur.totalEntry = true;
        for (let k = 0; k < nd; k++) cur.darts.push({ s: null, m: null, v: 0, total: true, scored: 0, rb: rem[seat], ci: checked[seat] });
        if (!checked[seat]) {
          if (v > 0) checked[seat] = true;
          else { closeTurn(); advance(); continue; }
        }
        const next = rem[seat] - v;
        const finishable = rule === 'straight' ? v <= 60 * nd : !!searchRoute(v, rule, nd);
        if (next < 0 || (next === 1 && rule !== 'straight') || (next === 0 && !finishable)) { bust(); continue; }
        cur.darts[0].scored = v;
        rem[seat] = next;
        if (next === 0) win();
        else { closeTurn(); advance(); }
      } else if (ev.t === 'end') {
        if (cur && cur.darts.length) { cur.endedEarly = true; closeTurn(); advance(); }
        else if (phase === 'final') { startTurn(); cur.endedEarly = true; closeTurn(); advance(); }
      } else if (ev.t === 'lock') {
        if (!hr || phase !== 'normal') continue;
        if (!cur) startTurn();
        const s = seat;
        cur.lockedThisTurn = true;
        cur.endedEarly = cur.darts.length < 3;
        closeTurn();
        startFinal(s);
        advance();
      }
    }
    idx = events.length;
    const live = winnerSeat === null ? (cur || (startTurn(), cur)) : null;
    const finalScores = {}, bustCounts = {};
    P.forEach((p, i) => { finalScores[p.id] = rem[i]; bustCounts[p.id] = busts[i]; });
    return {
      turns, current: live, seat, rem, checked, busts, phase,
      lockerSeat, lockerId: lockerSeat === null ? null : P[lockerSeat].id, lockedScore,
      finalOrder, finalPos, finalRoundOrder: finalOrder.map((s) => P[s].id),
      winnerSeat, winnerId: winnerSeat === null ? null : P[winnerSeat].id, resultType,
      finalScores, bustCounts, consumed, houseRule: hr, allowance,
    };
  }

  /* ---------- Cricket leg replay ---------- */
  function replayCricketLeg(S, P, starter, events) {
    const n = P.length, nums = S.numbers || CRICKET_DEFAULT, mode = S.scoring || 'standard';
    const marks = P.map(() => { const o = {}; nums.forEach((x) => (o[x] = 0)); return o; });
    const points = P.map(() => 0);
    const turns = [];
    let seat = starter, cur = null, winnerSeat = null, consumed = 0, idx = 0;
    const startTurn = () => { cur = { pid: P[seat].id, seat, darts: [], marks: 0, points: 0, endedEarly: false, evStart: idx, evEnd: idx }; };
    const closeTurn = () => { cur.evEnd = idx + 1; turns.push(cur); cur = null; };
    const closedAll = (s) => nums.every((x) => marks[s][x] >= 3);
    const wins = (s) => {
      if (!closedAll(s)) return false;
      if (mode === 'noscore') return true;
      for (let o = 0; o < n; o++) {
        if (o === s) continue;
        if (mode === 'standard' && points[s] < points[o]) return false;
        if (mode === 'cutthroat' && points[s] > points[o]) return false;
      }
      return true;
    };
    for (idx = 0; idx < events.length; idx++) {
      if (winnerSeat !== null) break;
      const ev = events[idx];
      consumed = idx + 1;
      if (ev.t === 'd') {
        if (!validDart(ev)) continue;
        if (!cur) startTurn();
        const inPlay = ev.s > 0 && nums.includes(ev.s);
        const d = inPlay ? { s: ev.s, m: ev.m, v: dartValue(ev.s, ev.m), marks: 0, hits: ev.m, pts: 0 } : { s: 0, m: 0, v: 0, marks: 0, hits: 0, pts: 0 };
        if (inPlay) {
          const x = ev.s, val = x === 25 ? 25 : x, cm = marks[seat][x];
          const add = Math.min(ev.m, 3 - cm), extra = ev.m - add;
          marks[seat][x] = cm + add;
          d.marks = add;
          const openOpps = [];
          for (let o = 0; o < n; o++) if (o !== seat && marks[o][x] < 3) openOpps.push(o);
          if (extra > 0 && openOpps.length && mode !== 'noscore') {
            d.marks += extra;
            d.pts = extra * val;
            if (mode === 'standard') points[seat] += d.pts;
            else openOpps.forEach((o) => (points[o] += d.pts));
          }
        }
        cur.darts.push(d);
        cur.marks += d.marks;
        cur.points += d.pts;
        const order = [seat];
        for (let k = 1; k < n; k++) order.push((seat + k) % n);
        const w = order.find(wins);
        if (w !== undefined) { cur.win = true; closeTurn(); winnerSeat = w; break; }
        if (cur.darts.length >= 3) { closeTurn(); seat = (seat + 1) % n; }
      } else if (ev.t === 'end') {
        if (cur && cur.darts.length) { cur.endedEarly = true; closeTurn(); seat = (seat + 1) % n; }
      }
    }
    idx = events.length;
    const live = winnerSeat === null ? (cur || (startTurn(), cur)) : null;
    const dead = {};
    nums.forEach((x) => (dead[x] = marks.every((mk) => mk[x] >= 3)));
    const finalScores = {};
    P.forEach((p, i) => (finalScores[p.id] = points[i]));
    return {
      turns, current: live, seat, marks, points, dead, nums, mode,
      winnerSeat, winnerId: winnerSeat === null ? null : P[winnerSeat].id,
      resultType: winnerSeat === null ? null : 'closed', finalScores, consumed, phase: winnerSeat === null ? 'normal' : 'done',
    };
  }

  /* ---------- match replay ---------- */
  const DERIVED_LEG_KEYS = ['turns', 'winnerId', 'resultType', 'lockerId', 'lockedScore', 'finalRoundOrder', 'finalScores', 'bustCounts', 'setNo', 'legNo', 'starterId', 'wonSet', 'wonMatch'];

  function replayMatch(match) {
    const S = match.settings, P = match.players, n = P.length;
    const setsNeed = neededWins(S.format, S.sets), legsNeed = neededWins(S.format, S.legs);
    const setsWon = {}, legsWonSet = {}, legsWonTotal = {};
    P.forEach((p) => { setsWon[p.id] = 0; legsWonSet[p.id] = 0; legsWonTotal[p.id] = 0; });
    if (!match.legs || !match.legs.length) match.legs = [{ events: [] }];
    const legs = match.legs;
    let setNo = 0, legInSet = 0, setStarter = 0, winnerId = null, live = null, liveIndex = legs.length - 1;
    for (let li = 0; li < legs.length; li++) {
      const leg = legs[li];
      if (!Array.isArray(leg.events)) leg.events = [];
      const starter = (setStarter + legInSet) % n;
      const r = match.mode === 'cricket' ? replayCricketLeg(S, P, starter, leg.events) : replayX01Leg(S, P, starter, leg.events);
      DERIVED_LEG_KEYS.forEach((k) => delete leg[k]);
      Object.assign(leg, {
        setNo: setNo + 1, legNo: legInSet + 1, starterId: P[starter].id, turns: r.turns,
        winnerId: r.winnerId, resultType: r.resultType, finalScores: r.finalScores,
      });
      if (match.mode !== 'cricket') {
        Object.assign(leg, { lockerId: r.lockerId, lockedScore: r.lockedScore, finalRoundOrder: r.finalRoundOrder, bustCounts: r.bustCounts });
      }
      if (r.consumed < leg.events.length && r.winnerId !== null) leg.events = leg.events.slice(0, r.consumed);
      if (r.winnerId === null) {
        live = r; liveIndex = li;
        if (li < legs.length - 1) legs.length = li + 1;
        break;
      }
      const w = r.winnerId;
      legsWonSet[w]++;
      legsWonTotal[w]++;
      if (legsWonSet[w] >= legsNeed) {
        setsWon[w]++;
        leg.wonSet = true;
        if (setsWon[w] >= setsNeed) {
          winnerId = w;
          leg.wonMatch = true;
          if (li < legs.length - 1) legs.length = li + 1;
          liveIndex = li;
          break;
        }
        Object.keys(legsWonSet).forEach((k) => (legsWonSet[k] = 0));
        setNo++;
        legInSet = 0;
        setStarter = (setStarter + 1) % n;
      } else legInSet++;
      if (li === legs.length - 1) legs.push({ events: [] });
    }
    match.winnerId = winnerId;
    return { winnerId, setsWon, legsWonSet, legsWonTotal, live, liveIndex, setNo: setNo + 1, legNo: legInSet + 1, setsNeed, legsNeed };
  }

  function undoLast(match) {
    const legs = match.legs;
    for (let i = legs.length - 1; i >= 0; i--) {
      if (legs[i].events.length) { legs[i].events.pop(); legs.length = i + 1; return true; }
    }
    return false;
  }

  // Turn state helpers used by the UI and the tests.
  function canLockIn(match, rs) {
    if (!match || match.mode !== 'x01' || !rs || !rs.live) return false;
    const S = match.settings;
    if (!(S.houseRule && S.houseRule.oneBustLowScore)) return false;
    return rs.live.phase === 'normal';
  }
  function isFinalTurn(match, rs) {
    return !!(match && match.mode === 'x01' && rs && rs.live && rs.live.phase === 'final');
  }
  // Remaining must drop strictly below this to beat the current leader in the final round.
  function finalTarget(live) {
    let t = live.lockedScore;
    for (let k = 0; k < live.finalPos; k++) t = Math.min(t, live.rem[live.finalOrder[k]]);
    return t;
  }

  /* ---------- dartboard model for bots ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rng) {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function aimPoint(d) {
    if (d.s === 25) return d.m === 2 ? { x: 0, y: 0 } : { x: 0, y: 11 };
    const i = BOARD_ORDER.indexOf(d.s);
    const th = (i * 18 * Math.PI) / 180;
    const r = d.m === 3 ? 103 : d.m === 2 ? 166 : 135;
    return { x: r * Math.sin(th), y: r * Math.cos(th) };
  }
  function landingDart(x, y) {
    const r = Math.hypot(x, y);
    if (r <= RINGS.innerBull) return { s: 25, m: 2 };
    if (r <= RINGS.outerBull) return { s: 25, m: 1 };
    if (r > RINGS.doubleOut) return { s: 0, m: 0 };
    let deg = (Math.atan2(x, y) * 180) / Math.PI;
    deg = (deg + 360 + 9) % 360;
    const s = BOARD_ORDER[Math.floor(deg / 18) % 20];
    const m = r >= RINGS.tripleIn && r <= RINGS.tripleOut ? 3 : r >= RINGS.doubleIn ? 2 : 1;
    return { s, m };
  }
  function throwAt(target, skill, rng) {
    const sig = SKILL_SIGMA[Math.max(1, Math.min(5, skill || 3))];
    const p = aimPoint(target);
    return landingDart(p.x + gauss(rng) * sig, p.y + gauss(rng) * sig);
  }

  const SCORING_AIMS = (() => {
    const a = [];
    for (let s = 20; s >= 1; s--) a.push({ s, m: 3 });
    for (let s = 20; s >= 1; s--) a.push({ s, m: 1 });
    a.push({ s: 25, m: 1 });
    return a.sort((x, y) => dartValue(y.s, y.m) - dartValue(x.s, x.m));
  })();
  const SETUP_AIMS = [{ s: 20, m: 3 }, { s: 19, m: 3 }, { s: 18, m: 3 }, { s: 17, m: 3 }, { s: 16, m: 3 }, { s: 15, m: 3 },
    { s: 20, m: 1 }, { s: 19, m: 1 }, { s: 18, m: 1 }, { s: 17, m: 1 }, { s: 16, m: 1 }, { s: 15, m: 1 }, { s: 25, m: 1 }];

  function chooseX01Aim(rem, dartsLeft, S, checkedIn, maxScore) {
    if (!checkedIn) return S.checkIn === 'double' ? { s: 20, m: 2 } : { s: 20, m: 3 };
    const rule = S.checkOut, minLeave = rule === 'straight' ? 1 : 2;
    const route = checkoutRoute(rem, rule, dartsLeft);
    if (route) return route[0];
    if (maxScore) {
      for (const a of SCORING_AIMS) if (rem - dartValue(a.s, a.m) >= minLeave) return a;
      return { s: 1, m: 1 };
    }
    if (rem - 60 > 170) return { s: 20, m: 3 };
    const nextDarts = dartsLeft > 1 ? dartsLeft - 1 : 3;
    for (const a of SETUP_AIMS) {
      const left = rem - dartValue(a.s, a.m);
      if (left >= minLeave && checkoutRoute(left, rule, nextDarts)) return a;
    }
    for (const a of SCORING_AIMS) {
      const left = rem - dartValue(a.s, a.m);
      if (left >= minLeave && (rule === 'straight' || left !== 1)) return a;
    }
    return { s: 1, m: 1 };
  }

  function botShouldLock(S, live, seat, skill) {
    const rem = live.rem[seat];
    const freeLeft = live.allowance - live.busts[seat] > 0;
    const opps = live.rem.filter((_, i) => i !== seat);
    if (!opps.length) return rem <= 40;
    const minOpp = Math.min(...opps);
    if (minOpp - 140 > rem) return true;
    let thr = [0, 60, 45, 32, 20, 10][Math.max(1, Math.min(5, skill || 3))];
    if (freeLeft) thr = Math.round(thr / 2);
    const dartsLeft = 3 - live.current.darts.length;
    const route = checkoutRoute(rem, S.checkOut, dartsLeft);
    return rem <= thr && (!route || skill <= 2);
  }

  function chooseCricketAim(S, live, seat) {
    const nums = live.nums, mk = live.marks, pts = live.points, n = mk.length, mode = live.mode;
    const others = []; for (let o = 0; o < n; o++) if (o !== seat) others.push(o);
    const byValue = nums.slice().sort((a, b) => (a === 25 ? 0 : a) > (b === 25 ? 0 : b) ? -1 : 1);
    const aim = (x) => (x === 25 ? { s: 25, m: 2 } : { s: x, m: 3 });
    const mineOpen = byValue.filter((x) => mk[seat][x] < 3);
    const scoring = byValue.filter((x) => mk[seat][x] >= 3 && others.some((o) => mk[o][x] < 3));
    if (mode === 'standard') {
      const maxOpp = Math.max(...others.map((o) => pts[o]));
      if ((pts[seat] <= maxOpp || !mineOpen.length) && scoring.length && (pts[seat] < maxOpp || !mineOpen.length)) return aim(scoring[0]);
      if (mineOpen.length) return aim(mineOpen[0]);
      return scoring.length ? aim(scoring[0]) : { s: 20, m: 3 };
    }
    if (mode === 'cutthroat') {
      const minOpp = Math.min(...others.map((o) => pts[o]));
      if ((!mineOpen.length || pts[seat] > minOpp) && scoring.length && !mineOpen.length) return aim(scoring[0]);
      if (mineOpen.length) return aim(mineOpen[0]);
      return scoring.length ? aim(scoring[0]) : { s: 20, m: 3 };
    }
    return mineOpen.length ? aim(mineOpen[0]) : { s: 20, m: 3 };
  }

  // Returns the next event a computer player makes. Always a legal event.
  function botAction(match, rs, rng) {
    rng = rng || Math.random;
    const live = rs.live, seat = live.seat, p = match.players[seat], skill = p.skill || 3;
    if (match.mode === 'cricket') {
      const t = throwAt(chooseCricketAim(match.settings, live, seat), skill, rng);
      if (t.s && !live.nums.includes(t.s)) return { t: 'd', s: 0, m: 0 };
      return { t: 'd', s: t.s, m: t.m };
    }
    const S = match.settings, cur = live.current, dartsLeft = 3 - cur.darts.length, rem = live.rem[seat];
    let maxScore = false;
    if (live.phase === 'final') {
      const target = finalTarget(live);
      if (rem < target && !checkoutRoute(rem, S.checkOut, dartsLeft)) return { t: 'end' };
      if (rem < target && cur.darts.length > 0) return { t: 'end' };
      maxScore = true;
    } else if (live.houseRule && live.phase === 'normal' && botShouldLock(S, live, seat, skill)) {
      return { t: 'lock' };
    }
    const t = throwAt(chooseX01Aim(rem, dartsLeft, S, live.checked[seat], maxScore), skill, rng);
    return { t: 'd', s: t.s, m: t.m };
  }

  /* ---------- statistics (pure) ---------- */
  const safeDiv = (a, b) => (b ? a / b : 0);
  const pct = (a, b) => safeDiv(a, b) * 100;
  function inRange(match, range, now) {
    const t = match.endedAt || 0;
    if (!range || range === 'all') return true;
    if (range === 'today') { const d = new Date(now); d.setHours(0, 0, 0, 0); return t >= d.getTime(); }
    const days = range === '7d' ? 7 : 30;
    return t >= now - days * 86400000;
  }
  function filterMatches(matches, filter) {
    const now = filter.now || Date.now();
    return matches.filter((m) =>
      (filter.includeUnfinished || m.status === 'finished') && m.mode === filter.mode && inRange(m, filter.range, now));
  }
  function playerOrder(ms, filter) {
    const seen = new Map();
    ms.forEach((m) => m.players.forEach((p) => { if (!seen.has(p.id)) seen.set(p.id, p); }));
    const order = (filter.order || []).filter((id) => seen.has(id));
    seen.forEach((_, id) => { if (!order.includes(id)) order.push(id); });
    const hidden = new Set(filter.hidden || []);
    return order.filter((id) => !hidden.has(id)).map((id) => seen.get(id));
  }

  function statsX01(matches, filter) {
    const ms = filterMatches(matches, Object.assign({}, filter, { mode: 'x01' }));
    const players = playerOrder(ms, filter);
    const acc = {};
    players.forEach((p) => {
      acc[p.id] = {
        id: p.id, name: p.name, isBot: !!p.isBot, games: 0, wins: 0, legs: 0, legsWon: 0,
        darts: 0, legDarts: 0, points: 0, f9Points: 0, f9Darts: 0, maxScore: 0,
        b60: 0, b100: 0, b140: 0, b180: 0, tracked: 0, doubles: 0, triples: 0,
        maxCheckout: 0, minDarts: 0, checkouts: 0, attempts: 0,
        hrGames: 0, locks: 0, busts: 0, autoLocks: 0, finalWins: 0, finalAttempts: 0,
        sectors: X01_SECTOR_LABELS.map(() => 0),
      };
    });
    let hasHouse = false;
    for (const m of ms) {
      const hr = !!(m.settings.houseRule && m.settings.houseRule.oneBustLowScore);
      if (hr) hasHouse = true;
      const rule = m.settings.checkOut;
      m.players.forEach((p) => {
        const a = acc[p.id]; if (!a) return;
        a.games++; if (m.winnerId === p.id) a.wins++; if (hr) a.hrGames++;
      });
      for (const leg of m.legs) {
        if (!leg.winnerId || !leg.turns) continue;
        const legDarts = {}, turnNo = {};
        m.players.forEach((p) => { const a = acc[p.id]; if (a) { a.legs++; if (leg.winnerId === p.id) a.legsWon++; } legDarts[p.id] = 0; turnNo[p.id] = 0; });
        for (const t of leg.turns) {
          const nd = t.darts.length;
          legDarts[t.pid] += nd;
          const a = acc[t.pid]; if (!a) continue;
          a.darts += nd; a.legDarts += nd; a.points += t.score;
          if (turnNo[t.pid] < 3) { a.f9Points += t.score; a.f9Darts += nd; }
          turnNo[t.pid]++;
          if (t.score > a.maxScore) a.maxScore = t.score;
          if (t.score === 180) a.b180++; else if (t.score >= 140) a.b140++; else if (t.score >= 100) a.b100++; else if (t.score >= 60) a.b60++;
          if (!t.totalEntry) {
            for (const d of t.darts) {
              a.tracked++;
              if (isDoubleDart(d)) a.doubles++;
              if (isTripleDart(d)) a.triples++;
              a.sectors[X01_SECTOR_LABELS.indexOf(sectorKey(d))]++;
              if (d.ci !== false && oneDartFinish(d.rb, rule)) a.attempts++;
            }
          }
          if (t.checkout) {
            if (!t.totalEntry) a.checkouts++;
            if (t.start > a.maxCheckout) a.maxCheckout = t.start;
          }
          if (hr) {
            if (t.lockedThisTurn) a.locks++;
            if (t.busted) a.busts++;
            if (t.autoLocked) a.autoLocks++;
            if (t.isFinalTurn) { a.finalAttempts++; if (leg.winnerId === t.pid) a.finalWins++; }
          }
        }
        if (leg.resultType === 'checkout' && acc[leg.winnerId]) {
          const a = acc[leg.winnerId], nd = legDarts[leg.winnerId];
          if (!a.minDarts || nd < a.minDarts) a.minDarts = nd;
        }
      }
    }
    const rows = players.map((p) => {
      const a = acc[p.id];
      return Object.assign(a, {
        winPct: pct(a.wins, a.games), legPct: pct(a.legsWon, a.legs),
        dartsPerLeg: safeDiv(a.legDarts, a.legs), doublePct: pct(a.doubles, a.tracked), triplePct: pct(a.triples, a.tracked),
        avg: safeDiv(a.points, a.darts) * 3, first9: safeDiv(a.f9Points, a.f9Darts) * 3,
        checkoutPct: pct(a.checkouts, a.attempts),
      });
    });
    return { rows, hasData: ms.length > 0, hasHouse, labels: X01_SECTOR_LABELS, ticks: X01_TICKS, matchCount: ms.length };
  }

  function statsCricket(matches, filter) {
    const ms = filterMatches(matches, Object.assign({}, filter, { mode: 'cricket' }));
    const players = playerOrder(ms, filter);
    const numSet = new Set();
    ms.forEach((m) => (m.settings.numbers || CRICKET_DEFAULT).forEach((x) => numSet.add(x)));
    if (!numSet.size) CRICKET_DEFAULT.forEach((x) => numSet.add(x));
    const labels = cricketSectorLabels([...numSet]);
    const acc = {};
    players.forEach((p) => {
      acc[p.id] = { id: p.id, name: p.name, isBot: !!p.isBot, games: 0, wins: 0, legs: 0, legsWon: 0, darts: 0, rounds: 0,
        marks: 0, triples: 0, bulls: 0, points: 0, maxMarks: 0, sectors: labels.map(() => 0) };
    });
    for (const m of ms) {
      m.players.forEach((p) => { const a = acc[p.id]; if (a) { a.games++; if (m.winnerId === p.id) a.wins++; } });
      for (const leg of m.legs) {
        if (!leg.winnerId || !leg.turns) continue;
        m.players.forEach((p) => { const a = acc[p.id]; if (a) { a.legs++; if (leg.winnerId === p.id) a.legsWon++; } });
        for (const t of leg.turns) {
          const a = acc[t.pid]; if (!a) continue;
          a.rounds++; a.darts += t.darts.length; a.marks += t.marks; a.points += t.points;
          if (t.marks > a.maxMarks) a.maxMarks = t.marks;
          for (const d of t.darts) {
            if (d.m === 3 && d.s) a.triples++;
            if (d.s === 25) a.bulls++;
            const i = labels.indexOf(sectorKey(d));
            a.sectors[i < 0 ? 0 : i]++;
          }
        }
      }
    }
    const rows = players.map((p) => {
      const a = acc[p.id];
      return Object.assign(a, { winPct: pct(a.wins, a.games), legPct: pct(a.legsWon, a.legs), mpr: safeDiv(a.marks, a.darts) * 3, ppr: safeDiv(a.points, a.rounds) });
    });
    const ticks = labels.filter((l, i) => i === 0 || l === '25' || l === 'D25' || /^[DT]?(15|20)$/.test(l));
    return { rows, hasData: ms.length > 0, labels, ticks, matchCount: ms.length };
  }

  // Live per-match numbers for the in-game cards (all turns of the match so far).
  function matchPlayerTotals(match, rs) {
    const out = {};
    match.players.forEach((p) => (out[p.id] = { darts: 0, points: 0, marks: 0 }));
    match.legs.forEach((leg) => (leg.turns || []).forEach((t) => {
      const o = out[t.pid]; if (!o) return;
      o.darts += t.darts.length;
      o.points += match.mode === 'cricket' ? t.points : t.score;
      o.marks += t.marks || 0;
    }));
    if (rs && rs.live && rs.live.current) {
      const c = rs.live.current, o = out[c.pid];
      o.darts += c.darts.length;
      if (match.mode === 'cricket') o.marks += c.marks;
      else o.points += c.start - rs.live.rem[c.seat];
    }
    return out;
  }

  /* ---------- compact serialisation of raw events ---------- */
  function encodeEvent(e) {
    if (e.t === 'd') return e.s ? 'MSDT'[e.m] + e.s : 'M';
    if (e.t === 'tot') return 'X' + e.v + '/' + (e.n || 3);
    if (e.t === 'end') return 'E';
    if (e.t === 'lock') return 'L';
    return '';
  }
  function decodeEvent(str) {
    if (typeof str !== 'string') return str && str.t ? str : null;
    if (str === 'M') return { t: 'd', s: 0, m: 0 };
    if (str === 'E') return { t: 'end' };
    if (str === 'L') return { t: 'lock' };
    if (str[0] === 'X') { const [v, n] = str.slice(1).split('/'); return { t: 'tot', v: +v, n: +n || 3 }; }
    const m = 'MSDT'.indexOf(str[0]);
    return { t: 'd', s: +str.slice(1), m };
  }

  /* ---------- self-tests ---------- */
  function runSelfTests() {
    const results = [];
    const test = (name, fn) => {
      try { const r = fn(); results.push({ name, pass: r === true, detail: r === true ? '' : String(r) }); }
      catch (e) { results.push({ name, pass: false, detail: e.message }); }
    };
    const P2 = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
    const P3 = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
    const X = (o) => Object.assign({ points: 301, checkIn: 'straight', checkOut: 'double', format: 'firstTo', sets: 1, legs: 1, houseRule: { oneBustLowScore: false, bustAllowance: 1 } }, o || {});
    const HR = (o) => X(Object.assign({ houseRule: { oneBustLowScore: true, bustAllowance: 1 } }, o || {}));
    const D = (lbl) => Object.assign({ t: 'd' }, parseDartLabel(lbl));
    const ev = (str) => str.split(' ').filter(Boolean).map((x) => (x === 'E' ? { t: 'end' } : x === 'L' ? { t: 'lock' } : D(x)));
    const leg = (S, P, str, starter) => replayX01Leg(S, P, starter || 0, ev(str));
    const mkMatch = (S, P, mode) => ({ mode: mode || 'x01', settings: S, players: P, legs: [{ events: [] }] });

    test('Bust reverts the score and scores zero', () => {
      const r = leg(X({ points: 50 }), P2, 'T20');
      const t = r.turns[0];
      return (t.busted && t.score === 0 && r.rem[0] === 50 && r.seat === 1) || JSON.stringify(t);
    });
    test('Double Out: leaving 1 is a bust', () => {
      const r = leg(X({ points: 41 }), P2, 'T20 S20');
      return (r.turns[0].busted && r.rem[0] === 41) || 'rem ' + r.rem[0];
    });
    test('Double Out: finishing on a single is a bust', () => {
      const r = leg(X({ points: 40 }), P2, 'T10 S10');
      return (r.turns[0].busted && r.winnerId === null) || 'no bust';
    });
    test('Double In: nothing scores before a double', () => {
      const r = leg(X({ checkIn: 'double' }), P2, 'T20 T20 D10');
      const t = r.turns[0];
      return (t.score === 20 && r.rem[0] === 281 && r.checked[0]) || 'score ' + t.score;
    });
    test('Master Out: triple finishes, single busts', () => {
      const a = leg(X({ points: 60, checkOut: 'master' }), P2, 'T20');
      const b = leg(X({ points: 20, checkOut: 'master' }), P2, 'S20');
      const c = leg(X({ points: 3, checkOut: 'master' }), P2, 'S2');
      return (a.winnerId === 'a' && b.turns[0].busted && c.turns[0].busted) || 'master out wrong';
    });
    test('Straight Out: exact zero wins on any dart', () => {
      const r = leg(X({ points: 20, checkOut: 'straight' }), P2, 'S20');
      return (r.winnerId === 'a' && r.resultType === 'checkout') || 'no win';
    });
    test('Best of 5 needs 3, first to 5 needs 5', () => neededWins('bestOf', 5) === 3 && neededWins('firstTo', 5) === 5 && neededWins('bestOf', 1) === 1);
    test('Starter rotation across legs and sets', () => {
      // First to 2 sets of first to 2 legs; A wins every leg.
      const m = mkMatch(X({ points: 101, checkOut: 'straight', sets: 2, legs: 2 }), P2);
      const legFor = (starter) => (starter === 'a' ? ev('T20 S20 S20 S1 S1 S1 S1') : ev('S1 S1 S1 T20 S20 S20 S1 S1 S1 S1'));
      const starters = [];
      for (let i = 0; i < 4; i++) {
        const rs = replayMatch(m);
        const st = m.players[rs.live.seat].id;
        starters.push(st);
        m.legs[m.legs.length - 1].events = legFor(st);
      }
      const rs = replayMatch(m);
      // Set 1: A then B start. Set 2 opens with B (who did not start set 1), then A.
      return (starters.join('') === 'abba' && rs.winnerId === 'a' && rs.setsWon.a === 2) || starters.join('');
    });
    test('Total entry is excluded from sector stats but counts in average', () => {
      const m = mkMatch(X({ points: 101, checkOut: 'straight' }), [{ id: 'a', name: 'A' }]);
      m.legs[0].events = [{ t: 'tot', v: 60, n: 3 }, D('S20'), D('S20'), D('S1')];
      replayMatch(m); m.status = 'finished'; m.endedAt = Date.now();
      const s = statsX01([m], { range: 'all' }).rows[0];
      const sectorSum = s.sectors.reduce((a, b) => a + b, 0);
      return (sectorSum === 3 && s.darts === 6 && s.points === 101 && s.maxScore === 60) || JSON.stringify({ sectorSum, d: s.darts, p: s.points });
    });
    test('Stats never divide by zero', () => {
      const s = statsX01([], { range: 'all' });
      const c = statsCricket([], { range: 'all' });
      const z = safeDiv(5, 0) === 0 && pct(0, 0) === 0;
      return (z && !s.hasData && !c.hasData && s.rows.length === 0) || 'unsafe';
    });
    test('Checkout table: 170, 100, 40 and impossible finishes', () => {
      const ok = CHECKOUT_TABLE[170] === 'T20 T20 Bull' && CHECKOUT_TABLE[100] === 'T20 D20' && CHECKOUT_TABLE[40] === 'D20';
      const none = IMPOSSIBLE_CHECKOUTS.every((v) => !CHECKOUT_TABLE[v] && !checkoutRoute(v, 'double', 3));
      let valid = true;
      for (let v = 2; v <= 170; v++) {
        const r = CHECKOUT_TABLE[v];
        if (IMPOSSIBLE_CHECKOUTS.includes(v)) continue;
        if (!r) { valid = 'missing ' + v; break; }
        const ds = r.split(' ').map(parseDartLabel);
        if (ds.reduce((a, d) => a + dartValue(d.s, d.m), 0) !== v || ds[ds.length - 1].m !== 2) { valid = 'bad ' + v; break; }
      }
      return (ok && none && valid === true) || (valid === true ? 'table entries wrong' : valid);
    });
    test('Impossible three-dart totals are rejected', () => [179, 178, 176, 175, 173, 172, 169, 166, 163].every((v) => !isPossibleTotal(v)) && isPossibleTotal(180) && isPossibleTotal(177) && !isPossibleTotal(181));
    test('Sector chart order: 0, 1-20, 25, D1-D20, D25, T1-T20', () => {
      const L = X01_SECTOR_LABELS;
      return (L.length === 63 && L[0] === '0' && L[1] === '1' && L[20] === '20' && L[21] === '25' && L[22] === 'D1' && L[41] === 'D20' && L[42] === 'D25' && L[43] === 'T1' && L[62] === 'T20') || L.join(',');
    });
    test('Board geometry maps to real sectors', () => {
      const t20 = landingDart(0, 103), d6 = landingDart(166, 0), bull = landingDart(0, 0), s3 = landingDart(0, -135), miss = landingDart(0, 180);
      return (t20.s === 20 && t20.m === 3 && d6.s === 6 && d6.m === 2 && bull.s === 25 && bull.m === 2 && s3.s === 3 && s3.m === 1 && miss.s === 0) || 'geometry';
    });
    test('Bots never return an illegal dart', () => {
      const rng = mulberry32(7);
      for (let skill = 1; skill <= 5; skill++) {
        for (let i = 0; i < 400; i++) {
          const d = throwAt(SCORING_AIMS[i % SCORING_AIMS.length], skill, rng);
          if (!validDart(d)) return 'illegal ' + JSON.stringify(d);
        }
      }
      for (const mode of ['x01', 'cricket']) {
        const S = mode === 'x01' ? HR({ points: 301 }) : { scoring: 'standard', numbers: CRICKET_DEFAULT, format: 'firstTo', sets: 1, legs: 1 };
        const m = mkMatch(S, [{ id: 'a', name: 'A', isBot: true, skill: 2 }, { id: 'b', name: 'B', isBot: true, skill: 5 }], mode);
        for (let i = 0; i < 3000; i++) {
          const rs = replayMatch(m);
          if (rs.winnerId) break;
          const e = botAction(m, rs, rng);
          if (e.t === 'd' && !validDart(e)) return 'illegal bot event';
          if (e.t === 'lock' && !canLockIn(m, rs)) return 'illegal lock';
          m.legs[m.legs.length - 1].events.push(e);
        }
        if (!replayMatch(m).winnerId) return mode + ' bot match did not finish';
      }
      return true;
    });
    const CS = (scoring) => ({ scoring, numbers: CRICKET_DEFAULT, format: 'firstTo', sets: 1, legs: 1 });
    test('Cricket: extra marks score while an opponent is open', () => {
      const r = replayCricketLeg(CS('standard'), P2, 0, ev('T20 T20'));
      return (r.marks[0][20] === 3 && r.points[0] === 60) || 'points ' + r.points[0];
    });
    test('Cricket: closed by everyone means dead, no points', () => {
      const r = replayCricketLeg(CS('standard'), P2, 0, ev('T20 M M T20 M M T20'));
      return (r.dead[20] && r.points[0] === 0 && r.points[1] === 0) || JSON.stringify(r.points);
    });
    test('Cricket Cut-Throat: points go to open opponents', () => {
      const r = replayCricketLeg(CS('cutthroat'), P3, 0, ev('T20 T20 M M M M T20 M M S20'));
      // A closes 20 and hits 3 more (60 to B and C). C closes 20, then A hits S20: only B is open.
      return (r.points[0] === 0 && r.points[1] === 80 && r.points[2] === 60) || JSON.stringify(r.points);
    });
    test('Cricket: closing everything while behind does not win', () => {
      const S = CS('standard');
      const e = 'M M M T20 T20 T20 T19 T18 T17 M M M T16 T15 Bull M M M 25 T20 M';
      const r = replayCricketLeg(S, P2, 0, ev(e));
      // B leads 120 to 0. A closes everything but trails, so play continues.
      if (r.winnerId || r.points[1] !== 120) return 'won while behind ' + JSON.stringify(r.points);
      const r2 = replayCricketLeg(S, P2, 0, ev(e + ' M M M T19 T19 T19'));
      return (r2.winnerId === 'a' && r2.points[0] === 171) || 'did not win after catching up ' + JSON.stringify(r2.points);
    });
    // House rule
    test('House rule: first bust is free and play continues', () => {
      const r = leg(HR({ points: 50 }), P2, 'T20');
      return (r.turns[0].busted && r.phase === 'normal' && r.busts[0] === 1 && r.seat === 1 && r.lockerId === null) || r.phase;
    });
    test('House rule: second bust reverts and auto-locks', () => {
      const r = leg(HR({ points: 50 }), P2, 'T20 S1 S1 S1 S5 T20');
      const t = r.turns[2];
      return (t.busted && t.autoLocked && r.rem[0] === 50 && r.lockerId === 'a' && r.lockedScore === 50 && r.phase === 'final' && r.seat === 1) || JSON.stringify({ p: r.phase, l: r.lockedScore, rem: r.rem });
    });
    test('House rule: Lock In gives every other player exactly one turn', () => {
      const r = leg(HR({ points: 301 }), P3, 'T20 L S1 S1 S1 S1 S1 S1');
      return (r.lockerId === 'a' && r.lockedScore === 241 && r.winnerId === 'a' && r.resultType === 'lowScore' && r.turns.filter((t) => t.isFinalTurn).length === 2) || JSON.stringify({ w: r.winnerId, rt: r.resultType, n: r.turns.length });
    });
    test('House rule: a lock on the last seat wraps to the first seat', () => {
      const r = leg(HR({ points: 301 }), P3, 'S1 S1 S1 S1 S1 S1 L');
      return (r.finalRoundOrder.join('') === 'ab' && r.seat === 0 && r.phase === 'final') || r.finalRoundOrder.join('');
    });
    test('House rule: locker wins ties', () => {
      const r = leg(HR({ points: 301 }), P2, 'T20 L T20 E');
      return (r.winnerId === 'a' && r.finalScores.b === 241) || r.winnerId;
    });
    test('House rule: strictly lower score wins', () => {
      const r = leg(HR({ points: 301 }), P2, 'T20 L T20 S1 E');
      return (r.winnerId === 'b' && r.resultType === 'lowScore') || r.winnerId;
    });
    test('House rule: tie between non-lockers goes to the earlier thrower', () => {
      const r = leg(HR({ points: 301 }), P3, 'S20 L T20 T20 E T20 T20 E');
      return (r.winnerId === 'b') || r.winnerId;
    });
    test('House rule: exact-zero checkout in the final round wins at once', () => {
      const r = leg(HR({ points: 40 }), P3, 'S10 L D20 S1');
      return (r.winnerId === 'b' && r.resultType === 'checkout' && r.turns.length === 2) || JSON.stringify({ w: r.winnerId, rt: r.resultType });
    });
    test('House rule: a final-turn bust keeps the reverted score', () => {
      const r = leg(HR({ points: 40 }), P2, 'S10 L S20 S20');
      return (r.finalScores.b === 40 && r.winnerId === 'a' && r.turns[1].busted && r.turns[1].isFinalTurn) || JSON.stringify(r.finalScores);
    });
    test('House rule: low-score wins count as legs won, not checkouts', () => {
      const m = mkMatch(HR({ points: 301 }), P2);
      m.legs[0].events = ev('T20 L S1');
      m.legs[0].events.push({ t: 'end' });
      replayMatch(m); m.status = 'finished'; m.endedAt = Date.now();
      const s = statsX01([m], { range: 'all' });
      const a = s.rows.find((r) => r.id === 'a');
      return (a.legsWon === 1 && a.wins === 1 && a.maxCheckout === 0 && a.minDarts === 0 && a.checkouts === 0 && a.locks === 1 && s.hasHouse) || JSON.stringify(a);
    });
    test('House rule: Undo across a lock restores normal play', () => {
      const m = mkMatch(HR({ points: 301 }), P2);
      m.legs[0].events = ev('T20 L');
      const before = replayMatch(m).live.phase;
      undoLast(m);
      const rs = replayMatch(m);
      return (before === 'final' && rs.live.phase === 'normal' && rs.live.lockerSeat === null && rs.live.seat === 0 && rs.live.current.darts.length === 1) || rs.live.phase;
    });
    test('House rule: Undo of an auto-lock bust restores the bust counter', () => {
      const m = mkMatch(HR({ points: 50 }), P2);
      m.legs[0].events = ev('T20 S1 S1 S1 T20');
      const a = replayMatch(m).live;
      undoLast(m);
      const b = replayMatch(m).live;
      return (a.phase === 'final' && b.phase === 'normal' && b.busts[0] === 1 && b.seat === 0) || JSON.stringify({ a: a.phase, b: b.phase, busts: b.busts });
    });
    test('House rule: Lock In hidden in Cricket and during final turns', () => {
      const x = mkMatch(HR({ points: 301 }), P2);
      x.legs[0].events = ev('T20 L');
      const c = mkMatch(Object.assign(CS('standard'), { houseRule: { oneBustLowScore: true, bustAllowance: 1 } }), P2, 'cricket');
      const y = mkMatch(HR({ points: 301 }), P2);
      return (!canLockIn(x, replayMatch(x)) && isFinalTurn(x, replayMatch(x)) && !canLockIn(c, replayMatch(c)) && canLockIn(y, replayMatch(y))) || 'lock visibility wrong';
    });
    test('Event encoding round-trips', () => {
      const e = [D('T20'), D('M'), D('Bull'), D('25'), { t: 'tot', v: 99, n: 2 }, { t: 'end' }, { t: 'lock' }];
      return JSON.stringify(e.map(encodeEvent).map(decodeEvent)) === JSON.stringify(e) || e.map(encodeEvent).map(decodeEvent);
    });
    return results;
  }

  return {
    APP_VERSION, BOARD_ORDER, RINGS, X01_POINTS, IMPOSSIBLE_CHECKOUTS, SKILL_NAMES, SKILL_TARGET_AVG, SKILL_SIGMA, CRICKET_DEFAULT,
    dartValue, validDart, dartLabel, parseDartLabel, isPossibleTotal, neededWins, searchRoute, routeString, checkoutRoute, CHECKOUT_TABLE,
    X01_SECTOR_LABELS, sectorKey, replayMatch, replayX01Leg, replayCricketLeg, undoLast, canLockIn, isFinalTurn, finalTarget,
    mulberry32, landingDart, throwAt, chooseX01Aim, botAction, SCORING_AIMS,
    statsX01, statsCricket, matchPlayerTotals, safeDiv, pct, encodeEvent, decodeEvent, runSelfTests, DERIVED_LEG_KEYS,
  };
})();
if (typeof module !== 'undefined') module.exports = DL;
