# OTO (Refresh + Gmail Watcher)

Minimal Electron control app that:

- opens and monitors a real Google Chrome window with a persistent Chrome profile
- refreshes on demand or on an interval and alerts when page text is found or missing
- watches Gmail through the Gmail API for matching sender + subject rules and reuses the same alert / Google Voice flow

## Why this uses real Chrome

- The site opens in actual Google Chrome, not an Electron webview.
- That avoids the Electron WebView/WebAuthn/passkey issues you called out.
- The app launches Chrome with a dedicated persistent profile under the app data folder, so cookies, login state, Chrome sign-in, and site sessions stay tied to the same Chrome profile across runs.
- The monitor talks to that Chrome tab over Chrome DevTools Protocol to refresh it and inspect page text without clicking anything.

## Run

```bash
npm install
npm start
```

## Build Windows `.exe` (OTO.exe)

On Windows:

```bash
npm install
npm run dist:win
```

The output will be in `dist/` (portable build named `OTO.exe`).

If you push this repo to GitHub, you can also run the `Build Windows EXE` workflow (Actions tab) and download `OTO.exe` from the workflow run artifacts.

## Build macOS `.dmg`

```bash
npm install
npm run dist:mac
```

The output will be in `dist/` (DMG named `OTO.dmg`).

## Use

### Chrome Watcher

1. Enter the target URL and click `Go`.
2. A real Google Chrome window opens using this app's dedicated profile.
3. Log into the site inside that Chrome window. If you want, you can also sign into Chrome itself in that profile.
4. Enter the text you want to watch, such as `accept` or `no vto opportunity`.
5. Choose whether to notify when that text is `found` or `missing`.
6. Set the refresh interval and click `Start Auto Refresh`, or use `Refresh` manually.
7. Optional: turn on case-sensitive search if the exact casing matters.
8. Optional: fill in the SMTP fields if you want Nodemailer email alerts.
9. Optional: fill in the Discord webhook URL and set how many times to repeat each Discord alert and how many seconds to wait between sends.
10. Optional: fill in the `Google Voice number` field if you want each alert to open a Google Voice call tab in the same managed Chrome profile with that number prefilled.

### Gmail Watcher

1. Open the `Gmail Watcher` tab.
2. Create a Google Cloud OAuth client for a desktop app and enable the Gmail API.
3. Paste the OAuth `client ID` and `client secret` into the Gmail OAuth settings panel.
4. Fill in the sender and/or subject rule plus the check interval.
5. Click `Sign In`.
6. On Windows, Google consent opens in your default browser because Google blocks embedded Electron sign-in windows there.
7. After approval, Google redirects back to OTO through a local loopback callback.
8. Click `Start`.
9. When a matching email is found, OTO triggers the same downstream alert flow already used by the Chrome watcher, including the optional Google Voice call tab.

## Notes

- Clicking `Go` collapses the control panel into a thin bar so the controller stays out of the way.
- Page text checks run about one second after each Chrome page load finishes.
- Text matching checks both the rendered page text and a raw text fallback so it behaves closer to a browser `Ctrl+F` search without clicking anything.
- Alerts only fire when the watched condition becomes true after previously being false. This avoids alert spam if the page keeps refreshing while the same condition stays true.
- Gmail watcher uses OAuth with `gmail.readonly` plus email identity access so it can show the connected account and refresh tokens automatically in the background.
- Gmail watcher matching uses the Gmail API search query first, then validates `From` and `Subject` again in app logic before triggering.
- Gmail watcher dedupes per watcher session by Gmail message ID unless `Allow repeated alerts for same email` is enabled.
- `Mark as processed after match` stores the Gmail message ID in the app's local processed cache so it does not trigger again on later runs.
- Settings, including SMTP and Discord fields, auto-save shortly after you edit them.
- Google Voice alerts open `https://voice.google.com/u/0/calls?...` in a new tab in the same Chrome profile, wait about one second, then send `Tab` five times and `Space` to trigger the call UI. Sign into Google Voice in that profile first. For US numbers, you can enter either `6107814212` or `+16107814212`; bare 10-digit numbers are normalized to `+1`.
- SMTP credentials are stored locally in Electron's app data folder in plain text for simplicity.
- Gmail OAuth tokens and client credentials are also stored locally in the app data folder for simplicity.
- The `Custom user agent` field is intentionally not used in real Chrome mode. The monitor uses Chrome's own user agent from the actual Chrome binary/profile you launch.
