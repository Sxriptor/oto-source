# OTO

OTO is a desktop control app built with Electron for two related jobs:

- monitoring a real Google Chrome tab on a refresh interval
- watching Gmail for matching messages and triggering the same alert flow

It is designed for workflows where you need persistent browser state, repeated checks, and immediate notifications without relying on an embedded webview.

## Overview

OTO combines two monitors in one app:

- `Chrome Watcher` opens a real Chrome window with a dedicated persistent profile, refreshes a target page, and checks whether specific text is found or missing.
- `Gmail Watcher` connects through the Gmail API, searches for matching messages, and triggers the same downstream alerts used by the browser watcher.

The app is intentionally built around actual Google Chrome instead of an Electron browser surface so login state, cookies, passkeys, and normal Chrome session behavior stay intact.

## Why Real Chrome

- Uses the installed Google Chrome browser rather than an Electron webview.
- Avoids common embedded-browser issues around WebAuthn, passkeys, and some sign-in flows.
- Keeps a dedicated persistent Chrome profile for this app, so site sessions survive restarts.
- Uses the Chrome DevTools Protocol to refresh the page and inspect text without interacting with the UI manually.

## Feature Set

### Chrome Watcher

- Launches and manages a real Chrome window for a target URL.
- Refreshes manually or on a fixed interval.
- Triggers when watched text is either `found` or `missing`.
- Supports case-sensitive matching.
- Checks both rendered page text and a raw-text fallback for more reliable detection.
- Avoids repeated alerts by only firing when the watch condition changes from false to true.

### Gmail Watcher

- Connects with Gmail OAuth using the Gmail API.
- Filters by sender and subject rules.
- Uses Gmail search first, then re-validates message fields before alerting.
- Deduplicates by Gmail message ID during a watcher session.
- Can optionally allow repeated alerts for the same message.
- Can persist processed message IDs locally to avoid retriggering across runs.

### Alerts

- Local alert flow shared across both watcher modes.
- Optional SMTP email delivery through Nodemailer.
- Optional Discord webhook notifications with configurable repeat count and delay.
- Optional Google Voice call handoff using the same managed Chrome profile.

## Requirements

- Node.js
- npm
- Google Chrome installed locally

Optional integrations:

- Google Cloud OAuth desktop client with Gmail API enabled
- SMTP credentials for email alerts
- Discord webhook URL
- Google Voice account signed into the managed Chrome profile

## Quick Start

```bash
npm install
npm start
```

## Development

### Available Scripts

```bash
npm start
npm run dist
npm run dist:win
npm run dist:mac
```

- `npm start` launches the Electron app.
- `npm run dist` builds with `electron-builder`.
- `npm run dist:win` creates the Windows installer build.
- `npm run dist:mac` creates the macOS DMG build.

## Build Output

### Windows

```bash
npm install
npm run dist:win
```

Artifacts are written to `dist/`. The configured output name is `OTO.exe`.

### macOS

```bash
npm install
npm run dist:mac
```

Artifacts are written to `dist/`. The configured output name is `OTO.dmg`.

## Usage

### Chrome Watcher Workflow

1. Enter the target URL and click `Go`.
2. Sign into the site in the Chrome window that OTO opens.
3. Enter the text to monitor.
4. Choose whether the trigger condition is `found` or `missing`.
5. Set a refresh interval or use manual refresh.
6. Configure optional alert channels.
7. Start the watcher.

### Gmail Watcher Workflow

1. Open the `Gmail Watcher` tab.
2. Create a Google Cloud OAuth desktop client.
3. Enable the Gmail API for that project.
4. Paste the OAuth client ID and client secret into OTO.
5. Enter sender and/or subject matching rules.
6. Click `Sign In` and complete the OAuth flow.
7. Start the watcher.

On Windows, Google consent opens in the default browser because Google blocks embedded Electron sign-in for this flow. After approval, the app receives the callback through a local loopback redirect.

## Operational Notes

- Clicking `Go` collapses the control panel into a smaller bar to keep the UI out of the way.
- Page text checks run shortly after each page load completes.
- Settings auto-save shortly after edits.
- The `Custom user agent` field is not used in real Chrome mode. OTO relies on Chrome's actual user agent.
- Google Voice alerts open a call URL in the managed Chrome profile, then simulate the minimal keyboard sequence needed to trigger the call UI.
- For US Google Voice numbers, bare 10-digit numbers are normalized to `+1`.

## Data Storage

OTO stores app state locally in Electron's app data directory, including:

- watcher settings
- SMTP configuration
- Discord webhook configuration
- Gmail OAuth client credentials
- Gmail OAuth tokens
- processed Gmail message IDs

## Security Notes

- SMTP credentials are stored locally in plain text.
- Gmail OAuth credentials and tokens are also stored locally for simplicity.
- This project assumes a trusted local machine environment rather than hardened secret storage.

If that storage model is not acceptable for your use case, the app should be updated to use encrypted local storage or OS-managed credential storage before wider deployment.

## Project Structure

```text
.
|-- index.html
|-- main.js
|-- preload.js
|-- renderer.js
|-- gmailWatcher.js
|-- styles.css
|-- public/
|-- dist/
`-- package.json
```

## Stack

- Electron
- electron-builder
- googleapis
- Nodemailer

## License

MIT
