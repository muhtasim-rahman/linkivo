# Linkivo v2: Setup guide for the owner

Step-by-step actions only the owner can do. Console menus change over time: if a name below does not match what you see, look for the closest one and tell the AI.
**Golden rule:** never paste secrets (service-account JSON, `PIN_PEPPER`, tokens) into a chat, a file in this repo or a commit. They go only into the Cloudflare or Firebase consoles.

## A. Every version: extract, test, deploy

1. Extract the AI's zip into the project root (next to `.git`, `@ Versions`, `@ Extra files`). It contains the `@ Creator` folder too. Delete the files listed under "Removed files".
2. Test locally if you can (any static server on the project root, for example `npx serve .`), or deploy and test on the live URL.
3. Deploy hosting: `firebase deploy --only hosting`. If the version changed rules: `firebase deploy --only database`.
4. Commit with the text from `@ Creator/commits/vX.Y.Z-commit.txt`. Save the version zip into `@ Versions`.
5. After deploying, hard-reload the site once; the new service worker then keeps the app current on its own.

## B. Firebase (first needed in v2.1.0)

1. **Reset the database.** Console > Build > Realtime Database > Data: delete the root node's data (no user data exists, v1 data is not used). Keep the same database instance (`linkivo-default-rtdb`).
2. **Rules.** (The rules file path contains a space and `@`: if `firebase deploy --only database` rejects it, tell the AI, there is a documented fallback in ARCHITECTURE section 12.) Deploy `@ Creator/rules/database.rules.json` with `firebase deploy --only database` (the path is set in `firebase.json`). You can also paste the file into Realtime Database > Rules. Use the Rules Playground to run the cases in `@ Creator/tests/rules-matrix.md`.
3. **Authentication.** Build > Authentication > Sign-in method: Google and Email/Password enabled. Settings > Authorized domains: add `linkivo.web.app`, `linkivo.firebaseapp.com`, and `localhost` for local testing (plus any custom domain).
4. **Google redirect URI.** If the AI tells you to switch `authDomain` to the hosting domain (for reliable sign-in on mobile), add `https://linkivo.web.app/__/auth/handler` to the authorized redirect URIs of the OAuth web client in Google Cloud Console > APIs and Services > Credentials.
5. **Restrict the API key.** Google Cloud Console > APIs and Services > Credentials > the browser API key: Application restrictions = Websites; add `https://linkivo.web.app/*`, `https://linkivo.firebaseapp.com/*`, `http://localhost/*`. The key is public by design; this limits abuse.
6. Optional later: App Check (reCAPTCHA v3) for extra abuse protection.

## C. Cloudflare Worker (first needed in v2.1.0)

1. Cloudflare dashboard > Workers & Pages > `linkivo` > Edit code. Replace everything with the content of `@ Creator/worker/worker.js`, then Deploy.
2. Open `https://linkivo.programs-turzo.workers.dev/health`: it must return the Worker version (2.2.2 from v2.2.2; it adds `/whoami`, which gives the approximate place of a device in Account > Logged-in devices. Older Workers still work, the place is just empty).
3. Redeploy the same way whenever a version changes `worker.js` (the AI tells you).
4. Cron triggers (v2.5.0): Worker > Settings > Triggers > Cron Triggers: add what the AI specifies (for example `* * * * *` for background jobs and `0 3 * * *` for the daily purge).
5. Free plan limits (CPU time, subrequests, requests per day) can return errors under heavy use. If you see Worker errors, tell the AI the message and the time.

## D. Secrets (first needed in v2.5.0)

Where: Cloudflare > Workers & Pages > `linkivo` > Settings > Variables and Secrets > Add > type **Secret**.

1. **`PIN_PEPPER`**: a long random string only the Worker knows. Generate one on your computer: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`, copy the output into the secret value. Never change it later unless you accept that all PINs must be reset.
2. **`FIREBASE_SERVICE_ACCOUNT`**: the service-account JSON (next section).

### Getting the service account JSON
1. Firebase console > Project settings (gear icon) > **Service accounts** tab.
2. Click **Generate new private key** and confirm. A `.json` file downloads. This file is a master key to your project.
3. Open it in a text editor, select everything and copy it.
4. Paste it as the value of the Cloudflare secret `FIREBASE_SERVICE_ACCOUNT` and save/deploy.
5. Delete the downloaded file from your computer (and Downloads/trash) once the secret works. Do not email it, upload it, or put it in the project folder (`.gitignore` blocks `serviceAccount*.json` as a safety net).
6. If it ever leaks: Firebase/Google Cloud console > Service accounts > delete that key and generate a new one, then update the secret.

## E. If something fails

- Blank page after deploying: open the browser console (F12), copy the first red error and tell the AI. Check that `index.html` is the new one and hard-reload (Ctrl+Shift+R).
- "Permission denied" from the database: the rules deployed may not match the version; run `firebase deploy --only database` again and re-check.
- Worker CORS error: the page origin is not in the allow-list; tell the AI your exact URL.

## F. Deploy checklist (written for v2.1.0, valid for v2.1.2; the Worker code and the app both changed in v2.1.2)

1. **Database rules first.** Realtime Database > Data: delete the old data (nothing from v1 is used). Then `firebase deploy --only database`. If the CLI rejects the path `@ Creator/rules/database.rules.json`, tell the AI (fallback: ARCHITECTURE section 12, item 8). Then run the five Playground checks at the end of `@ Creator/tests/rules-matrix.md`.
2. **Worker.** Paste `@ Creator/worker/worker.js` (whole file) into Workers & Pages > `linkivo` > Edit code > Deploy. Open `https://linkivo.programs-turzo.workers.dev/health`: expect `{"ok":true,"version":"2.1.2",...}`. No secrets are needed yet.
3. **Authentication.** Authorized domains must include `linkivo.web.app`, `linkivo.firebaseapp.com`, `localhost`.
4. **Hosting.** `firebase deploy --only hosting`, then hard-reload (Ctrl+Shift+R). The old v1 or v2.0 service worker is replaced by the new one; the page reloads once by itself.
5. **First sign-in check.** If the app shows "Sign-in could not load", open the browser console (F12): the first red line tells whether the Firebase SDK URL (`https://www.gstatic.com/firebasejs/12.19.0/...`) failed. Send that line to the AI.
6. **Metadata check.** Settings > Advanced > Metadata tester > Load 25 sample URLs > Run test. Send the AI the summary line and any URL that failed unexpectedly (the last two sample URLs, localhost and 169.254.169.254, MUST fail with "blocked target").

## G. Email links on Linkivo's own page (optional, v2.2.2; skipped by the owner for now, the console refuses the address)
Firebase Console > Authentication > Templates > (Password reset) > edit > Customize action URL: `https://linkivo.web.app/auth/action`. Save. The app already has the page.
If the console answers "An error occurred updating action URL", check Authentication > Settings > Authorized domains (it must list `linkivo.web.app`) and type the address exactly; if it still fails, contact Firebase Support (the cause is not known). Nothing breaks without this step: Firebase's own page is used. A fully branded email arrives with v2.5.0 (Worker sends it).


## H. v2.3.0 deploy steps (owner)
1. Extract the zip into the project folder (delete nothing; no files were removed).
2. `firebase deploy --only database` (the rules gained one field, `linkMeta/<uid>/<id>/nf`) and `firebase deploy --only hosting`.
3. Cloudflare dashboard > Workers & Pages > your Worker > Edit code: replace everything with `@ Creator/worker/worker.js` (Worker 2.3.0 adds `POST /check`), then Deploy. Open `<worker-url>/health`: it must show `"version":"2.3.0"`. Without this step Preview and Search work, but "Check links" shows "The Cloudflare Worker is out of date".
4. Hard reload the app once (Ctrl+Shift+R) so the new service worker takes over. On Android, open the installed app once; the Share sheet lists Linkivo after the manifest refreshes (this can take a few minutes or a reinstall).
