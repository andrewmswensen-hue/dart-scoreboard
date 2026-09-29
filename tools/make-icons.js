const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const b = await chromium.launch(); const svg = require('fs').readFileSync(__dirname + '/../src/icon.svg','utf8');
  for (const s of [180,192,512]) { const p = await b.newPage({ viewport:{width:s,height:s} });
    await p.setContent(`<html><body style="margin:0">${svg.replace('width="512" height="512"', `width="${s}" height="${s}"`)}</body></html>`);
    await p.screenshot({ path: __dirname + `/../icon-${s}.png`, omitBackground: false }); }
  await b.close(); })();
