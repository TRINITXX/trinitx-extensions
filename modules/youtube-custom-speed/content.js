(() => {
  // YouTube Custom Speed — vitesse de lecture personnalisee via un widget
  // "−  1.5x  +" injecte dans la barre du lecteur. Le chiffre central
  // reinitialise a 1x. La vitesse vaut pour la video courante uniquement : a
  // chaque changement de video on repart a 1x (pas de persistance).
  //
  // Monde MAIN (comme youtube-best-quality) : depuis ~2025 YouTube a decouple
  // l'element <video> de la lecture reelle. Ecrire `video.playbackRate` change
  // bien la propriete mais le lecteur reimpose sa propre vitesse a la lecture
  // (la video reste a 1x). Seul l'API interne `#movie_player.setPlaybackRate()`
  // change vraiment la vitesse — et cette methode n'est visible que dans le
  // monde MAIN. Elle plafonne a 2x (getAvailablePlaybackRates() = [0.25 .. 2]).
  //
  // Garde : evite une double execution si le module est reinjecte (toggle /
  // rechargement) alors qu'un onglet YouTube est deja ouvert.
  if (window.__youtubeCustomSpeedLoaded) return;
  window.__youtubeCustomSpeedLoaded = true;

  const TAG = "[YouTubeCustomSpeed]";

  const STEP = 0.25; // pas fin
  const MIN = 0.25; // plancher
  const MAX = 2; // plafond impose par l'API du lecteur (setPlaybackRate clampe a 2)

  // Paliers parcourus par les boutons −/+ : 0.25 .. 2, alignes sur
  // getAvailablePlaybackRates().
  const STOPS = (() => {
    const s = [];
    for (let r = MIN; r <= MAX + 1e-9; r += STEP) {
      s.push(Math.round(r * 100) / 100);
    }
    return s;
  })();

  const CONTROL_CLASS = "tcs-speed-control";
  const LABEL_CLASS = "tcs-label";
  const STYLE_ID = "tcs-speed-style";

  // Double chevron facon "avance/recul rapide". Glyphe qui remplit le viewBox
  // pour rester compact contre le libelle (taille pilotee par le CSS). On ne
  // garde que le `d` du <path> : le SVG est construit via le DOM (createElementNS)
  // car en monde MAIN YouTube impose Trusted Types et `innerHTML="<svg…>"` jette.
  const SVG_NS = "http://www.w3.org/2000/svg";
  const PATH_DOWN = "M 21 5 L 13 12 L 21 19 Z M 12 5 L 4 12 L 12 19 Z";
  const PATH_UP = "M 3 5 L 11 12 L 3 19 Z M 12 5 L 20 12 L 12 19 Z";

  // Vitesse souhaitee pour la video courante. Repart a 1x a chaque nouvelle video.
  let desiredRate = 1;
  // Pendant cette fenetre (apres un changement de video), on reimpose desiredRate
  // au lieu d'adopter la vitesse que YouTube applique (YouTube persiste nativement
  // la vitesse d'une video a l'autre — on veut justement la forcer a 1x).
  let resetGraceUntil = 0;
  // videoId courant : sert a ne reinitialiser a 1x que sur un VRAI changement de
  // video (pas sur un loadstart de pub / changement de qualite de la meme video).
  let lastVideoId = null;

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

  // Lecteur YouTube : en monde MAIN on voit ses methodes internes (posees par
  // YouTube), notamment setPlaybackRate/getPlaybackRate.
  function getPlayer() {
    const p = document.getElementById("movie_player");
    return p && typeof p.setPlaybackRate === "function" ? p : null;
  }

  function getVideo() {
    return (
      document.querySelector(".html5-main-video") ||
      document.querySelector("#movie_player video") ||
      document.querySelector("video")
    );
  }

  // Vitesse reelle cote lecteur (source de verite YouTube). Fallback sur
  // l'element video si l'API n'est pas encore disponible.
  function getCurrentRate() {
    const player = getPlayer();
    if (player) {
      try {
        return player.getPlaybackRate();
      } catch {
        /* ignore */
      }
    }
    const video = getVideo();
    return video ? video.playbackRate : null;
  }

  // Applique desiredRate via l'API du lecteur. Ecrire directement
  // video.playbackRate ne pilote plus la lecture (YouTube le reimpose).
  function applyRate() {
    const player = getPlayer();
    if (player) {
      let current;
      try {
        current = player.getPlaybackRate();
      } catch {
        current = null;
      }
      if (current !== desiredRate) {
        try {
          player.setPlaybackRate(desiredRate);
        } catch {
          /* ignore */
        }
      }
    }
    updateAllLabels();
  }

  function setRate(r) {
    desiredRate = clampRate(r);
    applyRate();
  }

  // --- Detection de changement de video ------------------------------------

  function currentVideoId() {
    const q = location.search.match(/[?&]v=([^&]+)/);
    if (q) return q[1];
    const s = location.pathname.match(/^\/shorts\/([^/?]+)/);
    return s ? s[1] : null;
  }

  // Met a jour lastVideoId ; renvoie true si on vient d'arriver sur une nouvelle
  // video (id different du precedent).
  function syncVideoId() {
    const id = currentVideoId();
    if (id && id !== lastVideoId) {
      lastVideoId = id;
      return true;
    }
    return false;
  }

  // --- Synchro avec les changements de vitesse du lecteur ------------------

  function onRateChange() {
    const r = getCurrentRate();
    if (r == null || r === desiredRate) return; // notre propre changement -> rien

    // Une nouvelle video remet la vitesse a 1x : pendant la fenetre de grace on
    // reimpose desiredRate plutot que de l'adopter.
    if (Date.now() < resetGraceUntil) {
      applyRate();
      return;
    }

    // Sinon : l'utilisateur a change la vitesse via le menu natif YouTube.
    // On adopte sa valeur pour rester synchronise.
    desiredRate = clampRate(r);
    updateAllLabels();
  }

  // Rafale de reimpositions : au chargement / apres navigation, le lecteur
  // repart a 1x et l'API (#movie_player) n'est pas toujours prete tout de suite.
  let burstTimers = [];
  function burstApplyRate() {
    burstTimers.forEach(clearTimeout);
    burstTimers = [0, 300, 800, 1500, 3000].map((d) =>
      setTimeout(applyRate, d),
    );
  }

  function onLoadStart() {
    // Nouveau media. Si c'est une nouvelle video -> on repart a 1x ; sinon (pub
    // ou changement de qualite sur la meme video) on garde la vitesse courante.
    // La grace couvre tout le burst pour battre la vitesse persistee de YouTube.
    if (syncVideoId()) desiredRate = 1;
    resetGraceUntil = Date.now() + 3500;
    burstApplyRate();
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

  // Construit l'icone SVG via le DOM (createElementNS) plutot qu'innerHTML :
  // en monde MAIN, la CSP Trusted Types de YouTube fait jeter innerHTML.
  function makeIcon(pathD) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "#fff");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", pathD);
    svg.appendChild(path);
    return svg;
  }

  function makeButton(cls, title, pathD, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ytp-button tcs-btn " + cls;
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.appendChild(makeIcon(pathD));
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

    const down = makeButton("tcs-down", "Diminuer la vitesse", PATH_DOWN, () =>
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

    const up = makeButton("tcs-up", "Augmenter la vitesse", PATH_UP, () =>
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
    // Changement de video en SPA : on repart a 1x si le videoId a change.
    if (syncVideoId()) desiredRate = 1;
    resetGraceUntil = Date.now() + 3500;
    ensureWidgets();
    bindVideo();
    burstApplyRate();
  }

  function init() {
    injectStyles();

    // Demarre a 1x (pas de persistance) et force cette valeur via la grace, meme
    // si YouTube a memorise une autre vitesse. On note le videoId courant pour
    // detecter les prochains changements de video.
    syncVideoId();
    desiredRate = 1;
    resetGraceUntil = Date.now() + 3500;
    ensureWidgets();
    bindVideo();
    burstApplyRate();

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
