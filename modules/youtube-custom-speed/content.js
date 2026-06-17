(() => {
  // YouTube Custom Speed — vitesse de lecture personnalisee (au-dela de 2x).
  // Reimplemente en vanilla l'idee de nizioleque/youtube-custom-speed :
  // un widget "−  1.5x  +" injecte dans la barre du lecteur. Le chiffre central
  // reinitialise a 1x. La vitesse est persistee et reimposee a chaque video.
  //
  // Guard : evite une double execution si le module est reinjecte (toggle /
  // rechargement) alors qu'un onglet YouTube est deja ouvert.
  if (window.__youtubeCustomSpeedLoaded) return;
  window.__youtubeCustomSpeedLoaded = true;

  const TAG = "[YouTubeCustomSpeed]";
  const STORAGE_KEY = "ytCustomSpeed";

  const STEP = 0.25; // pas fin, en dessous de 3x (et grille d'alignement)
  const MIN = 0.25; // plancher
  const MAX = 16; // plafond accepte par Chrome

  // Paliers parcourus par les boutons −/+ : pas de 0.25 sous 3x, puis on saute
  // 3 → 4 → 8 → 16.
  const STOPS = (() => {
    const s = [];
    for (let i = 1; i * STEP < 3; i++) s.push(i * STEP); // 0.25 .. 2.75
    s.push(3, 4, 8, 16);
    return s;
  })();

  const CONTROL_CLASS = "tcs-speed-control";
  const LABEL_CLASS = "tcs-label";
  const STYLE_ID = "tcs-speed-style";

  // Double chevron facon "avance/recul rapide". Glyphe qui remplit le viewBox
  // pour rester compact contre le libelle (taille pilotee par le CSS).
  const ICON_DOWN = `<svg viewBox="0 0 24 24" fill="#fff"><path d="M 21 5 L 13 12 L 21 19 Z M 12 5 L 4 12 L 12 19 Z"></path></svg>`;
  const ICON_UP = `<svg viewBox="0 0 24 24" fill="#fff"><path d="M 3 5 L 11 12 L 3 19 Z M 12 5 L 20 12 L 12 19 Z"></path></svg>`;

  // Vitesse souhaitee, source de verite. Reimposee apres chaque reset YouTube.
  let desiredRate = 1;
  // Pendant cette fenetre (apres un changement de video), un reset a la valeur
  // par defaut est ignore : on reimpose desiredRate au lieu de l'adopter.
  let resetGraceUntil = 0;

  function log(...args) {
    console.log(TAG, ...args);
  }

  // --- Helpers vitesse -----------------------------------------------------

  function clampRate(r) {
    r = Math.round(r / STEP) * STEP; // aligne sur la grille 0.25
    r = Math.min(MAX, Math.max(MIN, r));
    return Math.round(r * 1000) / 1000; // evite la derive flottante
  }

  // Palier juste au-dessus / en dessous de la vitesse courante (tolerance pour
  // les vitesses adoptees du menu natif, deja sur la grille).
  function nextStop(rate) {
    for (const s of STOPS) if (s > rate + 1e-9) return s;
    return STOPS[STOPS.length - 1]; // deja au maximum
  }
  function prevStop(rate) {
    for (let i = STOPS.length - 1; i >= 0; i--) {
      if (STOPS[i] < rate - 1e-9) return STOPS[i];
    }
    return STOPS[0]; // deja au minimum
  }

  function formatRate(r) {
    const n = Number.isInteger(r)
      ? String(r)
      : parseFloat(r.toFixed(3)).toString();
    return n + "x";
  }

  function getVideo() {
    return (
      document.querySelector(".html5-main-video") ||
      document.querySelector("#movie_player video") ||
      document.querySelector("video")
    );
  }

  // Applique desiredRate a la video (si different) et rafraichit les libelles.
  function applyRate() {
    const video = getVideo();
    if (video && video.playbackRate !== desiredRate) {
      try {
        video.playbackRate = desiredRate;
      } catch {
        /* ignore */
      }
    }
    updateAllLabels();
  }

  function setRate(r) {
    desiredRate = clampRate(r);
    applyRate();
    save();
  }

  function save() {
    try {
      chrome.storage.local.set({ [STORAGE_KEY]: desiredRate });
    } catch {
      /* contexte d'extension invalide -> on ignore */
    }
  }

  // --- Synchro avec les changements de vitesse de la video -----------------

  function onRateChange() {
    const video = getVideo();
    if (!video) return;
    const r = video.playbackRate;
    if (r === desiredRate) return; // notre propre changement -> rien a faire

    // Une nouvelle video remet la vitesse a la valeur par defaut : pendant la
    // fenetre de grace on reimpose desiredRate plutot que de l'adopter.
    if (Date.now() < resetGraceUntil) {
      applyRate();
      return;
    }

    // Sinon : l'utilisateur a change la vitesse via le menu natif YouTube.
    // On adopte sa valeur pour rester synchronise.
    desiredRate = clampRate(r);
    updateAllLabels();
    save();
  }

  function onLoadStart() {
    // Nouveau media -> YouTube reinitialise playbackRate. On reimpose, avec
    // quelques tentatives differees car le reset peut arriver apres loadstart.
    resetGraceUntil = Date.now() + 1500;
    applyRate();
    setTimeout(applyRate, 300);
    setTimeout(applyRate, 1000);
  }

  function bindVideo() {
    const video = getVideo();
    if (!video || video.__tcsBound) return;
    video.__tcsBound = true;
    video.addEventListener("ratechange", onRateChange);
    video.addEventListener("loadstart", onLoadStart);
    applyRate(); // impose la vitesse sur la video fraichement trouvee
  }

  // --- Widget --------------------------------------------------------------

  function makeButton(cls, title, svg, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ytp-button tcs-btn " + cls;
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.innerHTML = svg;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
      btn.blur(); // rend le focus au lecteur (espace = play/pause)
    });
    return btn;
  }

  function buildControl() {
    const wrap = document.createElement("div");
    wrap.className = CONTROL_CLASS;

    const down = makeButton("tcs-down", "Diminuer la vitesse", ICON_DOWN, () =>
      setRate(prevStop(desiredRate)),
    );

    const label = document.createElement("span");
    label.className = LABEL_CLASS;
    label.textContent = formatRate(desiredRate);
    label.title = "Reinitialiser la vitesse (1x)";
    label.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setRate(1);
    });

    const up = makeButton("tcs-up", "Augmenter la vitesse", ICON_UP, () =>
      setRate(nextStop(desiredRate)),
    );

    wrap.append(down, label, up);
    return wrap;
  }

  function ensureWidgets() {
    document.querySelectorAll(".ytp-right-controls").forEach((bar) => {
      if (bar.querySelector("." + CONTROL_CLASS)) return;
      bar.prepend(buildControl());
    });
    updateAllLabels();
  }

  function updateAllLabels() {
    const txt = formatRate(desiredRate);
    document.querySelectorAll("." + LABEL_CLASS).forEach((el) => {
      el.textContent = txt;
    });
  }

  // --- Styles --------------------------------------------------------------

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${CONTROL_CLASS} {
        display: inline-flex;
        align-items: center;
        height: 100%;
        vertical-align: top;
      }
      .tcs-btn.ytp-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 100%;
        padding: 0;
        opacity: 0.9;
      }
      .tcs-btn.ytp-button:hover { opacity: 1; }
      .tcs-btn svg { display: block; width: 24px; height: 24px; }
      .${LABEL_CLASS} {
        min-width: 30px;
        padding: 0 2px;
        text-align: center;
        color: #fff;
        font-size: 109%;
        font-weight: 500;
        line-height: 1;
        cursor: pointer;
        user-select: none;
        white-space: nowrap;
      }
      .${LABEL_CLASS}:hover { text-shadow: 0 0 2px rgba(255, 255, 255, 0.6); }
    `;
    document.head.appendChild(style);
  }

  // --- Init ----------------------------------------------------------------

  let tickScheduled = false;
  function scheduleTick() {
    if (tickScheduled) return;
    tickScheduled = true;
    requestAnimationFrame(() => {
      tickScheduled = false;
      ensureWidgets();
      bindVideo();
    });
  }

  function reapplyAfterNav() {
    resetGraceUntil = Date.now() + 1500;
    ensureWidgets();
    bindVideo();
    applyRate();
    setTimeout(applyRate, 300);
    setTimeout(applyRate, 1000);
  }

  function init() {
    injectStyles();

    // Charge la vitesse memorisee, puis construit / applique.
    try {
      chrome.storage.local.get(STORAGE_KEY, (obj) => {
        void chrome.runtime.lastError;
        const saved = obj && obj[STORAGE_KEY];
        if (typeof saved === "number" && saved > 0)
          desiredRate = clampRate(saved);
        ensureWidgets();
        bindVideo();
        applyRate();
      });
    } catch {
      ensureWidgets();
      bindVideo();
    }

    // Navigation SPA YouTube (changement de video sans rechargement).
    document.addEventListener("yt-navigate-finish", reapplyAfterNav);

    // Reconstructions du DOM (player recree, passage plein ecran, miniplayer…).
    const observer = new MutationObserver(scheduleTick);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    log("initialized");
  }

  init();
})();
