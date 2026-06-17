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

  // --- Élément de preview (un seul iframe + thumbnail, réutilisés) ---------
  // Calques (du bas vers le haut) : fond noir (box) < iframe vidéo < thumbnail.
  // La thumbnail (opaque) masque l'iframe pendant son chargement (blanc puis
  // noir) ; quand la vidéo a vraiment des frames, la thumbnail disparaît en
  // fondu et révèle la vidéo en dessous -> jamais d'écran blanc ni noir.
  let box = null; // conteneur flottant
  let frame = null; // iframe player Twitch (vidéo live), en-dessous
  let thumb = null; // <img> thumbnail live, au-dessus (placeholder instantané)
  let currentChannel = null; // chaîne actuellement chargée
  let maxRevealTimer = null; // filet de sécurité
  let graceTimer = null; // délai après le 1er "Playing" sans frames
  let sawPlaying = false; // a-t-on déjà reçu un état "Playing" ?

  function ensureBox() {
    if (box) return box;
    box = document.createElement("div");
    box.id = "trinitx-twitch-preview";
    Object.assign(box.style, {
      position: "fixed",
      width: WIDTH + "px",
      height: HEIGHT + "px",
      top: "0",
      left: "0",
      zIndex: "2147483647",
      borderRadius: "8px",
      overflow: "hidden",
      boxShadow: "0 8px 28px rgba(0, 0, 0, 0.6)",
      background: "#000",
      pointerEvents: "none", // non interactive -> jamais de "hover perdu"
      display: "none",
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
    thumb = document.createElement("img");
    Object.assign(thumb.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block",
      transition: "opacity 0.35s ease",
    });

    box.appendChild(frame);
    box.appendChild(thumb);
    document.body.appendChild(box);
    return box;
  }

  // Place la box à droite de l'élément (bascule à gauche si pas de place),
  // centrée verticalement, en restant dans le viewport.
  function positionBox(rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = rect.right + GAP;
    if (left + WIDTH + MARGIN > vw) left = rect.left - GAP - WIDTH;
    left = Math.max(MARGIN, Math.min(left, vw - WIDTH - MARGIN));
    let top = rect.top + rect.height / 2 - HEIGHT / 2;
    top = Math.max(MARGIN, Math.min(top, vh - HEIGHT - MARGIN));
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
    positionBox(anchorEl.getBoundingClientRect());
    box.style.display = "block";
  }

  function showPreview(channel, anchorEl) {
    ensureBox();
    currentChannel = channel;
    sawPlaying = false;
    clearRevealTimers();
    // État initial : thumbnail visible, vidéo masquée dessous.
    thumb.style.opacity = "1";
    // 1) la vidéo charge derrière, révélée seulement quand elle a des frames
    frame.src = playerUrl(channel);
    // 2) ultime filet de sécurité
    maxRevealTimer = setTimeout(revealVideo, MAX_REVEAL);
    // 3) la box n'apparaît qu'une fois la thumbnail peinte -> aucun écran noir
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
