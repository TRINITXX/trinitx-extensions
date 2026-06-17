// TRINITX Extensions perso — service worker orchestrateur
// ---------------------------------------------------------------------------
// - Active/desactive chaque module via chrome.storage.local.modules
// - Modules "content script" : enregistrement dynamique (register/unregister)
// - Module PiP : commandes clavier + chrome.debugger (repris de PiP Remote)
// ---------------------------------------------------------------------------

const TAG = "[TRINITX]";
const DEFAULT_MODULES = {
  pip: true,
  xAutoSort: true,
  xAutoScroll: true,
  xQuickBlock: true,
  xHideSponsored: true,
  xDimTheme: true,
  twitchNoSub: true,
  // Anti-pub Twitch (vaft) : ON par defaut.
  twitchAdsVaft: true,
  // Preview video live de la chaine au survol : ON par defaut.
  twitchPreview: true,
  youtubeCustomSpeed: true,
  youtubeNoTranslation: true,
};

// Modules a base de content scripts (enregistres seulement si actives)
const CONTENT_MODULES = {
  twitchNoSub: {
    id: "twitch-nosub",
    js: [
      "modules/twitch-nosub/restriction-remover.js",
      "modules/twitch-nosub/twitchnosub.js",
    ],
    matches: ["*://*.twitch.tv/*"],
    world: "ISOLATED",
    runAt: "document_start",
    allFrames: true,
  },
  xAutoSort: {
    id: "x-auto-sort",
    js: ["modules/x-auto-sort/main.js"],
    matches: ["*://x.com/*", "*://twitter.com/*"],
    world: "MAIN",
    runAt: "document_start",
  },
  // Anti-pub Twitch (vaft, pixeltris/TwitchAdSolutions). Monde MAIN,
  // document_start : hooke window.Worker/fetch -> recharger l'onglet Twitch
  // apres activation. Coexiste avec twitchNoSub (reinsertion du worker).
  twitchAdsVaft: {
    id: "twitch-ads-vaft",
    js: ["modules/twitch-ads-vaft/main.js"],
    matches: ["*://*.twitch.tv/*"],
    world: "MAIN",
    runAt: "document_start",
    allFrames: true,
  },
  // Preview video live au survol des chaines (listes Twitch). ISOLATED,
  // document_idle : ajoute juste des listeners + un iframe player.twitch.tv.
  twitchPreview: {
    id: "twitch-preview",
    js: ["modules/twitch-preview/content.js"],
    matches: ["*://*.twitch.tv/*"],
    world: "ISOLATED",
    runAt: "document_idle",
  },
  xAutoScroll: {
    id: "x-auto-scroll",
    js: ["modules/x-auto-scroll/content.js"],
    matches: ["*://x.com/*"],
    world: "ISOLATED",
    runAt: "document_idle",
  },
  xQuickBlock: {
    id: "x-quick-block",
    js: ["modules/x-quick-block/content.js"],
    matches: ["*://x.com/*"],
    world: "ISOLATED",
    runAt: "document_idle",
  },
  xHideSponsored: {
    id: "x-hide-sponsored",
    js: ["modules/x-hide-sponsored/content.js"],
    matches: ["*://x.com/*"],
    world: "ISOLATED",
    runAt: "document_idle",
  },
  // Restaure le theme "Dim" : injecte du CSS au plus tot pour eviter le flash.
  xDimTheme: {
    id: "x-dim-theme",
    js: ["modules/x-dim-theme/content.js"],
    matches: ["*://x.com/*", "*://twitter.com/*"],
    world: "ISOLATED",
    runAt: "document_start",
  },
  youtubeCustomSpeed: {
    id: "youtube-custom-speed",
    js: ["modules/youtube-custom-speed/content.js"],
    matches: ["*://www.youtube.com/*"],
    world: "ISOLATED",
    runAt: "document_idle",
  },
  // Vendore depuis YouG-o/YouTube-No-Translation (AGPL-3.0). Le content script
  // ISOLATED injecte lui-meme ses scripts monde MAIN (web_accessible_resources).
  // document_start + allFrames comme l'upstream -> recharger l'onglet apres ON.
  youtubeNoTranslation: {
    id: "youtube-no-translation",
    js: [
      "modules/youtube-no-translation/dist/browser-polyfill.js",
      "modules/youtube-no-translation/dist/content/content.js",
    ],
    matches: ["*://*.youtube.com/*", "*://*.youtube-nocookie.com/*"],
    world: "ISOLATED",
    runAt: "document_start",
    allFrames: true,
  },
};

async function getModules() {
  const { modules } = await chrome.storage.local.get("modules");
  return { ...DEFAULT_MODULES, ...(modules || {}) };
}

// --- Synchronise les content scripts enregistres avec les toggles ----------
async function syncRegistrations() {
  const mods = await getModules();
  let existing = [];
  try {
    existing = await chrome.scripting.getRegisteredContentScripts();
  } catch {}
  const existingIds = new Set(existing.map((s) => s.id));

  for (const key of Object.keys(CONTENT_MODULES)) {
    const def = CONTENT_MODULES[key];
    const shouldBe = !!mods[key];
    const isReg = existingIds.has(def.id);
    try {
      if (shouldBe && !isReg) {
        await chrome.scripting.registerContentScripts([
          {
            id: def.id,
            js: def.js,
            matches: def.matches,
            world: def.world,
            runAt: def.runAt,
            allFrames: !!def.allFrames,
            persistAcrossSessions: true,
          },
        ]);
        console.log(TAG, "module enregistre:", def.id);
      } else if (!shouldBe && isReg) {
        await chrome.scripting.unregisterContentScripts({ ids: [def.id] });
        console.log(TAG, "module retire:", def.id);
      }
    } catch (e) {
      console.warn(TAG, "sync", def.id, "echec:", e.message);
    }
  }
}

// Injection immediate dans les onglets deja ouverts (quand on active un module)
async function injectIntoOpenTabs(key) {
  const def = CONTENT_MODULES[key];
  if (!def) return;
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: def.matches });
  } catch {
    return;
  }
  for (const tab of tabs) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: def.js,
        world: def.world,
      });
    } catch {
      /* page non injectable -> ignore */
    }
  }
}

// ===========================================================================
// MODULE PiP — commandes clavier + chrome.debugger (userGesture)
// ===========================================================================
const PIP_KEY = "pipTabId";
let pipBusy = false;

// Injecte (chrome.scripting) : ferme le PiP s'il existe, sinon signale la video.
function probeOrClose() {
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture();
    return "closed";
  }
  const hasVideo = Array.from(document.querySelectorAll("video")).some(
    (v) => !v.disablePictureInPicture && v.readyState > 0,
  );
  return hasVideo ? "has-video" : "no-video";
}

// Evaluee via debugger AVEC faux geste pour OUVRIR le PiP.
const OPEN_EXPRESSION = `(async () => {
  try {
    if (document.pictureInPictureElement) return { status: 'opened' };
    const vids = Array.from(document.querySelectorAll('video'))
      .filter(v => !v.disablePictureInPicture && v.readyState > 0);
    vids.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight);
    const v = vids[0];
    if (!v) return { status: 'no-video' };
    await v.requestPictureInPicture();
    return { status: 'opened' };
  } catch (e) {
    return { status: 'error', error: (e && e.name + ': ' + e.message) || String(e) };
  }
})()`;

async function getRememberedTabId() {
  const obj = await chrome.storage.session.get(PIP_KEY);
  const id = obj[PIP_KEY];
  if (id == null) return null;
  try {
    await chrome.tabs.get(id);
    return id;
  } catch {
    await chrome.storage.session.remove(PIP_KEY);
    return null;
  }
}
async function rememberPipTab(id) {
  await chrome.storage.session.set({ [PIP_KEY]: id });
}
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  return tab || null;
}

// chrome.scripting : detecter / fermer (aucun bandeau)
async function probeOrCloseTab(tabId) {
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: probeOrClose,
    });
  } catch (e) {
    console.warn(
      TAG,
      "scripting impossible sur l'onglet",
      tabId,
      ":",
      e.message,
    );
    return "no-access";
  }
  const vals = results.map((r) => r.result);
  if (vals.includes("closed")) return "closed";
  if (vals.includes("has-video")) return "has-video";
  return "no-video";
}

// chrome.debugger : ouvrir avec faux geste (bandeau ~1s)
function dbgAttach(tabId) {
  return new Promise((resolve, reject) =>
    chrome.debugger.attach({ tabId }, "1.3", () => {
      const e = chrome.runtime.lastError;
      e ? reject(new Error(e.message)) : resolve();
    }),
  );
}
function dbgDetach(tabId) {
  return new Promise((resolve) =>
    chrome.debugger.detach({ tabId }, () => {
      void chrome.runtime.lastError;
      resolve();
    }),
  );
}
function dbgSend(tabId, method, params) {
  return new Promise((resolve, reject) =>
    chrome.debugger.sendCommand({ tabId }, method, params || {}, (res) => {
      const e = chrome.runtime.lastError;
      e ? reject(new Error(e.message)) : resolve(res);
    }),
  );
}

async function openPipViaDebugger(tabId) {
  const contexts = [];
  const onEvent = (src, method, params) => {
    if (src.tabId === tabId && method === "Runtime.executionContextCreated") {
      contexts.push(params.context);
    }
  };
  chrome.debugger.onEvent.addListener(onEvent);

  try {
    await dbgAttach(tabId);
  } catch (e) {
    chrome.debugger.onEvent.removeListener(onEvent);
    const reason = /another debugger/i.test(e.message)
      ? "DevTools ouvert sur cet onglet"
      : e.message;
    console.warn(TAG, "attach impossible:", reason);
    return { status: "attach-failed", error: reason };
  }

  try {
    await dbgSend(tabId, "Runtime.enable");
    await new Promise((r) => setTimeout(r, 200));
    const ids = contexts.length ? contexts.map((c) => c.id) : [undefined];
    let last = { status: "no-video" };
    for (const contextId of ids) {
      const params = {
        expression: OPEN_EXPRESSION,
        userGesture: true,
        awaitPromise: true,
        returnByValue: true,
      };
      if (contextId !== undefined) params.contextId = contextId;
      let res;
      try {
        res = await dbgSend(tabId, "Runtime.evaluate", params);
      } catch (e) {
        last = { status: "error", error: e.message };
        continue;
      }
      const val = res && res.result && res.result.value;
      if (val) last = val;
      if (val && (val.status === "opened" || val.status === "error"))
        return val;
    }
    return last;
  } finally {
    await dbgDetach(tabId);
    chrome.debugger.onEvent.removeListener(onEvent);
  }
}

function flashBadge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 1200);
}

async function resolveTargetAndAct() {
  const remembered = await getRememberedTabId();
  if (remembered != null) {
    const s = await probeOrCloseTab(remembered);
    if (s === "closed") return { tabId: remembered, action: "closed" };
    if (s === "has-video") return { tabId: remembered, action: "open" };
  }
  const active = await getActiveTab();
  if (!active) return null;
  const s = await probeOrCloseTab(active.id);
  if (s === "closed") return { tabId: active.id, action: "closed" };
  if (s === "has-video") return { tabId: active.id, action: "open" };
  return { tabId: active.id, action: "none" };
}

async function handleTogglePip() {
  if (pipBusy) return;
  pipBusy = true;
  try {
    const target = await resolveTargetAndAct();
    if (!target) {
      console.warn(TAG, "aucun onglet cible");
      return;
    }
    if (target.action === "closed") {
      flashBadge("off", "#666666");
      return;
    }
    if (target.action === "none") {
      flashBadge("!", "#cc3333");
      return;
    }
    const res = await openPipViaDebugger(target.tabId);
    if (res.status === "opened") {
      await rememberPipTab(target.tabId);
      flashBadge("PiP", "#33aa33");
    } else {
      console.warn(TAG, "ouverture PiP echouee:", res.status, res.error || "");
      flashBadge("!", "#cc3333");
    }
  } finally {
    pipBusy = false;
  }
}

async function handleToggleMute() {
  let tabId = await getRememberedTabId();
  if (tabId == null) {
    const active = await getActiveTab();
    tabId = active ? active.id : null;
  }
  if (tabId == null) {
    console.warn(TAG, "aucun onglet a muter");
    return;
  }
  const tab = await chrome.tabs.get(tabId);
  const muted = !(tab.mutedInfo && tab.mutedInfo.muted);
  await chrome.tabs.update(tabId, { muted });
  flashBadge(muted ? "mut" : "snd", "#3366cc");
}

// ===========================================================================
// MODULE Recharger les onglets — bouton popup + filtres d'exclusion
// ===========================================================================
const RELOAD_PATTERNS_KEY = "reloadSkipPatterns";

// Convertit un pattern type "*.youtube.com/*" en RegExp ancree, insensible casse.
function patternToRegex(pattern) {
  const escaped = pattern
    .trim()
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // echappe les specials regex...
    .replace(/\*/g, ".*"); // ...sauf le joker, traduit en ".*"
  return new RegExp("^" + escaped + "$", "i");
}

// Cible du match : host + chemin + query, SANS le protocole
// (ex: "www.youtube.com/watch?v=x"). Fallback si l'URL n'est pas parsable.
function urlToMatchTarget(rawUrl) {
  try {
    const u = new URL(rawUrl);
    return u.host + u.pathname + u.search;
  } catch {
    return String(rawUrl || "").replace(/^[a-z]+:\/\//i, "");
  }
}

function parseSkipPatterns(raw) {
  return String(raw || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

function shouldSkipUrl(rawUrl, patterns) {
  if (!patterns.length) return false;
  const target = urlToMatchTarget(rawUrl);
  return patterns.some((p) => {
    try {
      return patternToRegex(p).test(target);
    } catch {
      return false; // pattern malforme -> on l'ignore plutot que de planter
    }
  });
}

// Recharge tous les onglets de la fenetre active, sauf ceux exclus par filtre.
async function reloadWindowTabs() {
  const stored = await chrome.storage.local.get(RELOAD_PATTERNS_KEY);
  const patterns = parseSkipPatterns(stored[RELOAD_PATTERNS_KEY]);
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ currentWindow: true });
  } catch (e) {
    console.warn(TAG, "query onglets echec:", e.message);
    return { reloaded: 0, skipped: 0, failed: 0 };
  }
  let reloaded = 0;
  let skipped = 0;
  let failed = 0;
  for (const tab of tabs) {
    if (shouldSkipUrl(tab.url, patterns)) {
      skipped++;
      continue;
    }
    try {
      await chrome.tabs.reload(tab.id);
      reloaded++;
    } catch {
      failed++; // chrome://, Web Store, onglet inaccessible -> ignore
    }
  }
  console.log(TAG, "reload onglets:", { reloaded, skipped, failed });
  return { reloaded, skipped, failed };
}

// ===========================================================================
// Wiring
// ===========================================================================
chrome.commands.onCommand.addListener(async (command) => {
  const mods = await getModules();
  if (!mods.pip) {
    console.log(TAG, "module PiP desactive — commande ignoree");
    return;
  }
  if (command === "toggle-pip") handleTogglePip();
  else if (command === "toggle-mute") handleToggleMute();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "reload-tabs") {
    reloadWindowTabs().then(sendResponse);
    return true; // reponse asynchrone
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const obj = await chrome.storage.session.get(PIP_KEY);
  if (obj[PIP_KEY] === tabId) {
    await chrome.storage.session.remove(PIP_KEY);
  }
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local" || !changes.modules) return;
  const oldV = changes.modules.oldValue || {};
  const newV = changes.modules.newValue || {};
  await syncRegistrations();
  for (const key of Object.keys(CONTENT_MODULES)) {
    if (newV[key] && !oldV[key]) injectIntoOpenTabs(key);
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  const { modules } = await chrome.storage.local.get("modules");
  if (!modules) await chrome.storage.local.set({ modules: DEFAULT_MODULES });
  await syncRegistrations();
});

chrome.runtime.onStartup.addListener(syncRegistrations);

console.log(TAG, "service worker demarre");
