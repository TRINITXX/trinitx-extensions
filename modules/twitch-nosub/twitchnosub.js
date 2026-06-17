// Adapted from besuper/TwitchNoSub (https://github.com/besuper/TwitchNoSub)
// Licensed under Apache-2.0 — see modules/twitch-nosub/LICENSE.
// Changes vs upstream: Chrome-only, module-relative web_accessible_resource
// paths, and ordered execution (async=false) so chrome/app.js (patch_url)
// runs before app.js (which consumes patch_url).
const TNS_BASE = "modules/twitch-nosub";

function injectScript(src) {
  const s = document.createElement("script");
  s.src = chrome.runtime.getURL(src);
  s.async = false; // preserve insertion order across the two scripts
  s.onload = () => s.remove();
  (document.head || document.documentElement).append(s);
}

console.log("[TNS] init (chrome)");

injectScript(`${TNS_BASE}/chrome/app.js`);
injectScript(`${TNS_BASE}/app.js`);
