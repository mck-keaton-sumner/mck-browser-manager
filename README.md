# MCK Browser Manager

An enterprise Chrome extension (Manifest V3) for **McKinney**, providing one-click cache clearing plus centrally managed performance and privacy controls.

> Managed by IT Help Desk. _Set your own support URL in `popup.html`/`options.html` (the footer link) before deploying._

## Features

- **Cache** — One-click cache clearing with loading and success states, plus a "last cleared" timestamp.
- **Performance** — Memory Saver, Tab Hibernation, and Preload Pages controls.
- **Privacy** — Do Not Track, Block 3rd Party Cookies, Block JavaScript, and WebRTC Protection.
- **Settings** — Auto-clear cache on Chrome startup (**ON by default**, toggleable).
- Auto-clear on startup and all privacy/performance settings are re-applied by the background service worker on every browser launch.

## Project structure

```
mck-browser-manager/
├── manifest.json        # MV3 manifest
├── background.js        # Service worker (startup logic, alarms, cache)
├── popup.html           # 4-tab popup UI
├── popup.css            # McKinney-branded styles
├── popup.js             # Popup logic (load/save/apply settings)
├── options.html         # Standalone settings page
├── options.js           # Options page logic
├── assets/
│   └── logo.png         # McKinney wordmark
└── icons/               # 16/32/48/128 px extension icons
```

## Permissions

`browsingData`, `storage`, `tabs`, `privacy`, `contentSettings`, `alarms`

## Install (unpacked, for testing)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this folder.

## Enterprise deployment (Google Admin)

This extension can be force-installed via the Google Admin console
(Devices → Chrome → Apps & extensions) using the packed `.crx` / extension ID,
without publishing to the Chrome Web Store. Contact IT Help Desk for the managed
deployment policy.

## Setting the administrator password

The "Auto-clear cache on startup" setting is protected by an administrator password. 
**Before deploying**, set your own password by editing:

1. **`popup.js`** — Line 32: `const ADMIN_PASSWORD = "YOUR_PASSWORD_HERE";`
2. **`options.js`** — Line 13: `const ADMIN_PASSWORD = "YOUR_PASSWORD_HERE";`

Replace `"YOUR_PASSWORD_HERE"` with your chosen password in both files.

⚠️ **Security note:** This is a client-side deterrent against accidental changes, not a true security boundary. 
A determined user can read the password from the extension's source code. For truly enforced policies, 
use Chrome Enterprise Policy controls via Google Admin.

## Development notes

- No third-party libraries and no emojis — all iconography is inline SVG.
- All Chrome API calls are wrapped in error handling.
- Brand palette: orange `#E84B0C`, maroon `#7A1515`, charcoal `#2D2D2D`.
