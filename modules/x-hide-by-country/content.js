// X — Masquer par pays — masque les tweets des comptes bases dans certains pays.
//
// X expose la provenance d'un compte ("About this account" -> account_based_in),
// mais PAS dans la timeline : il faut un appel GraphQL dedie AboutAccountQuery par
// compte. On resout donc le pays de chaque auteur croise (appel signe par ta
// session : bearer public + cookie ct0, exactement comme x-quick-block), on cache
// le resultat en IndexedDB (TTL 180 j) et on masque le tweet si le pays est dans
// la blacklist. Throttle + backoff 429 pour rester sous les rate-limits.
(() => {
  // Guard : evite une double execution si le module est re-injecte (toggle).
  if (window.__xHideByCountryLoaded) return;
  window.__xHideByCountryLoaded = true;

  const TAG = "[X-HideByCountry]";
  const DATA = window.X_HIDE_BY_COUNTRY || {
    COUNTRIES: [],
    DEFAULT_HIDDEN: [],
    ALIASES: {},
  };

  // Bearer web public de X (identique a x-quick-block). Pas un secret, pas l'API
  // dev payante. Si X le rote, mettre a jour cette constante ET QUERY_ID.
  const BEARER =
    "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
  // Query id GraphQL de AboutAccountQuery. Peut changer quand X redeploie son
  // client web -> a re-capturer depuis une requete live si les appels echouent.
  const QUERY_ID = "XRqGa7EeokUU5kppkh13EA";
  const ABOUT_URL = `https://x.com/i/api/graphql/${QUERY_ID}/AboutAccountQuery`;

  const TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 jours
  const THROTTLE_MS = 500; // delai mini entre deux appels AboutAccountQuery
  const STORAGE_KEY = "hiddenCountries";

  const TWEET_SELECTOR = 'article[data-testid="tweet"]';
  const CELL_SELECTOR = '[data-testid="cellInnerDiv"]';
  const HIDE_ATTR = "data-xhbc-hidden";

  const aliasOf = (c) => (DATA.ALIASES && DATA.ALIASES[c]) || c;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log(TAG, ...a);

  // Etat en memoire (par page)
  let hiddenSet = new Set(); // pays a masquer (chaines normalisees)
  const countryOf = new Map(); // screenName(lc) -> country|null (resolu)
  const pending = new Set(); // screenName(lc) en file / en cours
  const queue = [];
  let processing = false;
  let lastRequest = 0;
  let usePost = true; // bascule POST/GET sur 429 (buckets de rate-limit distincts)

  // --- Cookies -------------------------------------------------------------
  // ct0 = cookie CSRF double-submit (non httpOnly, donc lisible ici).
  function getCookie(name) {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }

  // --- Cache IndexedDB -----------------------------------------------------
  const DB_NAME = "xHideByCountry";
  const STORE = "countries";
  let dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      let req;
      try {
        req = indexedDB.open(DB_NAME, 1);
      } catch {
        resolve(null);
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    return dbPromise;
  }
  async function cacheGet(key) {
    const db = await openDb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const r = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  function cachePut(key, value) {
    openDb().then((db) => {
      if (!db) return;
      try {
        db.transaction(STORE, "readwrite").objectStore(STORE).put(value, key);
      } catch {
        /* ignore */
      }
    });
  }

  // --- Extraction du pseudo auteur -----------------------------------------
  // Le premier bloc User-Name en ordre DOM est l'auteur principal (pas un tweet
  // cite). Repris de x-quick-block. On lowercase pour une cle de cache stable.
  function getScreenName(article) {
    const userName = article.querySelector('[data-testid="User-Name"]');
    const scope = userName || article;
    const links = scope.querySelectorAll('a[href^="/"]');
    for (const link of links) {
      const href = link.getAttribute("href");
      if (/^\/[A-Za-z0-9_]{1,15}$/.test(href)) return href.slice(1).toLowerCase();
    }
    return null;
  }

  // --- Resolution du pays (AboutAccountQuery) ------------------------------
  async function fetchCountry(screenName) {
    const ct0 = getCookie("ct0");
    if (!ct0) return { ok: false };
    const url = `${ABOUT_URL}?${new URLSearchParams({
      variables: JSON.stringify({ screenName }),
    })}`;
    for (let attempt = 0; attempt < 6; attempt++) {
      let res;
      try {
        res = await fetch(url, {
          method: usePost ? "POST" : "GET",
          credentials: "include",
          headers: {
            authorization: BEARER,
            "x-csrf-token": ct0,
            "x-twitter-active-user": "yes",
            "x-twitter-auth-type": "OAuth2Session",
          },
        });
      } catch {
        return { ok: false };
      }
      if (res.status === 429) {
        usePost = !usePost;
        await wait(Math.min(THROTTLE_MS * Math.pow(1.7, attempt), 20000));
        continue;
      }
      if (!res.ok) return { ok: false };
      let json;
      try {
        json = await res.json();
      } catch {
        return { ok: false };
      }
      const about = json?.data?.user_result_by_screen_name?.result?.about_profile;
      const raw = about?.account_based_in;
      return { ok: true, country: raw ? aliasOf(raw) : null };
    }
    return { ok: false };
  }

  // --- File d'attente (throttlee) ------------------------------------------
  function enqueue(screenName) {
    if (pending.has(screenName) || countryOf.has(screenName)) return;
    pending.add(screenName);
    queue.push(screenName);
    if (!processing) processQueue();
  }

  async function processQueue() {
    if (processing) return;
    processing = true;
    try {
      while (queue.length) {
        const sn = queue.shift();
        if (countryOf.has(sn)) {
          pending.delete(sn);
          continue;
        }
        // 1) cache frais ?
        const cached = await cacheGet(sn);
        if (
          cached &&
          typeof cached.at === "number" &&
          Date.now() - cached.at < TTL_MS
        ) {
          countryOf.set(sn, cached.country ?? null);
          pending.delete(sn);
          applyForUser(sn);
          continue;
        }
        // 2) sinon appel reseau, throttle
        const dt = THROTTLE_MS - (Date.now() - lastRequest);
        if (dt > 0) await wait(dt);
        const result = await fetchCountry(sn);
        lastRequest = Date.now();
        if (result.ok) {
          countryOf.set(sn, result.country);
          cachePut(sn, { country: result.country, at: Date.now() });
          applyForUser(sn);
        }
        pending.delete(sn);
      }
    } finally {
      processing = false;
    }
  }

  // --- Masquage ------------------------------------------------------------
  // On masque la cellule entiere (cellInnerDiv) pour supprimer aussi l'espace ;
  // fallback sur l'article. On ne touche qu'aux proprietes qu'on gere, reperees
  // par HIDE_ATTR, pour pouvoir re-afficher proprement au decochage.
  function tweetCell(article) {
    return article.closest(CELL_SELECTOR) || article;
  }
  function setHidden(article, hide) {
    const cell = tweetCell(article);
    if (hide) {
      if (cell.getAttribute(HIDE_ATTR)) return;
      cell.setAttribute(HIDE_ATTR, "1");
      cell.style.display = "none";
    } else if (cell.getAttribute(HIDE_ATTR)) {
      cell.removeAttribute(HIDE_ATTR);
      cell.style.display = "";
    }
  }

  function decide(sn) {
    const c = countryOf.get(sn);
    return !!(c && hiddenSet.has(c));
  }

  function applyArticle(article) {
    const sn = getScreenName(article);
    if (!sn) return;
    if (!countryOf.has(sn)) {
      enqueue(sn); // pays inconnu -> on le resout (le tweet reste visible en attendant)
      return;
    }
    setHidden(article, decide(sn));
  }

  function applyForUser(sn) {
    const hide = decide(sn);
    document.querySelectorAll(TWEET_SELECTOR).forEach((a) => {
      if (getScreenName(a) === sn) setHidden(a, hide);
    });
  }

  function applyAll() {
    document.querySelectorAll(TWEET_SELECTOR).forEach(applyArticle);
  }

  // --- Scan (timeline virtualisee) -----------------------------------------
  let scanScheduled = false;
  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      applyAll();
    });
  }

  // --- Blacklist (storage) -------------------------------------------------
  function normalize(list) {
    return new Set((Array.isArray(list) ? list : []).map(aliasOf));
  }
  async function loadHidden() {
    const obj = await chrome.storage.local.get(STORAGE_KEY);
    const list = obj[STORAGE_KEY];
    hiddenSet = normalize(Array.isArray(list) ? list : DATA.DEFAULT_HIDDEN);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[STORAGE_KEY]) return;
    const nv = changes[STORAGE_KEY].newValue;
    hiddenSet = normalize(Array.isArray(nv) ? nv : DATA.DEFAULT_HIDDEN);
    // Re-evalue tout : masque les pays nouvellement coches, re-affiche les decoches.
    applyAll();
  });

  // --- Init ----------------------------------------------------------------
  async function init() {
    await loadHidden();
    scheduleScan();

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true });

    // Navigation SPA (URL change sans reload) -> rescan.
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        scheduleScan();
      }
    }, 1000);

    log("initialized");
  }

  init();
})();
