# AGENTS.md

This file provides guidance to coding agents (Codex, Claude Code) when working with code in this repository.

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

**Area screenshot** (`areaScreenshot`) is not in `CONTENT_MODULES` either: its context-menu click injects `modules/area-screenshot/content.js` on demand with `executeScript`.

## Adding a module

Use the **`/add-module` skill** (`.agents/skills/add-module/`, mirrored in `.claude/skills/`) — it scaffolds the file and wires every touch-point in the right order. The touch-points it covers: new `modules/<name>/content.js`, `CONTENT_MODULES` + `DEFAULT_MODULES` in `background.js`, `DEFAULT_MODULES` in `popup.js`, a `<section class="module">` in `popup.html`, and the README table. Update `manifest.json` only if a new permission / `host_permissions` / `web_accessible_resources` entry is required.

## Conventions

- **Double-load guard** at the top of every ISOLATED content script, **inside an IIFE** `(() => { if (window.__xxxLoaded) return; window.__xxxLoaded = true; … })();` — content scripts run at file scope, so a bare top-level `return` throws `Illegal return statement` and top-level `const`s clash on re-injection; the IIFE fixes both. Modules can be re-injected into an open tab.
- **World scoping**: default to `ISOLATED`. Use `MAIN` only to intercept page globals (`fetch`/`XMLHttpRequest`/`window.Worker`) — e.g. `x-auto-sort`, `twitch-nosub/app.js`.
- **Storage**: `chrome.storage.local` for persistent state (`modules`, `lastSeenTweetHref`, `reloadSkipPatterns`); `chrome.storage.session` for ephemeral state (`twitchSoloTabId`, `xMuteJob_*`).
- **Language**: user-facing UI strings are in French. Match the existing file's comment language (this repo's comments are in French) when editing.

## Gotchas

- **PiP** opens via `chrome.debugger` with a fake user gesture → a ~1 s yellow "debugging" banner appears. Suppress by launching Chrome with `--silent-debugger-extension-api`.
- **`modules/twitch-nosub/`** is vendored from `besuper/TwitchNoSub` (Apache-2.0) — keep its `LICENSE`. Its `app.js` loads a patch from a CDN at runtime (remote code, upstream-controlled). The module runs at `document_start`, so a tab reload is required after enabling.
- **`x-quick-block`** calls X's internal block API with a hardcoded public bearer token + the `ct0` CSRF cookie. If X rotates the bearer, update the constant in `modules/x-quick-block/content.js`.
- **Context menus**: `syncContextMenus()` in `background.js` calls `contextMenus.removeAll()` and recreates EVERY menu of the extension. A new menu goes there, never in its own sync function, or the two will erase each other.
- **`area-screenshot`** is injected in ALL frames (page content may live in a cross-origin iframe, e.g. claude.ai artifacts); the frame of the first click owns the selection, the others go passive, and frame offsets travel up a `postMessage` chain. It first redraws the zone from the DOM with the vendored `snapdom.js` (MIT, injected before `content.js`; fixed and stuck-sticky elements excluded, else snapdom paints them at their on-screen position mid-image). It falls back to stitching screen by screen when the DOM lacks part of the zone: a corner element got unmounted, a vertical gap with no leaf element (virtualized lists: X, Discord), or the only covering element is the scroll panel itself (snapdom paints just its visible part). `captureBeyondViewport` (one shot) was dropped because Chrome visibly "zooms" the page for 1-3 s. Each stitched screen comes from `chrome.debugger` `Page.captureScreenshot` (no rate limit), falling back to `captureVisibleTab` (~2 calls/s), which needs the `activeTab` grant from the menu click — plain `http://*/*` host permissions are not enough. Delivery: the file goes through `chrome.downloads` with a `data:` URL (verified up to 27 MB; a page-side `<a download>` produced no file on claude.ai in a real test, cause not pinned down), and the clipboard write needs a focused document — our blocked clicks keep focus from moving, hence `window.focus()` first, then a retry in the top frame. Testing outside the menu (Playwright calling `executeScript`) needs `<all_urls>` in a copy of the manifest and a short profile path (Windows path length breaks extension storage).
- **`x-hide-by-country`** resolves each author's country via X's internal `AboutAccountQuery` GraphQL endpoint (same public bearer + `ct0`), because `account_based_in` is NOT in the timeline payload. Both the `BEARER` and the `QUERY_ID` are hardcoded in `modules/x-hide-by-country/content.js` — if X rotates either, re-capture from a live request. `countries.js` (canonical list + default blacklist) is the single source of truth, loaded before `content.js` AND by `popup.html`; the blacklist lives in `chrome.storage.local.hiddenCountries` with the per-account country cache in an IndexedDB DB named `xHideByCountry` (TTL 180 days). An in-page dot (top right, left of the `x-focus-timeline` one) pauses the filter via `chrome.storage.local.hideByCountryPaused`.
