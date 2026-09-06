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
  // Masque les bandes laterales de X (fil seul) : ON par defaut.
  xFocusTimeline: true,
  // Repare la mise en page figee de X (onglet charge en arriere-plan).
  xLayoutRefresh: true,
  twitchNoSub: true,
  // Anti-pub Twitch (vaft) : ON par defaut.
  twitchAdsVaft: true,
  // Preview video live de la chaine au survol : ON par defaut.
  twitchPreview: true,
  // Limiteur de volume audio (anti-cri) sur Twitch : ON par defaut.
  twitchVolumeLimiter: true,
  // Un seul onglet Twitch audible a la fois : ON par defaut.
  twitchSoloAudio: true,
  youtubeCustomSpeed: true,
  youtubeNoTranslation: true,
  // Force la meilleure qualité dispo sur chaque vidéo YouTube : ON par defaut.
  youtubeBestQuality: true,
  // Menu contextuel "Masquer sur X" sur une selection : ON par defaut.
  xMuteSelection: true,
  // Masquer les tweets par pays d'origine : OFF par defaut (genere du trafic
  // API en arriere-plan -> opt-in volontaire).
  xHideByCountry: false,
  // Repare les drapeaux emoji affiches en lettres (Windows) : ON par defaut.
  flagEmoji: true,
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
  // Limiteur de volume (DynamicsCompressorNode en mode limiteur). ISOLATED,
  // document_idle : branche une chaine Web Audio sur le <video> du player.
  twitchVolumeLimiter: {
    id: "twitch-volume-limiter",
    js: ["modules/twitch-volume-limiter/content.js"],
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
  // Driver du menu contextuel "Masquer sur X" : tourne UNIQUEMENT sur la page
  // d'ajout de mot masque. Le menu contextuel lui-meme + l'orchestration de la
  // fenetre arriere-plan vivent plus bas dans ce fichier (section dediee).
  xMuteSelection: {
    id: "x-mute-selection",
    js: ["modules/x-mute-selection/content.js"],
    matches: ["*://x.com/settings/add_muted_keyword*"],
    world: "ISOLATED",
    runAt: "document_idle",
  },
  // Masque les tweets des comptes bases dans certains pays. ISOLATED : fait ses
  // propres appels AboutAccountQuery (bearer public + ct0, comme x-quick-block)
  // et masque en DOM. countries.js (liste canonique + defauts, source unique
  // partagee avec le popup) est charge AVANT content.js.
  xHideByCountry: {
    id: "x-hide-by-country",
    js: [
      "modules/x-hide-by-country/countries.js",
      "modules/x-hide-by-country/content.js",
    ],
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
  // Masque la barre de navigation gauche et la colonne droite de X. CSS pur
  // en visibility: hidden (pas display: none) pour ne pas recentrer le fil ;
  // injecte a document_start pour eviter un flash des bandes laterales.
  xFocusTimeline: {
    id: "x-focus-timeline",
    js: ["modules/x-focus-timeline/content.js"],
    matches: ["*://x.com/*", "*://twitter.com/*"],
    world: "ISOLATED",
    runAt: "document_start",
  },
  // Force X a remesurer la largeur de ses colonnes quand l'onglet a ete
  // charge ou redimensionne pendant qu'il etait cache (barre de gauche restee
  // "en grand" + debordement horizontal). ISOLATED : ne touche que le DOM.
  xLayoutRefresh: {
    id: "x-layout-refresh",
    js: ["modules/x-layout-refresh/content.js"],
    matches: ["*://x.com/*", "*://twitter.com/*"],
    world: "ISOLATED",
    runAt: "document_idle",
  },
  // Vitesse de lecture personnalisee. Monde MAIN : YouTube a decouple
  // l'element <video> de la lecture reelle, seul #movie_player.setPlaybackRate()
  // change vraiment la vitesse (invisible en ISOLATED). Persiste via localStorage.
  youtubeCustomSpeed: {
    id: "youtube-custom-speed",
    js: ["modules/youtube-custom-speed/content.js"],
    matches: ["*://www.youtube.com/*"],
    world: "MAIN",
    runAt: "document_idle",
  },
  // Force la plus haute qualité dispo. Monde MAIN : appelle l'API interne du
  // lecteur (#movie_player.setPlaybackQualityRange), invisible en ISOLATED.
  youtubeBestQuality: {
    id: "youtube-best-quality",
    js: ["modules/youtube-best-quality/main.js"],
    matches: ["*://www.youtube.com/*"],
    world: "MAIN",
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
  // Drapeaux emoji : Windows n'a pas les glyphes, Chrome n'embarque pas de
  // police de secours -> "FR" au lieu du drapeau. Tous les sites, ISOLATED :
  // charge une police Twemoji limitee aux drapeaux et encapsule chaque
  // drapeau dans un <span> (le reste de la typographie n'est pas touche).
  flagEmoji: {
    id: "flag-emoji",
    js: ["modules/flag-emoji/content.js"],
    matches: ["http://*/*", "https://*/*"],
    world: "ISOLATED",
    runAt: "document_idle",
  },
};

async function getModules() {
  const { modules } = await chrome.storage.local.get("modules");
  return { ...DEFAULT_MODULES, ...(modules || {}) };
}

// Interrupteur maitre : surclasse tous les modules (defaut ON).
async function isMasterEnabled() {
  const { masterEnabled } = await chrome.storage.local.get("masterEnabled");
  return masterEnabled !== false;
}

// --- Synchronise les content scripts enregistres avec les toggles ----------
async function syncRegistrations() {
  const mods = await getModules();
  const master = await isMasterEnabled();
  let existing = [];
  try {
    existing = await chrome.scripting.getRegisteredContentScripts();
  } catch {}
  const existingIds = new Set(existing.map((s) => s.id));

  for (const key of Object.keys(CONTENT_MODULES)) {
    const def = CONTENT_MODULES[key];
    const shouldBe = master && !!mods[key];
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

// Injecte : l'onglet a-t-il un PiP ouvert (video natif ou Document PiP) ?
function probePip() {
  return !!(
    document.pictureInPictureElement ||
    (window.documentPictureInPicture && window.documentPictureInPicture.window)
  );
}

async function tabHasPip(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: probePip,
    });
    return results.some((r) => r.result === true);
  } catch {
    // Onglet hors host_permissions (chrome://, autre site) : pas de PiP visible.
    return false;
  }
}

// Retrouve l'onglet REELLEMENT en PiP, meme si le PiP a ete ouvert a la main
// depuis la page (auquel cas pipTabId n'a jamais ete pose). On tente d'abord
// l'onglet memorise, puis on balaie les onglets injectables — les onglets qui
// produisent du son d'abord, c'est le cas courant.
async function findPipTabId() {
  const remembered = await getRememberedTabId();
  if (remembered != null && (await tabHasPip(remembered))) return remembered;

  // Limite au perimetre injectable : ailleurs, executeScript echouerait de toute facon.
  const urls = chrome.runtime.getManifest().host_permissions || [];
  const tabs = (await chrome.tabs.query({ url: urls })).filter(
    (t) => t.id != null && t.id !== remembered,
  );
  tabs.sort((a, b) => (b.audible ? 1 : 0) - (a.audible ? 1 : 0));

  const checks = await Promise.all(
    tabs.map(async (t) => ({ id: t.id, pip: await tabHasPip(t.id) })),
  );
  const hit = checks.find((c) => c.pip);
  if (!hit) return null;
  await rememberPipTab(hit.id);
  return hit.id;
}

async function handleToggleMute() {
  // Cible l'onglet en PiP, jamais l'onglet actif : le raccourci sert a couper
  // le stream qu'on regarde en vignette pendant qu'on lit autre chose.
  let tabId = await findPipTabId();
  if (tabId == null) tabId = await getRememberedTabId(); // dernier PiP connu
  if (tabId == null) {
    console.warn(TAG, "aucun onglet en PiP a muter");
    flashBadge("!", "#cc3333");
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
// MODULE Masquer sur X — menu contextuel sur selection -> mot masque
// ===========================================================================
// Le menu "Masquer sur X" apparait au clic droit sur du texte selectionne, sur
// x.com. Au clic, on ouvre x.com/settings/add_muted_keyword dans une fenetre
// minimisee en arriere-plan et on memorise un "job" (le mot) pour l'onglet ; le
// content script x-mute-selection remplit alors le formulaire natif et le
// soumet. Faire signer la requete par le client de X evite de reimplementer sa
// signature anti-bot (x-client-transaction-id), obligatoire sur cet endpoint.
const MUTE_MENU_ID = "x-mute-selection";
const MUTE_JOB_PREFIX = "xMuteJob_"; // storage.session : job par onglet driver

async function isMuteModuleEnabled() {
  const mods = await getModules();
  return (await isMasterEnabled()) && !!mods.xMuteSelection;
}

// (Re)cree le menu selon l'etat du module. removeAll d'abord : idempotent et
// evite l'erreur "duplicate id" apres un redemarrage du service worker.
//
// SERIALISE : plusieurs declencheurs (onInstalled + storage.onChanged des ecritures
// modules/masterEnabled) appellent syncMuteMenu() quasi simultanement. Sans lock,
// deux removeAll()/create() s'entrelacent -> "Cannot create item with duplicate id".
// On enchaine donc les appels sur une meme promesse. Le callback de create() lit
// runtime.lastError pour ne pas laisser d'erreur "non lue" dans la console.
let muteMenuSync = Promise.resolve();
function syncMuteMenu() {
  muteMenuSync = muteMenuSync.then(doSyncMuteMenu, doSyncMuteMenu);
  return muteMenuSync;
}
async function doSyncMuteMenu() {
  try {
    await chrome.contextMenus.removeAll();
  } catch {}
  if (await isMuteModuleEnabled()) {
    await new Promise((resolve) => {
      chrome.contextMenus.create(
        {
          id: MUTE_MENU_ID,
          title: "Masquer « %s » sur X",
          contexts: ["selection"],
          documentUrlPatterns: ["*://x.com/*"],
        },
        () => {
          void chrome.runtime.lastError; // absorbe un eventuel "duplicate id"
          resolve();
        },
      );
    });
  }
}

// Jobs stockes en storage.session (survit aux suspensions du service worker).
function setMuteJob(tabId, job) {
  return chrome.storage.session.set({ [MUTE_JOB_PREFIX + tabId]: job });
}
async function getMuteJob(tabId) {
  const key = MUTE_JOB_PREFIX + tabId;
  const obj = await chrome.storage.session.get(key);
  return obj[key] || null;
}
function clearMuteJob(tabId) {
  return chrome.storage.session.remove(MUTE_JOB_PREFIX + tabId);
}

async function openMuteWindow(keyword) {
  let win;
  try {
    win = await chrome.windows.create({
      url: "https://x.com/settings/add_muted_keyword",
      state: "minimized", // arriere-plan : ne vole pas le focus, page invisible
    });
  } catch (e) {
    console.warn(TAG, "ouverture fenetre mute echec:", e.message);
    return;
  }
  const tab = win.tabs && win.tabs[0];
  if (!tab || tab.id == null) {
    chrome.windows.remove(win.id).catch(() => {});
    return;
  }
  await setMuteJob(tab.id, { keyword, windowId: win.id });
}

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== MUTE_MENU_ID) return;
  if (!(await isMuteModuleEnabled())) return;
  const keyword = (info.selectionText || "").trim();
  if (!keyword) return;
  await openMuteWindow(keyword);
});

// Messages du content script driver : demande de job / fin de job.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || (msg.type !== "mute-job-request" && msg.type !== "mute-job-done"))
    return;
  const tabId = sender.tab && sender.tab.id;
  if (msg.type === "mute-job-request") {
    (async () => {
      const job = tabId != null ? await getMuteJob(tabId) : null;
      sendResponse({ keyword: job ? job.keyword : null });
    })();
    return true; // reponse asynchrone
  }
  // mute-job-done : fermer la fenetre, nettoyer, flasher un retour discret.
  (async () => {
    const job = tabId != null ? await getMuteJob(tabId) : null;
    if (job) {
      await clearMuteJob(tabId);
      chrome.windows.remove(job.windowId).catch(() => {});
      if (msg.ok) flashBadge("✓", "#33aa33");
      else flashBadge("!", "#cc3333");
      console.log(TAG, "mot masque:", msg.ok ? "ok" : "echec", msg.keyword || "");
    }
    sendResponse({ ok: true });
  })();
  return true;
});

// Si l'utilisateur ferme lui-meme la fenetre du job, on nettoie l'entree.
chrome.tabs.onRemoved.addListener((tabId) => {
  clearMuteJob(tabId).catch(() => {});
});

// ===========================================================================
// MODULE Twitch — Audio solo (un seul onglet Twitch audible)
// ===========================================================================
// Regle : parmi les onglets twitch.tv, un seul a le son — le "porteur". Des
// qu'un onglet Twitch devient actif il prend le son et tous les autres onglets
// Twitch sont mutes. Les onglets NON-Twitch ne sont jamais touches, et partir
// sur un onglet hors Twitch ne change rien : le dernier onglet Twitch actif
// reste le porteur et garde son son.
//
// Le porteur (storage.session) survit aux suspensions du service worker. On
// memorise aussi les onglets qu'on a mutes NOUS : a l'extinction du module on
// ne demute que ceux-la, un mute pose a la main n'est jamais leve.
const TWSOLO_HOLDER_KEY = "twitchSoloTabId";
const TWSOLO_MUTED_KEY = "twitchSoloMuted";
const TWSOLO_MATCH = ["*://*.twitch.tv/*"];

async function isTwitchSoloEnabled() {
  const mods = await getModules();
  return (await isMasterEnabled()) && !!mods.twitchSoloAudio;
}

function isTwitchUrl(url) {
  try {
    return /(^|\.)twitch\.tv$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function isTabMuted(tab) {
  return !!(tab.mutedInfo && tab.mutedInfo.muted);
}

async function getTwSoloHolder() {
  const obj = await chrome.storage.session.get(TWSOLO_HOLDER_KEY);
  const id = obj[TWSOLO_HOLDER_KEY];
  return typeof id === "number" ? id : null;
}
async function getTwSoloMuted() {
  const obj = await chrome.storage.session.get(TWSOLO_MUTED_KEY);
  return new Set(Array.isArray(obj[TWSOLO_MUTED_KEY]) ? obj[TWSOLO_MUTED_KEY] : []);
}
function setTwSoloMuted(ids) {
  return chrome.storage.session.set({ [TWSOLO_MUTED_KEY]: [...ids] });
}

async function setTabMuted(tabId, muted) {
  try {
    await chrome.tabs.update(tabId, { muted });
    return true;
  } catch {
    return false; // onglet ferme entre-temps / non modifiable
  }
}

// L'onglet en avant-plan : l'actif de la derniere fenetre NORMALE focalisee. On
// ignore les fenetres "popup" (celle du module Masquer sur X, par exemple).
async function getForegroundTab() {
  try {
    const win = await chrome.windows.getLastFocused({
      populate: true,
      windowTypes: ["normal"],
    });
    const tab = (win.tabs || []).find((t) => t.active);
    if (tab && tab.id != null) return tab;
  } catch {}
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  return tab && tab.id != null ? tab : null;
}

// Serialise les passages : onActivated + onFocusChanged + onUpdated tombent a
// quelques ms d'intervalle et se marcheraient dessus sur l'etat memorise.
let twSoloQueue = Promise.resolve();
function scheduleTwSolo(fn) {
  twSoloQueue = twSoloQueue.then(fn, fn);
  return twSoloQueue;
}

async function applyTwitchSolo() {
  if (!(await isTwitchSoloEnabled())) return;

  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: TWSOLO_MATCH });
  } catch (e) {
    console.warn(TAG, "audio solo Twitch: query echec:", e.message);
    return;
  }
  if (!tabs.length) return;

  // Qui porte le son ? L'onglet Twitch en avant-plan s'il y en a un, sinon le
  // porteur memorise tant qu'il existe encore.
  const fg = await getForegroundTab();
  const fgIsTwitch = !!(fg && isTwitchUrl(fg.url));
  let holder = null;
  if (fgIsTwitch) holder = fg.id;
  else {
    const stored = await getTwSoloHolder();
    if (stored != null && tabs.some((t) => t.id === stored)) holder = stored;
  }
  // Aucun porteur connu (au demarrage, ou apres fermeture du precedent) : on
  // adopte l'onglet qui produit deja du son plutot que de tout faire taire.
  if (holder == null) {
    const candidate =
      tabs.find((t) => t.audible && !isTabMuted(t)) ||
      tabs.find((t) => !isTabMuted(t));
    if (!candidate) return; // tout est deja muet a la main : on ne force rien
    holder = candidate.id;
  }
  await chrome.storage.session.set({ [TWSOLO_HOLDER_KEY]: holder });

  const ours = await getTwSoloMuted();
  const live = new Set(tabs.map((t) => t.id));
  let changed = false;

  for (const tab of tabs) {
    if (tab.id === holder) {
      if (ours.delete(tab.id)) changed = true;
      // On ne rend le son que si l'utilisateur vient d'arriver sur cet onglet :
      // ca demute aussi ce qu'il avait mute a la main (c'est le comportement
      // attendu), mais sans defaire ce mute a chaque evenement quand il est
      // ailleurs et que cet onglet n'est porteur que de memoire.
      if (fgIsTwitch && isTabMuted(tab)) await setTabMuted(tab.id, false);
    } else if (!isTabMuted(tab) && (await setTabMuted(tab.id, true))) {
      ours.add(tab.id);
      changed = true;
    }
  }
  for (const id of [...ours]) {
    if (!live.has(id)) {
      ours.delete(id); // onglet ferme : plus rien a restaurer
      changed = true;
    }
  }
  if (changed) await setTwSoloMuted(ours);
}

// Extinction du module (ou de l'interrupteur maitre) : on rend le son.
async function restoreTwitchSolo() {
  const ours = await getTwSoloMuted();
  if (!ours.size) return;
  for (const id of ours) await setTabMuted(id, false);
  await chrome.storage.session.remove(TWSOLO_MUTED_KEY);
  console.log(TAG, "audio solo Twitch: son rendu a", ours.size, "onglet(s)");
}

chrome.tabs.onActivated.addListener(() => scheduleTwSolo(applyTwitchSolo));

chrome.windows.onFocusChanged.addListener((windowId) => {
  // WINDOW_ID_NONE = Chrome perd le focus (alt-tab vers une autre appli) :
  // on ne touche a rien, le porteur doit continuer a s'entendre.
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  scheduleTwSolo(applyTwitchSolo);
});

// Un onglet Twitch d'arriere-plan qui se remet a produire du son entre deux
// changements d'onglet (retour de pub, stream qui demarre) est mute a la volee.
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.audible !== true || isTabMuted(tab)) return;
  if (!isTwitchUrl(tab.url)) return;
  scheduleTwSolo(applyTwitchSolo);
});

chrome.tabs.onRemoved.addListener((tabId) =>
  scheduleTwSolo(async () => {
    const ours = await getTwSoloMuted();
    if (ours.delete(tabId)) await setTwSoloMuted(ours);
    if ((await getTwSoloHolder()) === tabId) {
      await chrome.storage.session.remove(TWSOLO_HOLDER_KEY);
    }
  }),
);

// ===========================================================================
// Wiring
// ===========================================================================
chrome.commands.onCommand.addListener(async (command) => {
  if (!(await isMasterEnabled())) {
    console.log(TAG, "interrupteur maitre OFF — commande ignoree");
    return;
  }
  const mods = await getModules();
  if (!mods.pip) {
    console.log(TAG, "module PiP desactive — commande ignoree");
    return;
  }
  if (command === "toggle-pip") handleTogglePip();
  else if (command === "toggle-mute") handleToggleMute();
});

// --- Reparation manuelle de la mise en page de X (bouton du popup) --------
// X garde parfois une largeur de mise en page obsolete (barre de navigation
// restee "en grand" + debordement horizontal). Verifie sur le cas reel :
// retrecir <html> ne suffit PAS, X pose sa largeur en dur et ne la recalcule
// que sur un vrai changement du viewport. On essaie donc plusieurs leviers,
// du moins genant au plus visible, et on s'arrete des que c'est repare.

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Ecart tolere entre la mise en page de X et la fenetre, en pixels.
const X_LAYOUT_SLACK = 2;

function isXUrl(url) {
  return (
    url.startsWith("https://x.com/") || url.startsWith("https://twitter.com/")
  );
}

// Pages exclues de la reparation AUTOMATIQUE (le bouton du popup, lui, est un
// geste explicite et marche partout). Le fil d'accueil est exclu a la demande.
const X_LAYOUT_SKIP = ["/home"];

function isXLayoutTarget(url) {
  if (!isXUrl(url)) return false;
  try {
    return !X_LAYOUT_SKIP.includes(new URL(url).pathname);
  } catch {
    return false;
  }
}

// Mesures prises dans la page : largeur de la fenetre, largeur de la barre de
// navigation, debordement horizontal, et etat du module x-layout-refresh.
async function measureXLayout(tabId) {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const de = document.documentElement;
      const banner = document.querySelector('header[role="banner"]');
      const root = banner ? banner.parentElement : null;
      const rootWidth = root ? root.getBoundingClientRect().width : 0;
      return {
        width: de.clientWidth,
        inner: window.innerWidth,
        over: Math.round(Math.max(de.scrollWidth, rootWidth) - de.clientWidth),
        nav: Math.round(banner ? banner.getBoundingClientRect().width : 0),
        // Pose par le content script : "absent" = module pas injecte ici.
        module: de.dataset.xLayoutRefresh || "absent",
      };
    },
  });
  return (res && res.result) || null;
}

// 1. Evenement resize synthetique, dans le monde de la page : sans effet
//    visuel si X l'ecoute, puisque la vraie largeur est deja la bonne.
async function xNudgeResizeEvent(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => {
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("orientationchange"));
    },
  });
  await wait(350);
}

// 2. Aller-retour de zoom, CONFINE a l'onglet vise.
//
//    Piege verifie sur le cas reel : chrome.tabs.setZoom porte par defaut sur
//    l'ORIGINE entiere (scope "per-origin"). Bouger le zoom d'un onglet cache
//    faisait donc sursauter la page d'accueil affichee a cote — visible meme a
//    0,2 %. Reduire l'ecart ne reglait rien, c'etait la portee le probleme.
//
//    On bascule donc l'onglet en scope "per-tab" le temps du geste : plus rien
//    n'en sort, les autres onglets x.com ne bougent pas d'un pixel. Le scope
//    d'origine est restaure ensuite, ce qui rend a l'onglet le zoom de x.com et
//    le fait de nouveau suivre les changements de zoom faits ailleurs.
//
//    Comme le geste ne se voit plus, l'ecart n'a plus besoin d'etre timide : un
//    pas franc est plus sur de declencher le remesurage.
const X_ZOOM_STEP = 1.05;

// Les allers-retours sont serialises : deux qui se chevauchent liraient le zoom
// deja decale comme valeur "d'origine" et la laisseraient derriver a chaque
// passage. Le finally garantit la restauration meme en cas d'erreur.
let xZoomQueue = Promise.resolve();

function xNudgeZoom(tabId, step = X_ZOOM_STEP) {
  const run = xZoomQueue.then(async () => {
    const settings = await chrome.tabs.getZoomSettings(tabId);
    const zoom = await chrome.tabs.getZoom(tabId);
    try {
      await chrome.tabs.setZoomSettings(tabId, {
        mode: "automatic",
        scope: "per-tab",
      });
      await chrome.tabs.setZoom(tabId, zoom * step);
      await wait(100);
      await chrome.tabs.setZoom(tabId, zoom);
      await wait(100);
    } finally {
      // Remettre le scope d'origine reapplique le zoom per-origin a ce seul
      // onglet : un dernier changement de largeur, toujours confine.
      await chrome.tabs.setZoomSettings(tabId, {
        mode: settings.mode,
        scope: settings.scope,
      });
      await wait(120);
    }
  });
  // La file continue meme si celui-ci echoue ; l'appelant, lui, voit l'erreur.
  xZoomQueue = run.catch(() => {});
  return run;
}

// 3. Fenetre elargie d'un pixel puis remise : le plus proche de l'aller-retour
//    F11. Ignore si la fenetre est maximisee ou en plein ecran (la toucher la
//    ferait sortir de cet etat).
async function xNudgeWindow(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const win = await chrome.windows.get(tab.windowId);
  if (win.state !== "normal" || typeof win.width !== "number") return false;
  await chrome.windows.update(win.id, { width: win.width - 1 });
  await wait(250);
  await chrome.windows.update(win.id, { width: win.width });
  await wait(350);
  return true;
}

// tabId absent -> onglet actif (bouton du popup) ; fourni -> l'onglet qui a
// demande la reparation (module x-layout-refresh).
//
// quiet : reparation automatique, declenchee depuis la page — donc sur un
// onglet que l'utilisateur a forcement sous les yeux. Le redimensionnement de
// la fenetre est alors exclu : il bougerait toute la fenetre. Le bouton du
// popup, lui, est un geste explicite et garde tous ses leviers.
async function fixXLayout(tabId, quiet = false) {
  let tab;
  if (tabId) tab = await chrome.tabs.get(tabId).catch(() => null);
  else [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab && tab.url ? tab.url : "";
  if (!isXUrl(url)) return { ok: false, reason: "pas-x" };

  const before = await measureXLayout(tab.id);
  if (!before) return { ok: false, reason: "mesure-impossible" };
  const zoom = await chrome.tabs.getZoom(tab.id).catch(() => 1);

  // En mode quiet la page est masquee pendant l'operation : chaque milliseconde
  // est du fond uni a l'ecran, on va donc droit au levier qui marche. Le
  // bouton, lui, peut se permettre d'essayer le plus discret d'abord.
  const attempts = quiet
    ? [["zoom", () => xNudgeZoom(tab.id)]]
    : [
        ["evenement", () => xNudgeResizeEvent(tab.id)],
        ["zoom", () => xNudgeZoom(tab.id)],
        ["fenetre", () => xNudgeWindow(tab.id)],
      ];

  let after = before;
  let via = "aucun";
  if (before.over > X_LAYOUT_SLACK) {
    for (const [name, run] of attempts) {
      let applied = true;
      try {
        applied = (await run()) !== false;
      } catch (e) {
        console.warn(TAG, "reparation X", name, "echec:", e.message);
        applied = false;
      }
      if (!applied) continue;
      after = (await measureXLayout(tab.id)) || after;
      if (after.over <= X_LAYOUT_SLACK) {
        via = name;
        break;
      }
      via = `${name} sans effet`;
    }
  }

  return {
    ok: true,
    via,
    zoom: Math.round(zoom * 100),
    width: before.width,
    module: before.module,
    navBefore: before.nav,
    navAfter: after.nav,
    before: before.over,
    after: after.over,
  };
}

// --- Onglets X ouverts en arriere-plan ------------------------------------
// Constat verifie avec l'utilisateur : un simple F5 remet la page droite.
// Recharger l'onglet PENDANT qu'il est encore en arriere-plan est donc la seule
// correction vraiment invisible — rien ne bouge a l'ecran et on arrive sur une
// page deja juste. Tout ce qui a ete essaye avant se voyait (aller-retour de
// zoom, redimensionnement de fenetre) ou ne suffisait pas (evenement resize,
// reprise de la largeur en DOM).
const X_RELOAD_DELAY = 400;

// Un onglet n'est traite qu'une fois dans sa vie : sans ca, le rechargement
// declencherait un nouveau "complete", donc un nouveau rechargement.
const xTabsHandled = new Set();

async function prepareHiddenXTab(tabId) {
  if (xTabsHandled.has(tabId)) return;
  const mods = await getModules();
  if (!mods.xLayoutRefresh || !(await isMasterEnabled())) return;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  // Arrive dessus entre-temps : un rechargement se verrait, on renonce.
  if (!tab || tab.active || !isXLayoutTarget(tab.url || "")) return;

  const measure = await measureXLayout(tabId).catch(() => null);
  const zoom = await chrome.tabs.getZoom(tabId).catch(() => 1);
  const broken = !!measure && measure.over > X_LAYOUT_SLACK;
  // Un onglet cache ne voit pas toujours son propre decalage : son viewport
  // reste fige sur l'ancienne mesure, donc tout parait coherent. Des qu'un zoom
  // est actif sur x.com le decalage est a prevoir, on n'attend pas de pouvoir
  // le mesurer.
  const zoomed = Math.abs(zoom - 1) > 0.01;
  if (!broken && !zoomed) return;

  xTabsHandled.add(tabId);
  console.log(
    TAG,
    "onglet X recharge en arriere-plan:",
    tabId,
    broken ? "(decalage mesure)" : "(zoom actif)",
  );
  await chrome.tabs.reload(tabId);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  const url = (tab && tab.url) || changeInfo.url || "";
  if (!isXLayoutTarget(url) || (tab && tab.active)) return;
  // Laisser X poser son premier rendu : la mesure n'a de sens qu'apres.
  setTimeout(() => prepareHiddenXTab(tabId), X_RELOAD_DELAY);
});

chrome.tabs.onRemoved.addListener((tabId) => xTabsHandled.delete(tabId));

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "reload-tabs") {
    reloadWindowTabs().then(sendResponse);
    return true; // reponse asynchrone
  }
  if (msg && msg.type === "fix-x-layout") {
    // Depuis un content script, on repare SON onglet ; depuis le popup, il n'y
    // a pas d'onglet emetteur et on prend l'onglet actif.
    const from = _sender && _sender.tab ? _sender.tab.id : undefined;
    fixXLayout(from, !!msg.quiet)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, reason: e.message }));
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
  if (area !== "local" || (!changes.modules && !changes.masterEnabled)) return;
  await syncRegistrations();
  await syncMuteMenu();

  // Audio solo Twitch : vit dans le service worker, donc rien a (des)enregistrer
  // — on applique ou on rend le son selon l'etat effectif du module.
  if (await isTwitchSoloEnabled()) scheduleTwSolo(applyTwitchSolo);
  else scheduleTwSolo(restoreTwitchSolo);

  // Plus rien a injecter si l'interrupteur maitre est OFF.
  if (!(await isMasterEnabled())) return;

  // Maitre vient de repasser ON -> (re)injecter tous les modules actifs.
  if (changes.masterEnabled && changes.masterEnabled.newValue) {
    const mods = await getModules();
    for (const key of Object.keys(CONTENT_MODULES)) {
      if (mods[key]) injectIntoOpenTabs(key);
    }
    return;
  }

  // Sinon : un module individuel a pu passer OFF -> ON.
  const oldV = (changes.modules && changes.modules.oldValue) || {};
  const newV = (changes.modules && changes.modules.newValue) || {};
  for (const key of Object.keys(CONTENT_MODULES)) {
    if (newV[key] && !oldV[key]) injectIntoOpenTabs(key);
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(["modules", "masterEnabled"]);
  if (!stored.modules)
    await chrome.storage.local.set({ modules: DEFAULT_MODULES });
  if (stored.masterEnabled === undefined) {
    await chrome.storage.local.set({ masterEnabled: true });
  }
  await syncRegistrations();
  await syncMuteMenu();
  if (await isTwitchSoloEnabled()) scheduleTwSolo(applyTwitchSolo);
});

chrome.runtime.onStartup.addListener(async () => {
  await syncRegistrations();
  await syncMuteMenu();
  if (await isTwitchSoloEnabled()) scheduleTwSolo(applyTwitchSolo);
});

console.log(TAG, "service worker demarre");
