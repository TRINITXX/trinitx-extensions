// Twitch — Preview au survol — preview vidéo live de la chaîne survolée dans les listes
(() => {
  // Guard: éviter une double exécution si le module est ré-injecté (toggle).
  if (window.__twitchPreviewLoaded) return;
  window.__twitchPreviewLoaded = true;

  const TAG = "[Twitch Preview]";

  // --- Réglages (faciles à ajuster) ----------------------------------------
  const WIDTH = 400; // largeur de la preview (px)
  const HEIGHT = Math.round((WIDTH * 9) / 16); // 16:9 -> 225
  const SHOW_DELAY = 100; // délai de survol avant affichage (ms)
  const GAP = 12; // marge entre l'item survolé et la preview (px)
  const MARGIN = 8; // marge mini avec le bord du viewport (px)
  // On ne révèle la vidéo que lorsque le player a vraiment des frames à
  // l'écran. Si le signal "Playing" arrive sans frames signalées, on patiente
  // PLAYING_GRACE ms (les frames sont alors quasi certainement là). MAX_REVEAL
  // = ultime filet de sécurité (chaîne hors-ligne, messages non reçus...).
  const PLAYING_GRACE = 700; // ms
  const MAX_REVEAL = 6000; // ms

  // Premier segment d'URL qui n'est PAS une chaîne (routes connues de Twitch).
  const NON_CHANNEL = new Set([
    "directory",
    "settings",
    "videos",
    "following",
    "subscriptions",
    "wallet",
    "drops",
    "friends",
    "popout",
    "u",
    "user",
    "search",
    "downloads",
    "jobs",
    "turbo",
    "prime",
    "store",
    "p",
    "team",
    "broadcast",
    "dashboard",
    "moderator",
    "payments",
    "inventory",
    "messages",
    "notifications",
    "collections",
    "communities",
    "clips",
    "bits",
    "redeem",
    "creatorcamp",
    "event",
    "events",
    "products",
  ]);

  // Noms d'utilisateur Twitch : 2-25 caractères alphanumériques + underscore.
  const CHANNEL_RE = /^[a-zA-Z0-9_]{2,25}$/;

  // Extrait un nom de chaîne valide depuis un href, sinon null.
  function channelFromHref(href) {
    if (!href) return null;
    let url;
    try {
      url = new URL(href, location.href);
    } catch {
      return null;
    }
    if (!/(^|\.)twitch\.tv$/.test(url.hostname)) return null;
    const segs = url.pathname.split("/").filter(Boolean);
    if (segs.length !== 1) return null; // /<chaîne> uniquement (pas /videos, /x/clip…)
    const name = segs[0];
    if (!CHANNEL_RE.test(name)) return null;
    if (NON_CHANNEL.has(name.toLowerCase())) return null;
    return name.toLowerCase();
  }

  // URL de la thumbnail live (placeholder instantané) et du player embarqué.
  function thumbUrl(channel) {
    return (
      "https://static-cdn.jtvnw.net/previews-ttv/live_user_" +
      encodeURIComponent(channel) +
      "-" +
      WIDTH +
      "x" +
      HEIGHT +
      ".jpg"
    );
  }
  function playerUrl(channel) {
    // parent = domaine de la page hôte (ex. www.twitch.tv) — exigé par l'embed.
    return (
      "https://player.twitch.tv/?channel=" +
      encodeURIComponent(channel) +
      "&parent=" +
      encodeURIComponent(location.hostname) +
      "&muted=true&autoplay=true&controls=false"
    );
  }

  // Préchargement des thumbnails : lancé dès le survol d'un lien-chaîne (avant
  // même l'affichage), pour que l'image soit déjà en cache navigateur au moment
  // du show -> swap instantané, sans fond noir transitoire. Cache borné (les
  // thumbnails sont légères et le navigateur garde sa propre copie en cache).
  const thumbPreload = new Map(); // channel -> HTMLImageElement
  function preloadThumb(channel) {
    let img = thumbPreload.get(channel);
    if (img) return img;
    img = new Image();
    img.src = thumbUrl(channel);
    thumbPreload.set(channel, img);
    if (thumbPreload.size > 40) {
      thumbPreload.delete(thumbPreload.keys().next().value); // FIFO
    }
    return img;
  }

  // --- Élément de preview (un seul iframe + thumbnail, réutilisés) ---------
  // Structure (de haut en bas) : box [ bandeau titre | zone vidéo ].
  // Dans la zone vidéo, calques (du bas vers le haut) : fond noir < iframe
  // vidéo < thumbnail. La thumbnail (opaque) masque l'iframe pendant son
  // chargement (blanc puis noir) ; quand la vidéo a vraiment des frames, la
  // thumbnail disparaît en fondu et révèle la vidéo -> jamais d'écran blanc ni
  // noir. Le bandeau titre reprend le titre du tooltip natif de Twitch.
  let box = null; // conteneur flottant
  let titleBar = null; // bandeau titre (au-dessus de la vidéo)
  let titleText = null; // titre du stream (ligne principale)
  let metaText = null; // chaîne · jeu · statut (ligne secondaire)
  let frame = null; // iframe player Twitch (vidéo live), en-dessous
  let thumb = null; // <img> thumbnail live, au-dessus (placeholder instantané)
  let currentChannel = null; // chaîne actuellement chargée
  let maxRevealTimer = null; // filet de sécurité
  let graceTimer = null; // délai après le 1er "Playing" sans frames
  let titlePollTimer = null; // attente de l'apparition du tooltip natif
  let sawPlaying = false; // a-t-on déjà reçu un état "Playing" ?

  function ensureBox() {
    if (box) return box;
    box = document.createElement("div");
    box.id = "trinitx-twitch-preview";
    Object.assign(box.style, {
      position: "fixed",
      width: WIDTH + "px",
      top: "0",
      left: "0",
      zIndex: "2147483647",
      borderRadius: "8px",
      overflow: "hidden",
      boxShadow: "0 8px 28px rgba(0, 0, 0, 0.6)",
      background: "#18181b",
      pointerEvents: "none", // non interactive -> jamais de "hover perdu"
      display: "none",
      fontFamily:
        "Inter, Roobert, 'Helvetica Neue', Helvetica, Arial, sans-serif",
    });

    // Bandeau titre (au-dessus de la vidéo) : reprend le titre du stream lu
    // dans le tooltip natif de Twitch (sidebar), avec le nom de chaîne en
    // placeholder le temps que ce tooltip apparaisse.
    titleBar = document.createElement("div");
    Object.assign(titleBar.style, {
      padding: "9px 12px 10px",
      background: "#18181b",
      color: "#efeff1",
      boxSizing: "border-box",
    });
    titleText = document.createElement("div");
    Object.assign(titleText.style, {
      fontSize: "13px",
      fontWeight: "600",
      lineHeight: "1.3",
      display: "-webkit-box",
      WebkitBoxOrient: "vertical",
      WebkitLineClamp: "2", // titre tronqué à 2 lignes max
      overflow: "hidden",
    });
    metaText = document.createElement("div");
    Object.assign(metaText.style, {
      fontSize: "12px",
      color: "#adadb8",
      marginTop: "3px",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    });
    titleBar.appendChild(titleText);
    titleBar.appendChild(metaText);

    // Zone vidéo (hauteur fixe 16:9) : conteneur des calques frame + thumb.
    const videoWrap = document.createElement("div");
    Object.assign(videoWrap.style, {
      position: "relative",
      width: "100%",
      height: HEIGHT + "px",
      overflow: "hidden",
      background: "#000",
    });

    // Vidéo live (calque du dessous), opaque mais masquée par la thumbnail.
    frame = document.createElement("iframe");
    Object.assign(frame.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      border: "0",
      display: "block",
    });
    frame.setAttribute("allow", "autoplay");
    frame.setAttribute("scrolling", "no");

    // Thumbnail live (calque du dessus) : masque l'iframe jusqu'à la 1re frame.
    // Fond noir : sert de placeholder neutre quand on efface l'image courante
    // lors d'un changement de chaîne (cf. showPreview), pour ne jamais laisser
    // apparaître la thumbnail de la chaîne précédente le temps du chargement.
    thumb = document.createElement("img");
    Object.assign(thumb.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block",
      background: "#000",
      transition: "opacity 0.35s ease",
    });

    videoWrap.appendChild(frame);
    videoWrap.appendChild(thumb);
    box.appendChild(titleBar);
    box.appendChild(videoWrap);
    document.body.appendChild(box);
    return box;
  }

  // Lit le titre du stream dans le tooltip natif de Twitch (sidebar). Classe
  // BEM stable (contrairement aux hash styled-components). Renvoie null si
  // absent (ex. hors sidebar : grille directory, recherche...).
  function readTitleInfo() {
    const body = document.querySelector(
      ".online-side-nav-channel-tooltip__body",
    );
    if (!body) return null;
    const ps = body.querySelectorAll("p");
    const head = ps[0] ? ps[0].textContent.trim() : ""; // "Chaîne · Jeu"
    const title = ps[1] ? ps[1].textContent.trim() : ""; // titre du stream
    const statusEl = body.querySelector(
      ".online-side-nav-channel-tooltip__text",
    );
    const status = statusEl ? statusEl.textContent.trim() : "";
    const main = title || head;
    if (!main) return null;
    const metaParts = (title ? [head] : []).concat(status ? [status] : []);
    return { main, meta: metaParts.join(" · ") };
  }

  function setTitleBar(info) {
    if (!titleText) return;
    titleText.textContent = info.main;
    metaText.textContent = info.meta;
    metaText.style.display = info.meta ? "block" : "none";
  }

  function clearTitlePoll() {
    clearTimeout(titlePollTimer);
    titlePollTimer = null;
  }

  // On sonde ~3 s après l'affichage de la preview. Deux rôles : (1) lire le
  // titre du tooltip classique dès qu'il apparaît pour remplir notre bandeau ;
  // (2) recaler la box dès qu'un tooltip SQUAD apparaît/grandit, pour ne pas le
  // recouvrir (ce tooltip survient souvent après la preview et n'a pas de titre
  // lisible via readTitleInfo, d'où le découplage du recalage et du titre).
  function pollTitle(channel, ticks) {
    if (currentChannel !== channel) return;
    ticks = (ticks || 0) + 1;
    const info = readTitleInfo();
    if (info) setTitleBar(info);
    if (boxVisible() && currentAnchor && squadTooltipRect()) {
      positionBox(currentAnchor.getBoundingClientRect());
    }
    if (ticks < 25) {
      titlePollTimer = setTimeout(() => pollTitle(channel, ticks), 120);
    }
  }

  // Rect du tooltip natif de Twitch (sidebar) s'il est affiché, sinon null.
  // Sert à caler la preview À CÔTÉ de ce tooltip plutôt que par-dessus, pour ne
  // pas masquer l'encart « squad stream » (« En live avec … ») qu'il contient.
  // On ne décale la preview QUE pour le tooltip « squad / guest star » (collab
  // « En live avec … »), dont l'info n'est PAS reprise dans notre bandeau. Pour
  // le tooltip de chaîne classique (juste un titre), on laisse la preview le
  // recouvrir : son titre est déjà affiché au-dessus de la preview -> pas de
  // doublon. (Classe spécifique : side-nav-guest-star-tooltip__body.)
  function squadTooltipRect() {
    const body = document.querySelector(".side-nav-guest-star-tooltip__body");
    if (!body) return null;
    // Conteneur « balloon » englobant tout le tooltip squad. .tw-balloon est la
    // classe Twitch stable de ce conteneur.
    const container = body.closest(".tw-balloon") || body.parentElement || body;
    const r = container.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return r;
  }

  // Place la box à droite de l'élément (bascule à gauche si pas de place),
  // centrée verticalement, en restant dans le viewport. Si un tooltip SQUAD est
  // visible, on se cale au-delà de SES bords (et non de l'item) pour ne jamais
  // le recouvrir. (Le tooltip classique, lui, est volontairement recouvert.)
  function positionBox(rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const boxH = box.offsetHeight || HEIGHT; // bandeau titre + vidéo
    const squad = squadTooltipRect();
    const rightEdge = squad ? Math.max(rect.right, squad.right) : rect.right;
    const leftEdge = squad ? Math.min(rect.left, squad.left) : rect.left;
    let left = rightEdge + GAP;
    if (left + WIDTH + MARGIN > vw) left = leftEdge - GAP - WIDTH;
    left = Math.max(MARGIN, Math.min(left, vw - WIDTH - MARGIN));
    let top = rect.top + rect.height / 2 - boxH / 2;
    top = Math.max(MARGIN, Math.min(top, vh - boxH - MARGIN));
    box.style.left = Math.round(left) + "px";
    box.style.top = Math.round(top) + "px";
  }

  function clearRevealTimers() {
    clearTimeout(maxRevealTimer);
    clearTimeout(graceTimer);
    maxRevealTimer = null;
    graceTimer = null;
  }

  // Fait disparaître la thumbnail en fondu pour révéler la vidéo en dessous.
  function revealVideo() {
    clearRevealTimers();
    if (thumb) thumb.style.opacity = "0";
  }

  function placeAndShow(anchorEl) {
    box.style.display = "block"; // visible d'abord -> offsetHeight mesurable
    positionBox(anchorEl.getBoundingClientRect());
  }

  function showPreview(channel, anchorEl) {
    ensureBox();
    const switching = boxVisible(); // box déjà à l'écran -> simple changement de chaîne
    currentChannel = channel;
    sawPlaying = false;
    clearRevealTimers();
    clearTitlePoll();
    // Titre : placeholder (nom de chaîne) tant que le tooltip natif n'est pas
    // là, puis remplacé par le vrai titre dès qu'il apparaît.
    setTitleBar({
      main: channel.charAt(0).toUpperCase() + channel.slice(1),
      meta: "",
    });
    pollTitle(channel);
    thumb.style.opacity = "1";
    // Thumbnail préchargée (dès le survol) ? Si elle est déjà en cache, on
    // garde l'image courante affichée jusqu'au swap, qui sera instantané ->
    // aucun fond noir, aucune chaîne précédente visible. Sinon, on efface
    // l'image courante : son fond noir sert de placeholder neutre le temps du
    // chargement (sans quoi l'<img> garderait la chaîne PRÉCÉDENTE affichée).
    const pre = preloadThumb(channel);
    const ready = pre.complete && pre.naturalWidth > 0;
    if (!ready) thumb.removeAttribute("src");
    // Box déjà visible : on la recale tout de suite sur la nouvelle ancre sans
    // attendre le onload de la thumbnail.
    if (switching) placeAndShow(anchorEl);
    // 1) la vidéo charge derrière, révélée seulement quand elle a des frames
    frame.src = playerUrl(channel);
    // 2) ultime filet de sécurité
    maxRevealTimer = setTimeout(revealVideo, MAX_REVEAL);
    // 3) (1re ouverture) la box n'apparaît qu'une fois la thumbnail peinte
    thumb.onload = () => {
      if (currentChannel === channel) placeAndShow(anchorEl);
    };
    thumb.onerror = () => {
      if (currentChannel !== channel) return;
      thumb.style.opacity = "0"; // pas de thumbnail (hors-ligne / 404)
      placeAndShow(anchorEl);
    };
    thumb.src = thumbUrl(channel);
  }

  function hidePreview() {
    if (!box) return;
    box.style.display = "none";
    currentChannel = null;
    sawPlaying = false;
    clearRevealTimers();
    clearTitlePoll();
    thumb.onload = null;
    thumb.onerror = null;
    frame.src = "about:blank"; // coupe le flux -> rien ne tourne en fond
    thumb.style.opacity = "1";
    thumb.removeAttribute("src");
  }

  // Le player iframe poste ~1 message/s. On révèle quand il est "Playing" ET
  // qu'il a de vraies frames (videoResolution != 0x0 / playbackRate > 0), pour
  // ne jamais révéler un iframe encore blanc. Sinon, petit délai de grâce.
  function onPlayerMessage(e) {
    if (e.origin !== "https://player.twitch.tv") return;
    if (!frame || e.source !== frame.contentWindow) return;
    let data = e.data;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        return;
      }
    }
    if (!data || data.namespace !== "twitch-embed-player-proxy") return;
    const p = data.params || {};
    const playing =
      typeof p.playback === "string" && p.playback.toLowerCase() === "playing";
    if (!playing) return;
    const v = (p.stats && p.stats.video) || {};
    const res = v.videoResolution || "";
    const hasFrames = (res && res !== "0x0") || (v.playbackRate || 0) > 0;
    if (hasFrames) {
      revealVideo();
    } else if (!sawPlaying) {
      sawPlaying = true;
      clearTimeout(graceTimer);
      graceTimer = setTimeout(revealVideo, PLAYING_GRACE);
    }
  }
  window.addEventListener("message", onPlayerMessage);

  // --- Logique de survol : pilotée par pointermove --------------------------
  // Robuste aux mutations DOM de Twitch (réordonnancement de la sidebar par
  // nombre de spectateurs, hover-card, re-render React) : une souris IMMOBILE
  // ne génère aucun event, donc la preview ne se ferme jamais toute seule.
  let showTimer = null;
  let hideTimer = null;
  let pendingChannel = null; // chaîne programmée pour affichage
  let currentAnchor = null; // dernier lien-chaîne survolé (pour (re)positionner)
  const HIDE_GRACE = 200; // ms avant masquage quand la souris quitte les liens

  function boxVisible() {
    return box && box.style.display !== "none";
  }
  function clearShowTimer() {
    clearTimeout(showTimer);
    showTimer = null;
  }
  function clearHideTimer() {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  function scheduleHide() {
    if (hideTimer) return;
    hideTimer = setTimeout(() => {
      hideTimer = null;
      pendingChannel = null;
      currentAnchor = null;
      clearShowTimer();
      hidePreview();
    }, HIDE_GRACE);
  }

  document.addEventListener(
    "pointermove",
    (e) => {
      const t = e.target;
      if (!t || !t.closest) return;
      const a = t.closest("a[href]");
      const channel = a
        ? channelFromHref(a.getAttribute("href") || a.href)
        : null;

      if (channel) {
        clearHideTimer();
        currentAnchor = a; // ancre fraîche (résiste aux re-render de Twitch)
        preloadThumb(channel); // précharge dès le survol -> swap sans fond noir
        if (channel === currentChannel || channel === pendingChannel) return;
        pendingChannel = channel;
        clearShowTimer();
        showTimer = setTimeout(() => {
          if (pendingChannel) showPreview(pendingChannel, currentAnchor);
        }, SHOW_DELAY);
      } else if (boxVisible() || showTimer) {
        // Souris hors de tout lien-chaîne -> masquer (avec délai de grâce).
        clearShowTimer();
        pendingChannel = null;
        scheduleHide();
      }
    },
    { passive: true },
  );

  // Souris qui quitte complètement la fenêtre -> masquer.
  document.addEventListener("pointerleave", () => {
    clearShowTimer();
    pendingChannel = null;
    if (boxVisible()) scheduleHide();
  });

  // Au scroll, l'ancre se déplace : on repositionne la preview dessus, ou on la
  // masque seulement si l'ancre est sortie de l'écran (jamais sur simple scroll).
  window.addEventListener(
    "scroll",
    () => {
      if (!boxVisible() || !currentAnchor) return;
      const rect = currentAnchor.getBoundingClientRect();
      const offscreen =
        rect.bottom <= 0 ||
        rect.top >= window.innerHeight ||
        (rect.width === 0 && rect.height === 0);
      if (offscreen) {
        pendingChannel = null;
        currentAnchor = null;
        hidePreview();
      } else {
        positionBox(rect);
      }
    },
    true,
  );

  console.log(TAG, "actif");
})();
