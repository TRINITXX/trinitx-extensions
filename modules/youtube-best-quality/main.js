// YouTube — Meilleure qualité — force la plus haute résolution disponible.
// Monde MAIN : on appelle l'API interne du lecteur (#movie_player), invisible
// depuis le monde ISOLATED. Pas de simulation de clics dans le menu Réglages
// (fragile, i18n, visible) — on pilote directement le player.
//
//   getAvailableQualityLevels() -> ["hd2160","hd1440","hd1080",…,"auto"]
//   setPlaybackQualityRange(best, best) -> verrouille la qualité (méthode moderne)
//   setPlaybackQuality(best)            -> fallback hérité
//
// Comportement fixe (pas de réglage) : toujours le maximum absolu.
(() => {
  // Garde : évite une double exécution si le module est ré-injecté (toggle /
  // rechargement) alors qu'un onglet YouTube est déjà ouvert.
  if (window.__youtubeBestQualityLoaded) return;
  window.__youtubeBestQualityLoaded = true;

  const TAG = "[YouTubeBestQuality]";

  // Rang des labels de qualité YouTube (plus grand = meilleur). On choisit le
  // meilleur via ce barème plutôt qu'en se fiant à l'ordre du tableau renvoyé.
  const QUALITY_RANK = {
    highres: 9, // ancien label > 1080p
    hd2880: 8, // 5K
    hd2160: 7, // 4K
    hd1440: 6, // 1440p
    hd1080: 5, // 1080p
    hd720: 4, // 720p
    large: 3, // 480p
    medium: 2, // 360p
    small: 1, // 240p
    tiny: 0, // 144p
  };

  function log(...args) {
    console.log(TAG, ...args);
  }

  function getPlayer() {
    const p = document.getElementById("movie_player");
    // En MAIN world on voit les méthodes du lecteur posées par YouTube.
    return p && typeof p.getAvailableQualityLevels === "function" ? p : null;
  }

  // Meilleur label réellement disponible (hors "auto"), ou null si la liste
  // n'est pas encore peuplée (les niveaux HD arrivent souvent en différé).
  function bestAvailable(player) {
    let levels;
    try {
      levels = player.getAvailableQualityLevels();
    } catch {
      return null;
    }
    if (!levels || !levels.length) return null;
    let best = null;
    let bestRank = -1;
    for (const lvl of levels) {
      if (lvl === "auto") continue;
      const rank = QUALITY_RANK[lvl];
      if (rank === undefined) continue; // label inconnu -> on ignore
      if (rank > bestRank) {
        bestRank = rank;
        best = lvl;
      }
    }
    return best;
  }

  // Applique le meilleur niveau si on n'y est pas déjà. Idempotent : une fois la
  // qualité verrouillée, getPlaybackQuality() renvoie `best` -> plus aucun appel.
  function applyBest() {
    const player = getPlayer();
    if (!player) return;

    const best = bestAvailable(player);
    if (!best) return; // niveaux pas encore prêts

    let current;
    try {
      current = player.getPlaybackQuality();
    } catch {
      current = null;
    }
    if (current === best) return;

    try {
      if (typeof player.setPlaybackQualityRange === "function") {
        player.setPlaybackQualityRange(best, best);
      }
      if (typeof player.setPlaybackQuality === "function") {
        player.setPlaybackQuality(best);
      }
      log("qualité forcée ->", best);
    } catch (e) {
      log("échec setPlaybackQuality:", e && e.message);
    }
  }

  // Rafale de tentatives : au chargement / après navigation, la liste des
  // niveaux se peuple progressivement. On réessaie sur ~6 s puis on s'arrête
  // (l'observer + les events vidéo prennent ensuite le relais).
  let burstTimers = [];
  function burstApply() {
    burstTimers.forEach(clearTimeout);
    burstTimers = [0, 300, 800, 1500, 3000, 6000].map((d) =>
      setTimeout(applyBest, d),
    );
  }

  // Nouveau média sur l'élément <video> : YouTube peut repartir en auto.
  function bindVideo() {
    const video = document.querySelector(
      ".html5-main-video, #movie_player video, video",
    );
    if (!video || video.__ybqBound) return;
    video.__ybqBound = true;
    video.addEventListener("loadstart", burstApply);
    video.addEventListener("canplay", applyBest);
  }

  // Reconstructions du DOM (player recréé, plein écran, miniplayer…) : tick
  // debounce en rAF, peu coûteux car applyBest ne fait rien si déjà au max.
  let tickScheduled = false;
  function scheduleTick() {
    if (tickScheduled) return;
    tickScheduled = true;
    requestAnimationFrame(() => {
      tickScheduled = false;
      bindVideo();
      applyBest();
    });
  }

  function init() {
    bindVideo();
    burstApply();

    // Navigation SPA YouTube (changement de vidéo sans rechargement complet).
    document.addEventListener("yt-navigate-finish", () => {
      bindVideo();
      burstApply();
    });

    const observer = new MutationObserver(scheduleTick);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    log("initialized");
  }

  init();
})();
