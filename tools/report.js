// Build detailed match records from an app export (Settings > Export all data).
// Usage: node tools/report.js <export.json> [outDir=data] [timeZone=America/New_York]
// Replays every match with src/logic.js, so the numbers match the app exactly.
const fs = require('fs');
const path = require('path');
const DL = require('../src/logic.js');

const [file, outDir = 'data', tz = 'America/New_York'] = process.argv.slice(2);
if (!file) { console.error('Usage: node tools/report.js <export.json> [outDir] [timeZone]'); process.exit(1); }
const exp = JSON.parse(fs.readFileSync(file, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

const OUT = { straight: 'Straight Out', double: 'Double Out', master: 'Master Out' };
const IN = { straight: 'Straight In', double: 'Double In', master: 'Master In' };
const when = (t) => (t ? new Date(t).toLocaleString('en-US', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }) : '');
const iso = (t) => (t ? new Date(t).toISOString() : '');
const f2 = (n) => (Number.isFinite(n) ? n.toFixed(2) : '');
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const writeCsv = (name, head, rows) => fs.writeFileSync(path.join(outDir, name), [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n');

// Hydrate raw events and replay.
const matches = exp.matches.map((m) => {
  const mm = { id: m.id, createdAt: m.createdAt, updatedAt: m.updatedAt, endedAt: m.endedAt, status: m.status, mode: m.mode,
    settings: m.settings, players: m.players, legs: m.legs.map((l) => ({ events: (l.e || l.events || []).map(DL.decodeEvent).filter(Boolean) })) };
  mm._rs = DL.replayMatch(mm);
  return mm;
}).sort((a, b) => a.createdAt - b.createdAt);

const summary = (m) => {
  const S = m.settings;
  const fmt = S.sets > 1 ? `${S.format === 'bestOf' ? 'Best of' : 'First to'} ${S.sets} sets` + (S.legs > 1 ? `, ${S.legs} legs each` : '') : `${S.format === 'bestOf' ? 'Best of' : 'First to'} ${S.legs} legs`;
  return m.mode === 'cricket' ? `Cricket ${S.scoring}, ${fmt}` : `${S.points}, ${S.checkIn !== 'straight' ? IN[S.checkIn] + ', ' : ''}${OUT[S.checkOut]}, ${fmt}`;
};
const house = (m) => !!(m.settings.houseRule && m.settings.houseRule.oneBustLowScore);
const pname = (m, id) => (m.players.find((p) => p.id === id) || {}).name || '';
const scoreLine = (m) => { const src = m.settings.sets > 1 ? m._rs.setsWon : m._rs.legsWonTotal; return m.players.map((p) => `${p.name} ${src[p.id]}`).join(', ') + (m.settings.sets > 1 ? ' sets' : ' legs'); };
const statsFor = (ms) => DL.statsX01(ms, { range: 'all', includeUnfinished: true, order: exp.players.map((p) => p.id) });
const topSectors = (r) => r.sectors.map((c, i) => [DL.X01_SECTOR_LABELS[i] === '0' ? 'Miss' : DL.X01_SECTOR_LABELS[i], c]).filter((x) => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 6).map((x) => `${x[0]} x${x[1]}`).join(', ');

// Sheet-format tabs (same columns as apps-script/Code.gs).
writeCsv('sheet-matches.csv', ['Match ID', 'Finished', 'Uploaded', 'Mode', 'Settings', 'House rule', 'Players', 'Winner', 'Score', 'Device', 'App version', 'Match data (JSON)'],
  matches.map((m) => [m.id, when(m.endedAt), '', m.mode === 'cricket' ? 'Cricket' : 'X01', summary(m), house(m) ? 'One Bust, Low Score' : '',
    m.players.map((p) => p.name).join(', '), pname(m, m._rs.winnerId), scoreLine(m), 'imported from export', exp.version || '',
    JSON.stringify({ id: m.id, settings: m.settings, players: m.players, legs: m.legs.map((l) => ({ e: l.events.map(DL.encodeEvent) })) })]));
const resultHead = ['Match ID', 'Finished', 'Mode', 'Player', 'Computer', 'Skill', 'Won match', 'Sets won', 'Legs won', 'Darts', '3-dart avg', 'First-9 avg', 'Max score', '180s', 'Max checkout', 'Checkout %', 'Busts', 'Locks', 'MPR', 'Marks', 'Points'];
const resultRows = [];
for (const m of matches) {
  for (const r of statsFor([m]).rows) {
    const p = m.players.find((x) => x.id === r.id);
    resultRows.push([m.id, when(m.endedAt), 'X01', r.name, p.isBot ? 'Yes' : '', p.skill || '', m._rs.winnerId === r.id ? 'Yes' : '', m._rs.setsWon[r.id], r.legsWon, r.darts,
      f2(r.avg), f2(r.first9), r.maxScore, r.b180, r.maxCheckout, f2(r.checkoutPct), r.busts, r.locks, '', '', '']);
  }
}
writeCsv('sheet-player-results.csv', resultHead, resultRows);

// Full per-player detail.
const detailHead = ['Match ID', 'Started', 'Finished', 'Player', 'Won match', 'Sets won', 'Legs', 'Legs won', 'Darts', 'Darts per leg', 'Points', '3-dart avg', 'First-9 avg',
  'Max score', '60-99', '100-139', '140-179', '180', 'Doubles hit', 'Double %', 'Triples hit', 'Triple %', 'Checkouts', 'Darts at a finish', 'Checkout %', 'Max checkout', 'Min darts (won leg)',
  'Busts', 'Locks', 'Auto-locks', 'Final-round wins', 'Final-round attempts', 'Most hit sectors'];
const detail = (m, r) => [m ? m.id : 'ALL MATCHES', m ? when(m.createdAt) : '', m ? when(m.endedAt) : '', r.name, m ? (m._rs.winnerId === r.id ? 'Yes' : '') : r.wins + ' of ' + r.games,
  m ? m._rs.setsWon[r.id] : '', r.legs, r.legsWon, r.darts, f2(r.dartsPerLeg), r.points, f2(r.avg), f2(r.first9), r.maxScore, r.b60, r.b100, r.b140, r.b180,
  r.doubles, f2(r.doublePct), r.triples, f2(r.triplePct), r.checkouts, r.attempts, f2(r.checkoutPct), r.maxCheckout, r.minDarts || '',
  r.busts, r.locks, r.autoLocks, r.finalWins, r.finalAttempts, topSectors(r)];
const detailRows = [];
for (const m of matches) for (const r of statsFor([m]).rows) detailRows.push(detail(m, r));
const totals = statsFor(matches).rows;
for (const r of totals) detailRows.push(detail(null, r));
writeCsv('player-stats.csv', detailHead, detailRows);

// Legs and turns.
const legRows = [], turnRows = [];
for (const m of matches) {
  m.legs.forEach((leg, li) => {
    if (!leg.turns || !leg.turns.length) return;
    const per = (id) => { const ts = leg.turns.filter((t) => t.pid === id); const d = ts.reduce((a, t) => a + t.darts.length, 0), s = ts.reduce((a, t) => a + t.score, 0); return { d, s, avg: DL.safeDiv(s, d) * 3 }; };
    const last = leg.turns[leg.turns.length - 1];
    const result = leg.resultType === 'checkout' ? `Checkout ${last.start}` : leg.resultType === 'lowScore' ? `Low score (${leg.finalScores[leg.winnerId]} left)` : 'Unfinished';
    const lockTurn = leg.turns.find((t) => t.lockedThisTurn || t.autoLocked);
    legRows.push([m.id, leg.setNo, leg.legNo, pname(m, leg.starterId), pname(m, leg.winnerId), result,
      leg.lockerId ? `${pname(m, leg.lockerId)} ${lockTurn && lockTurn.autoLocked ? 'auto-locked' : 'locked'} at ${leg.lockedScore}` : '',
      ...m.players.flatMap((p) => { const x = per(p.id); return [leg.finalScores[p.id], x.d, f2(x.avg), leg.bustCounts ? leg.bustCounts[p.id] : '']; })]);
    leg.turns.forEach((t, ti) => {
      const flags = [t.busted && 'BUST', t.lockedThisTurn && 'LOCK IN', t.autoLocked && 'AUTO-LOCK', t.isFinalTurn && 'FINAL TURN', t.endedEarly && !t.lockedThisTurn && 'ended early', t.checkout && 'CHECKOUT'].filter(Boolean).join(' ');
      turnRows.push([m.id, leg.setNo, leg.legNo, ti + 1, pname(m, t.pid), t.darts.map(DL.dartLabel).join(' '), t.darts.length, t.start, t.score, t.end, flags]);
    });
  });
}
const p0 = matches[0] ? matches[0].players : [];
writeCsv('legs.csv', ['Match ID', 'Set', 'Leg', 'Started', 'Winner', 'Result', 'Lock', ...p0.flatMap((p) => [`${p.name} left`, `${p.name} darts`, `${p.name} leg avg`, `${p.name} busts`])], legRows);
writeCsv('turns.csv', ['Match ID', 'Set', 'Leg', 'Turn', 'Player', 'Darts', 'Darts thrown', 'Start', 'Scored', 'Left', 'Notes'], turnRows);

// Importable backup (compact raw events, Settings > Import accepts it).
fs.writeFileSync(path.join(outDir, 'backup.json'), JSON.stringify({ app: 'Dart Scoreboard', version: exp.version, exportedAt: exp.exportedAt, players: exp.players,
  home: exp.home, settings: exp.settings, matches: exp.matches.map((m) => ({ id: m.id, createdAt: m.createdAt, updatedAt: m.updatedAt, endedAt: m.endedAt, status: m.status,
    mode: m.mode, settings: m.settings, players: m.players, winnerId: m.winnerId, legs: m.legs.map((l) => ({ e: l.e })) })) }, null, 1) + '\n');

// Readable report.
let md = `# Match report\n\nFrom the app export of ${when(Date.parse(exp.exportedAt))} (times ${tz}). Rebuilt dart by dart with the app's own scoring code.\n`;
const table = (rows) => {
  const cols = ['Player', 'Result', 'Legs won', 'Darts', '3-dart avg', 'First-9', 'Max', '60+', '100+', 'Double %', 'Triple %', 'Checkout %', 'Best out', 'Busts', 'Locks', 'Auto-locks'];
  return `| ${cols.join(' | ')} |\n|${cols.map(() => '---').join('|')}|\n` + rows.map((x) => `| ${x.join(' | ')} |`).join('\n') + '\n';
};
const rowFor = (m, r) => [r.name, m ? (m._rs.winnerId === r.id ? 'Won' : 'Lost') : `${r.wins}-${r.games - r.wins}`, r.legsWon, r.darts, f2(r.avg), f2(r.first9), r.maxScore,
  r.b60, r.b100 + r.b140 + r.b180, f2(r.doublePct) + '%', f2(r.triplePct) + '%', f2(r.checkoutPct) + '%', r.maxCheckout || '-', r.busts, r.locks, r.autoLocks];
md += `\n## Both matches combined\n\n${table(totals.map((r) => rowFor(null, r)))}`;
matches.forEach((m, i) => {
  md += `\n## Match ${i + 1}: ${when(m.createdAt)} to ${when(m.endedAt).split(', ').pop()}\n\n${summary(m)}${house(m) ? ', One Bust, Low Score (1 free bust)' : ''}. **${pname(m, m._rs.winnerId)} won**, ${scoreLine(m)}.\n\n`;
  md += table(statsFor([m]).rows.map((r) => rowFor(m, r)));
  md += '\n| Set | Started | Winner | Result | Lock | ' + m.players.map((p) => `${p.name} (left, darts, avg, busts)`).join(' | ') + ' |\n|---|---|---|---|---|' + m.players.map(() => '---').join('|') + '|\n';
  legRows.filter((r) => r[0] === m.id).forEach((r) => {
    const per = m.players.map((_, k) => `${r[7 + k * 4]} left, ${r[8 + k * 4]} darts, ${r[9 + k * 4]}, ${r[10 + k * 4]} busts`);
    md += `| ${r[1]} | ${r[3]} | ${r[4]} | ${r[5]} | ${r[6] || '-'} | ${per.join(' | ')} |\n`;
  });
  const rs = statsFor([m]).rows;
  md += '\nMost hit sectors: ' + rs.map((r) => `${r.name}: ${topSectors(r)}`).join('. ') + '.\n';
});
md += `\nFiles: \`player-stats.csv\` (every stat per player per match, plus totals), \`legs.csv\`, \`turns.csv\` (every turn and dart), \`sheet-matches.csv\` and \`sheet-player-results.csv\` (paste into the Google Sheet tabs), \`backup.json\` (import in the app under Settings > Import).\n`;
fs.writeFileSync(path.join(outDir, 'REPORT.md'), md);
console.log(md);
