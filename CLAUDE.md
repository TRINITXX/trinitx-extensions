# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **single Chrome MV3 extension** ("TRINITX Extensions perso") made of several **toggleable modules**, all driven by one `manifest.json` at the repo root. Plain **vanilla JavaScript, no build step, no bundler, no framework**. This is NOT a React Native / Expo / npm project — ignore any such assumption from global instructions here.

## Commands

- **No build, no install, no tests, no lint/format tooling** — there is no `package.json`.
- The only script: `node generate-icons.js` — regenerates `icons/icon{16,48,128}.png` (dependency-free, uses only `fs`/`zlib`). Run only when the icon needs to change.
- **Load / reload the extension**: `chrome://extensions` → enable Developer mode → "Load unpacked" → select the repo root. After editing `background.js`/`manifest.json`, click the reload icon on the extension card.
- **Debug**: open the Service Worker console from the extension card; logs are prefixed `[TRINITX]` (background) or `[ModuleName]` (content scripts).

## Module architecture (the key non-obvious part)

Content-script modules are **registered dynamically at runtime**, NOT declared in `manifest.json`. There is intentionally no `content_scripts` key in the manifest.

- `background.js` holds `CONTENT_MODULES` (per-module `{ id, js, matches, world, runAt, allFrames }`) and `DEFAULT_MODULES` (initial on/off state).
- Enabled state lives in `chrome.storage.local.modules`. The popup writes it; `background.js`'s `storage.onChanged` listener then calls `syncRegistrations()` (which `registerContentScripts` / `unregisterContentScripts`) and `injectIntoOpenTabs()` for newly-enabled modules.
- Registrations use `persistAcrossSessions: true`, so **changing a module's `matches`/`js`/`world` in `CONTENT_MODULES` does not take effect until that module is re-registered** — toggle it off then on, or reload the extension.
- Toggling a module OFF unregisters it but **already-injected tabs keep running until reloaded**.
- `DEFAULT_MODULES` is duplicated in both `background.js` and `popup.js` — keep the two copies in sync.

Two modules are NOT content scripts: **PiP hotkey + mute** (`background.js`, via `chrome.commands` + `chrome.debugger`) and **Reload tabs** (popup button → `reload-tabs` runtime message handled in `background.js`).

## Adding a module

Use the **`/add-module` skill** (`.claude/skills/add-module/`) — it scaffolds the file and wires every touch-point in the right order. The touch-points it covers: new `modules/<name>/content.js`, `CONTENT_MODULES` + `DEFAULT_MODULES` in `background.js`, `DEFAULT_MODULES` in `popup.js`, a `<section class="module">` in `popup.html`, and the README table. Update `manifest.json` only if a new permission / `host_permissions` / `web_accessible_resources` entry is required.

## Conventions

- **Double-load guard** at the top of every ISOLATED content script: `if (window.__xxxLoaded) return; window.__xxxLoaded = true;` — modules can be re-injected into an open tab.
- **World scoping**: default to `ISOLATED`. Use `MAIN` only to intercept page globals (`fetch`/`XMLHttpRequest`/`window.Worker`) — e.g. `x-auto-sort`, `twitch-nosub/app.js`.
- **Storage**: `chrome.storage.local` for persistent state (`modules`, `lastSeenTweetHref`, `reloadSkipPatterns`); `chrome.storage.session` for ephemeral state (`pipTabId`).
- **Language**: user-facing UI strings are in French. Match the existing file's comment language (this repo's comments are in French) when editing.

## Gotchas

- **PiP** opens via `chrome.debugger` with a fake user gesture → a ~1 s yellow "debugging" banner appears. Suppress by launching Chrome with `--silent-debugger-extension-api`.
- **`modules/twitch-nosub/`** is vendored from `besuper/TwitchNoSub` (Apache-2.0) — keep its `LICENSE`. Its `app.js` loads a patch from a CDN at runtime (remote code, upstream-controlled). The module runs at `document_start`, so a tab reload is required after enabling.
- **`x-quick-block`** calls X's internal block API with a hardcoded public bearer token + the `ct0` CSRF cookie. If X rotates the bearer, update the constant in `modules/x-quick-block/content.js`.
