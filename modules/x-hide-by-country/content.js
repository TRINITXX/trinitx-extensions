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
  // Pause du filtre, pilotee par la pastille en haut a droite. Persistee (donc
  // partagee entre tous les onglets X et conservee au rechargement) : couper le
  // filtre est une decision qui doit tenir, pas un reglage par onglet.
  const PAUSE_KEY = "hideByCountryPaused";
  const BUTTON_ID = "x-hide-by-country-toggle";
  // Classe posee sur <html> pendant la pause : elle desactive la regle de
  // masquage sans toucher aux marquages deja poses sur les tweets.
  const PAUSED_CLASS = "xhbc-paused";

  const TWEET_SELECTOR = 'article[data-testid="tweet"]';
  const CELL_SELECTOR = '[data-testid="cellInnerDiv"]';
  const HIDE_ATTR = "data-xhbc-hidden";

  const aliasOf = (c) => (DATA.ALIASES && DATA.ALIASES[c]) || c;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log(TAG, ...a);

  // Etat en memoire (par page)
  let hiddenSet = new Set(); // pays a masquer (chaines normalisees)
  let paused = false; // filtre suspendu depuis la pastille
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
  // On marque la cellule entiere (cellInnerDiv) pour supprimer aussi l'espace ;
  // fallback sur l'article. Le marquage ne fait QUE poser HIDE_ATTR : c'est une
  // regle CSS (`html:not(.PAUSED_CLASS) [HIDE_ATTR]`) qui masque reellement. Du
  // coup la pause se resume a une classe sur <html> -> bascule instantanee dans
  // les deux sens, sans parcourir le DOM ni re-resoudre le moindre pays.
  function tweetCell(article) {
    return article.closest(CELL_SELECTOR) || article;
  }
  function setHidden(article, hide) {
    const cell = tweetCell(article);
    if (hide) {
      if (cell.getAttribute(HIDE_ATTR)) return;
      cell.setAttribute(HIDE_ATTR, "1");
    } else if (cell.getAttribute(HIDE_ATTR)) {
      cell.removeAttribute(HIDE_ATTR);
    }
  }

  function decide(sn) {
    const c = countryOf.get(sn);
    return !!(c && hiddenSet.has(c));
  }

  // En pause on continue de resoudre et de marquer les tweets : ils restent
  // visibles (le CSS neutralise le marquage) et la reactivation est immediate,
  // sans attendre un appel AboutAccountQuery par auteur.
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
      mountButton(); // X remplace parfois le <body> lors d'une navigation interne
      applyAll();
    });
  }

  // --- Feuille de style : masquage + pastille ------------------------------
  // La pastille reprend le gabarit de x-focus-timeline (20px cliquables, point
  // de 7px), decalee de 22px vers la gauche pour se poser a cote sans la
  // recouvrir. Grise et quasi invisible quand le filtre tourne ; ambre bien
  // lisible quand il est en pause, pour ne pas oublier qu'on voit tout.
  const STYLE_CSS = `
    html:not(.${PAUSED_CLASS}) [${HIDE_ATTR}] {
      display: none !important;
    }

    #${BUTTON_ID} {
      position: fixed;
      top: 3px;
      right: 25px;
      z-index: 2147483000;
      width: 20px;
      height: 20px;
      padding: 0;
      margin: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      -webkit-appearance: none;
      appearance: none;
    }
    #${BUTTON_ID}::before {
      content: "";
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: currentColor;
      color: #71767b;
      opacity: 0.16;
      transition: opacity 120ms ease;
    }
    #${BUTTON_ID}:hover::before,
    #${BUTTON_ID}:focus-visible::before {
      opacity: 0.9;
    }
    #${BUTTON_ID}[data-paused="1"]::before {
      color: #f0a53d;
      opacity: 0.85;
    }
  `;

  function injectStyle() {
    if (document.getElementById(BUTTON_ID + "-style")) return;
    const style = document.createElement("style");
    style.id = BUTTON_ID + "-style";
    style.textContent = STYLE_CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  // Reflete `paused` dans le DOM : la classe fait (re)apparaitre ou disparaitre
  // tous les tweets marques d'un coup, la pastille change de couleur.
  function refreshPausedState() {
    document.documentElement.classList.toggle(PAUSED_CLASS, paused);
    const button = document.getElementById(BUTTON_ID);
    if (!button) return;
    button.dataset.paused = paused ? "1" : "0";
    button.title = paused
      ? "Masquage par pays désactivé — cliquer pour réactiver"
      : "Masquage par pays actif — cliquer pour désactiver";
  }

  function mountButton() {
    if (!document.body || document.getElementById(BUTTON_ID)) return;
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.setAttribute("aria-label", "Activer ou désactiver le masquage par pays");
    // On n'ecrit que dans le storage : c'est storage.onChanged qui met a jour
    // l'etat et le DOM, ici comme dans les autres onglets X ouverts.
    button.addEventListener("click", () => {
      chrome.storage.local.set({ [PAUSE_KEY]: !paused });
    });
    document.body.appendChild(button);
    refreshPausedState();
  }

  // --- Blacklist (storage) -------------------------------------------------
  function normalize(list) {
    return new Set((Array.isArray(list) ? list : []).map(aliasOf));
  }
  async function loadState() {
    const obj = await chrome.storage.local.get([STORAGE_KEY, PAUSE_KEY]);
    const list = obj[STORAGE_KEY];
    hiddenSet = normalize(Array.isArray(list) ? list : DATA.DEFAULT_HIDDEN);
    paused = obj[PAUSE_KEY] === true;
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (!changes[STORAGE_KEY] && !changes[PAUSE_KEY]) return;
    if (changes[PAUSE_KEY]) {
      paused = changes[PAUSE_KEY].newValue === true;
      // La classe suffit a tout (re)afficher : rien d'autre a faire ici.
      refreshPausedState();
    }
    if (changes[STORAGE_KEY]) {
      const nv = changes[STORAGE_KEY].newValue;
      hiddenSet = normalize(Array.isArray(nv) ? nv : DATA.DEFAULT_HIDDEN);
      // Re-evalue tout : marque les pays nouvellement coches, demarque les decoches.
      applyAll();
    }
  });

  // --- Init ----------------------------------------------------------------
  async function init() {
    await loadState();
    injectStyle();
    refreshPausedState();
    mountButton();
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
