# Set up result uploads (one time, about 5 minutes)

Finished games upload to a Google Sheet you own. Easiest on a computer.

1. Create a new Google Sheet (sheets.new) and name it, for example, **Dart Scoreboard Results**.
2. In the sheet: **Extensions > Apps Script**.
3. Delete what is in the editor, paste the whole contents of `apps-script/Code.gs`, and click **Save**.
4. Click **Deploy > New deployment**. Click the gear next to "Select type" and choose **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Click **Deploy**, then **Authorize access** and allow it with your Google account.
   Google may warn that the app is unverified: click **Advanced**, then **Go to (project name)**.
6. Copy the **Web app URL** (it ends in `/exec`).
7. Put it in `src/ui.js` as `UPLOAD_URL`, run `python3 tools/build.py`, bump `CACHE` in `sw.js`, and push.

The sheet gets two tabs on the first upload: **Matches** (one row per match, with the full
match data) and **Player results** (one row per player per match, ready for charts and pivots).

If you change `Code.gs` later, use **Deploy > Manage deployments > Edit > New version**
so the URL stays the same.
