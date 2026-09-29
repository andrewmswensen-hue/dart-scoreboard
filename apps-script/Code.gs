/**
 * Dart Scoreboard upload endpoint.
 * Paste into Extensions > Apps Script of the Google Sheet that should collect results,
 * then Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
 *
 * Each finished match is one row in "Matches" and one row per player in "Player results".
 * A re-upload of the same match (for example after an edited turn) replaces its rows.
 */
const MATCHES = 'Matches';
const RESULTS = 'Player results';
const MATCH_HEAD = ['Match ID', 'Finished', 'Uploaded', 'Mode', 'Settings', 'House rule', 'Players', 'Winner', 'Score', 'Device', 'App version', 'Match data (JSON)'];
const RESULT_HEAD = ['Match ID', 'Finished', 'Mode', 'Player', 'Computer', 'Skill', 'Won match', 'Sets won', 'Legs won', 'Darts',
  '3-dart avg', 'First-9 avg', 'Max score', '180s', 'Max checkout', 'Checkout %', 'Busts', 'Locks', 'MPR', 'Marks', 'Points'];
const MAX_BODY = 300000;

function doPost(e) {
  if (!e || !e.postData || !e.postData.contents || e.postData.contents.length > MAX_BODY) return reply({ ok: false, error: 'bad request' });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const data = JSON.parse(e.postData.contents);
    const m = data && data.match;
    if (!m || !m.id || !Array.isArray(m.players) || !Array.isArray(data.results)) return reply({ ok: false, error: 'bad payload' });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ms = sheet(ss, MATCHES, MATCH_HEAD);
    const rs = sheet(ss, RESULTS, RESULT_HEAD);
    const id = safe(m.id);
    removeRows(ms, id);
    removeRows(rs, id);
    const finished = m.endedAt ? new Date(m.endedAt) : new Date();
    let json = JSON.stringify(m);
    if (json.length > 49000) json = 'Too large to store in one cell';
    ms.appendRow([id, finished, new Date(), m.mode === 'cricket' ? 'Cricket' : 'X01', safe(m.summary), m.houseRule ? 'One Bust, Low Score' : '',
      safe(m.players.map((p) => p.name).join(', ')), safe(m.winnerName), safe(m.score), safe(data.deviceId), safe(data.app), json]);
    const rows = data.results.map((r) => [id, finished, m.mode === 'cricket' ? 'Cricket' : 'X01', safe(r.name), r.isBot ? 'Yes' : '', num(r.skill),
      r.won ? 'Yes' : '', num(r.setsWon), num(r.legsWon), num(r.darts), num(r.avg), num(r.first9), num(r.maxScore), num(r.n180),
      num(r.maxCheckout), num(r.checkoutPct), num(r.busts), num(r.locks), num(r.mpr), num(r.marks), num(r.points)]);
    if (rows.length) rs.getRange(rs.getLastRow() + 1, 1, rows.length, RESULT_HEAD.length).setValues(rows);
    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return reply({ ok: true, app: 'Dart Scoreboard upload endpoint' });
}

function sheet(ss, name, head) {
  let s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

function removeRows(s, id) {
  const last = s.getLastRow();
  if (last < 2) return;
  const ids = s.getRange(2, 1, last - 1, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === id) s.deleteRow(i + 2);
}

// Text typed by players must never run as a formula.
function safe(v) {
  const t = v == null ? '' : String(v).slice(0, 500);
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}
function num(v) { return typeof v === 'number' && isFinite(v) ? v : ''; }
function reply(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
