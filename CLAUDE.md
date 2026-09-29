# Dart Scoreboard

## What this is
A single-page darts scoreboard (X01 and Cricket) that installs to a phone home screen.
Everything is saved in the visitor's browser (localStorage). Each finished match is also
uploaded to the owner's Google Sheet through a Google Apps Script web app.

## Where it lives
- **Live site:** https://andrewmswensen-hue.github.io/dart-scoreboard/
- **GitHub repo:** https://github.com/andrewmswensen-hue/dart-scoreboard (public)
- **Private Claude link:** https://claude.ai/artifact/5u7ZFCV87tLQTu1bvEKhKh

GitHub Pages serves the `main` branch root. Pushing to `main` updates the live site,
usually within a minute.

## Files
- `index.html`: the built app. Do not edit it by hand; edit `src/` and rebuild.
- `src/logic.js`: pure game logic (X01, Cricket, house rule, bots, statistics, self-tests).
  No DOM access. Match state is replayed from raw events, so undo and edit just replay.
- `src/ui.js`: rendering, input, storage, sheets, bots loop.
- `src/style.css`, `src/shell.html`: styles and the page skeleton.
- `src/icon.svg`: app icon source.
- `manifest.webmanifest`, `icon-*.png`, `sw.js`: home screen install and offline support.
- `tools/build.py`: builds `index.html` from `src/`.
- `tools/make-icons.js`: renders the PNG icons from `src/icon.svg` (needs Playwright).
- `apps-script/Code.gs`, `apps-script/SETUP.md`: the Google Sheet upload endpoint and how to deploy it.

## Result uploads
- `UPLOAD_URL` near the top of the upload section in `src/ui.js` holds the Apps Script web app URL.
  Empty means uploads are off.
- Every finished match is queued in `store.uploads` and sent as a text/plain POST (no CORS
  preflight). Offline uploads stay queued and retry on launch, on `online`, and when the app
  comes back to the foreground. An edited finished match is re-uploaded; the script replaces its rows.
- Players can opt out in Settings ("Share finished games"). Uploads never run in the Claude artifact.
- The sheet has two tabs: **Matches** and **Player results**. Player text is escaped so it
  cannot run as a formula.

## To change the app
1. Edit files in `src/`.
2. `python3 tools/build.py`
3. Check the logic: `node -e "const r=require('./src/logic.js').runSelfTests(); console.log(r.filter(x=>x.pass).length+'/'+r.length)"`
4. Bump `CACHE` in `sw.js` so installed copies pick up the change.
5. `git add -A && git commit -m "..." && git push`

## Rules and conventions
- No em dashes anywhere in UI text or comments.
- The phone app uses a black-translucent status bar with safe-area padding plus a small
  extra buffer (see `--safe-t` / `--safe-b` in `src/style.css`) so nothing sits under
  the camera notch or the home indicator.
- The same page is also published as a Claude artifact. The artifact build is the page
  without `<html>`/`<head>`; `tools/build.py` writes both.

## Matches recorded before uploads
`data/manual-matches.csv` and `data/manual-player-results.csv` hold two matches from
2026-09-29 that were played before uploads were connected. Once the Google Sheet is set up,
paste these rows into its `Matches` and `Player results` tabs.
