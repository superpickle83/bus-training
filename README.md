# Bus Counselor Training (Deerkill Day Camp)

Static site (GitHub Pages) + Google Apps Script API bound to the `BusCounselorTraining` spreadsheet.
Separate from Bus Comms: never calls `buses.deerkilldaycamp.com`, Twilio, or any live endpoint.
**This repo is public — no staff emails, phone numbers, keys or tokens, ever.** `scripts/secret-scan.js` runs as a pre-push hook.

## Layout
- `index.html`, `config.js` — site shell (all URLs relative: works at `/bus-training/` and at a subdomain root)
- `apps-script/` — `Roster.gs` (Stage 1: links + "Training" menu), `Api.gs` (Stage 2: sign-in), `appsscript.json`
- `test/logic.test.js` — offline tests for the Stage 1/2 logic (`node test/logic.test.js`)
- `scripts/secret-scan.js`, `scripts/install-hooks.sh`

## Apps Script setup (one time)
1. In the spreadsheet: Extensions → Apps Script. Copy in `Roster.gs`, `Api.gs`, and `appsscript.json` (Project Settings → show manifest).
2. Project Settings → Script Properties: `SITE_BASE` = `https://superpickle83.github.io/bus-training/` (switch to `https://training.deerkilldaycamp.com/` only once DNS works, then run **Training → Rebuild all links for the current address**).
3. Deploy → New deployment → Web app → Execute as **me**, access **Anyone**. Paste the `/exec` URL into `config.js` (`TRAIN_API`).
4. **Updating later:** Deploy → Manage deployments → edit THAT deployment → Version: New version. Never "New deployment" (it creates a different URL and orphans the site).
5. Reload the spreadsheet; use the **Training** menu.

## Custom domain (not yet)
Do not add a `CNAME` file or set the custom domain in Pages settings until `training.deerkilldaycamp.com` resolves to GitHub.
