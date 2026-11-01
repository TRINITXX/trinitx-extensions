# REVIEW.md

Read by every review of this repo, on top of `AGENTS.md` and `CLAUDE.md`. A review remark that comes back gets a line here.

## What counts as a bug here

- **A module acting on the wrong site or tab.** The PiP and mute hotkeys only ever target twitch.tv tabs (most recently accessed first), never the active tab of another site (fix 977f33e). Mute targets the tab actually in picture-in-picture, native or Document PiP (fix d946a5c).
- **Re-injection breaking a tab.** Every ISOLATED script keeps its IIFE + `window.__xxxLoaded` guard: a module can be injected again into an open tab (toggle, extension reload, on-demand injection like `area-screenshot` or `modules/pip/`).
- **Work that silently stops in a hidden tab.** A hidden tab renders nothing (rAF and IntersectionObserver at 0, timers at 1/s). Anything that must keep going while the user is elsewhere relies on events (WebSocket, storage) or pauses and resumes on `visibilitychange`; it never reads a page DOM that only updates on render (memory `hidden-tab-rendering-freeze`).
- **A page element moved or hidden and never put back.** The Document PiP moves Twitch's `<video>` into its window: closing it by any path (cross, hotkey, back-to-tab, tab navigation) must put the video back where it was and keep it playing. `pagehide` is registered before anything that can throw.
- **The PiP window resized when the user did not ask.** Its size is the one Alexis gives it: no automatic resize after a manual one (a 16/9 snap was removed on 31/10, it changed his size). Showing the chat never changes the window size and the chat never overlays the video. A programmatic grow beyond 25 % of the screen area makes Chrome shrink the whole window, so the pin button goes through the native host (`native-host/`, Windows SetWindowPos, only the 80 % cap). The host converts Chrome's units to Windows pixels through the window's current rect, never by a bare `× devicePixelRatio`: Chrome's bounds sit 24 px above the Windows rect at 300 % (measured 31/10), and the first conversion landed 8 px too high.
- **The chat leaving the bottom.** It stays scrolled to the end unless the user scrolled up himself (`stuck`, changed only by scroll events): a window resize (`ResizeObserver` of the PiP window, not of the hidden opener tab) or an emote that finishes loading (`load` in capture) keeps it there (Alexis, 31/10).
- **The PiP window jumping back while used on X.** Arriving on x.com puts it at the pin's place, but only on a tab switch or when the active tab moves from another site to x.com (`tabWasX`). Never on a focus return (a click in the PiP hands the focus back to the tab) nor on a navigation inside x.com, or a window moved by hand would jump at each click or page (Alexis, 01/11/2026).
- **The PiP hotkey dead until the service worker restarts.** Any await under `pipBusy` (a page promise through `chrome.debugger`) must time out. Seen in test: `requestWindow` never answers while a native PiP is open.
- **A handle replaced without releasing the old one.** Seen in review (31/10): on a raid the chat of the old channel kept its WebSocket open and reconnecting. Stop the old chat, timer or socket before creating the new one.
- **"Toggle" sent where a state is meant.** A slider or a double click sends bursts: ask for the wanted state (`doc-pip-mute` carries `muted`), never "invert".
- **A native PiP replaced in a loop.** `doc-pip.js` replaces any native PiP of a Twitch page, except the one `background.js` opens as a fallback (marker `data-trinitx-native-pip` on `<html>`).
- **Scroll jump on X.** Hiding tweets must happen synchronously in the MutationObserver, never in a rAF, or the back-navigation scroll restore breaks (fix ce7b31a).
- **A message to the other world that nobody answers.** `player.js` (MAIN) skips BTTV's native PiP only when `doc-pip.js` accepts the `trinitx-pip-request` event (`preventDefault`); an orphaned script after an extension reload, or the module switched off, must leave the native PiP working.
- **Ctrl+W closing the PiP window.** Chrome reserves Ctrl+W, no page can block it: the PiP window gives the keyboard back (`doc-pip-blur`, `chrome.windows.update(..., { focused: false })`) after it opens and after each click in it.
- **A native PiP flashing before the PiP window.** BTTV's button must go through the `requestPictureInPicture` patch in `player.js` (MAIN): a native PiP consumes the click's activation, so replacing it afterwards needs the debugger and shows the native window for a moment.
- **Two copies drifting apart.** `DEFAULT_MODULES` (background.js and popup.js), the `/add-module` skill (`.claude/skills/` and `.agents/skills/`), the module list in README.

## Sensitive zones

- `background.js` PiP section: `chrome.debugger` attach with a fake user gesture. Every attach must detach in a `finally`, or the yellow debugging banner stays.
- `syncContextMenus()`: the only place that creates context menus (it `removeAll()`s first).
- Hardcoded X bearer, `QUERY_ID` and Twitch IRC endpoints: if they rotate, the module dies silently. Log a `[ModuleName]` warning on failure.

## Decisions not to flag

- No build, no tests, no lint: plain vanilla JS loaded unpacked.
- Comments in French without accents, user-facing strings in French.
- The anonymous Twitch IRC login (`justinfan…` + any `PASS`) is Twitch's documented read-only access, not a credential.
- 7TV / BTTV / FFZ emote APIs are called without keys on purpose (public endpoints).

## Paths to skip

- `modules/twitch-nosub/` (vendored, Apache-2.0), `modules/twitch-ads-vaft/` (vendored), `modules/youtube-no-translation/dist/`, `modules/area-screenshot/snapdom.js`, `icons/`.
