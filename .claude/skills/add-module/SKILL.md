---
name: add-module
description: Scaffold a new toggleable content-script module for the TRINITX Chrome extension, wiring every touch-point (background.js, popup.js, popup.html, README) in the right order. Use when adding a new module to this extension, or when the user types /add-module.
---

# Add a module to the TRINITX extension

Scaffolds a new **content-script** module following the established pattern. For PiP-style (keyboard/`chrome.debugger`) or popup-action modules, do NOT use this — those live directly in `background.js`/`popup.js`, not in `CONTENT_MODULES`.

Read `CLAUDE.md` first for the architecture (dynamic runtime registration, no `content_scripts` in the manifest).

## Step 1 — Collect the module spec

If `$ARGUMENTS` named the module, use it; otherwise ask the user for whatever is missing:

- **key** — camelCase, used as the storage flag and `data-module` value (e.g. `xMyFeature`).
- **id** — kebab-case, the registration id and folder name (e.g. `x-my-feature`).
- **matches** — host match patterns (e.g. `["*://x.com/*"]`).
- **world** — `ISOLATED` (default) or `MAIN` (only if it must intercept page globals like `fetch`/`XMLHttpRequest`/`window.Worker`).
- **runAt** — `document_idle` (default, DOM-ready work) or `document_start` (early interception, MAIN-world overrides).
- **allFrames** — `true` only if it must run in iframes.
- **title** / **description** — short French strings for the popup card.

Decide the entry file name: `content.js` for ISOLATED DOM modules, `main.js` for MAIN-world interceptors (matches the existing `x-auto-sort/main.js` convention).

## Step 2 — Create the module file

`modules/<id>/<content.js|main.js>`. ISOLATED template:

```js
// <Title> — <one-line purpose>
(() => {
  // Guard: éviter une double exécution si le module est ré-injecté (toggle).
  if (window.__<key>Loaded) return;
  window.__<key>Loaded = true;

  const TAG = "[<Title>]";
  // ... module logic. Log with: console.log(TAG, "...")
})();
```

**Wrap the whole module in an IIFE `(() => { ... })()`** — content scripts run at file scope, so a top-level `return` for the guard throws `Illegal return statement`, and top-level `const`s would clash on re-injection. The IIFE both makes the guard `return` legal and scopes the declarations. Keep the guard as the first two statements inside it — modules can be re-injected into an already-open tab. (MAIN-world interceptors that wrap `fetch`/`Worker` follow the same wrapped-guard pattern; see `modules/x-auto-sort/main.js`.)

## Step 3 — Register in `background.js`

Add an entry to `CONTENT_MODULES`:

```js
<key>: {
  id: "<id>",
  js: ["modules/<id>/<file>"],
  matches: [/* matches */],
  world: "ISOLATED",        // or "MAIN"
  runAt: "document_idle",   // or "document_start"
  // allFrames: true,       // only if needed
},
```

And add `<key>: true,` to `DEFAULT_MODULES` in the same file.

## Step 4 — Register in `popup.js`

Add the same `<key>: true,` to the `DEFAULT_MODULES` object in `popup.js` (it is intentionally duplicated — both copies must agree).

## Step 5 — Add the toggle in `popup.html`

Insert a `<section>` inside `<main id="modules">`, matching the existing cards:

```html
<!-- <Title> -->
<section class="module" data-module="<key>">
  <div class="module-row">
    <div class="module-info">
      <h2><Title></h2>
      <p><French description></p>
    </div>
    <label class="switch">
      <input type="checkbox" data-module="<key>" />
      <span class="slider"></span>
    </label>
  </div>
</section>
```

No `popup.css` change needed — `.module` styling is generic. Add an optional `<div class="module-extra">…</div>` only if the module needs an action link.

## Step 6 — Document in `README.md`

Add a row to the modules table and, if the README has a file tree, add the new `modules/<id>/` path. Match the table's existing column layout.

## Step 7 — Manifest (only if required)

Edit `manifest.json` only when the module needs something new: a `permission`, a `host_permissions` entry, or a `web_accessible_resources` entry (the latter only for MAIN-world scripts injected from a file, like twitch-nosub). Do NOT add a `content_scripts` entry — registration is dynamic.

## Step 8 — Tell the user how to load it

Registrations use `persistAcrossSessions: true`, so a fresh `CONTENT_MODULES` entry registers on the next sync. Instruct the user to:

1. Reload the extension at `chrome://extensions` (reload icon on the card).
2. If the new module isn't active, toggle it off then on in the popup — that fires `storage.onChanged` → `syncRegistrations()`, guaranteeing registration.
3. Reload a matching tab and check the Service Worker console for `[TRINITX] module enregistre: <id>`.

## Final check

Confirm `<key>` appears consistently in all five places: `modules/<id>/`, `CONTENT_MODULES`, both `DEFAULT_MODULES`, and `popup.html`'s `data-module`. A mismatch is the most common bug — the toggle renders but nothing registers.
