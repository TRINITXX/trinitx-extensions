// Pilote le lecteur Twitch pour le PiP « Document » : qualite maximale,
// volume, et bouton PiP de BTTV detourne vers la fenetre maison. Monde MAIN :
// le lecteur n'est joignable que par l'arbre React de la page, et BTTV y
// tourne aussi. Content script du module PiP (document_start), et injecte par
// background.js avant chaque ouverture au raccourci.
// doc-pip.js (monde isole) parle par le DOM, partage entre les mondes :
// - attribut data-trinitx-doc-pip sur <html> tant que le PiP est ouvert ;
// - evenement "trinitx-pip-volume" (detail : volume de 0 a 1) sur document.
//
// Qualite : en mode Auto, le lecteur plafonne la qualite a la taille de sa
// video (setAutoViewportSize). Une fois la video dans la petite fenetre PiP,
// il descend seul a 360p. Le PiP natif n'a pas ce souci (la video reste dans
// la page).
(() => {
  if (window.__trinitxPipPlayer) return;
  window.__trinitxPipPlayer = true;

  const ATTR = "data-trinitx-doc-pip";
  const CHECK_MS = 5000; // Twitch peut re-baisser la qualite : on la reverifie
  const CACHE_MS = 2000; // le curseur de volume appelle findPlayer en rafale

  let timer = 0;
  let before = null; // { auto, quality } avant le PiP, remis a la fermeture
  let cached = null;
  let cachedAt = 0;

  // Instance du lecteur : props.mediaPlayerInstance d'un composant React.
  function findPlayer() {
    if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
    cached = null;
    const root = document.querySelector("#root");
    const key = root && Object.keys(root).find((k) => k.startsWith("__reactContainer"));
    const stack = key ? [root[key]] : [];
    while (stack.length) {
      const fiber = stack.pop();
      const p = fiber.memoizedProps && fiber.memoizedProps.mediaPlayerInstance;
      if (p) {
        cached = p.playerInstance || p;
        cachedAt = Date.now();
        break;
      }
      if (fiber.sibling) stack.push(fiber.sibling);
      if (fiber.child) stack.push(fiber.child);
    }
    return cached;
  }

  function bestQuality(player) {
    let best = null;
    for (const q of player.getQualities() || []) {
      if (!best || (q.height || 0) > (best.height || 0) ||
          ((q.height || 0) === (best.height || 0) && (q.bitrate || 0) > (best.bitrate || 0))) {
        best = q;
      }
    }
    return best;
  }

  function enforce() {
    try {
      const player = findPlayer();
      if (!player || typeof player.setQuality !== "function") return;
      if (!before) before = { auto: player.isAutoQualityMode(), quality: player.getQuality() };
      const best = bestQuality(player);
      if (!best) return;
      const cur = player.getQuality();
      if (player.isAutoQualityMode() || !cur || cur.name !== best.name) player.setQuality(best);
    } catch (e) {
      console.warn("[PipPlayer] lecteur Twitch inaccessible:", e.message);
    }
  }

  function start() {
    if (timer) return;
    enforce();
    timer = setInterval(enforce, CHECK_MS);
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = 0;
    // Remet le reglage d'avant : Auto, ou la qualite choisie a la main.
    try {
      const player = findPlayer();
      if (player && before) {
        if (before.auto) player.setAutoQualityMode(true);
        else if (before.quality) player.setQuality(before.quality);
      }
    } catch (e) {
      console.warn("[PipPlayer] qualite d'avant non remise:", e.message);
    }
    before = null;
  }

  const sync = () => (document.documentElement.hasAttribute(ATTR) ? start() : stop());
  new MutationObserver(sync).observe(document.documentElement, {
    attributes: true,
    attributeFilter: [ATTR],
  });
  sync();

  // Bouton PiP de BTTV (monde MAIN, appelle video.requestPictureInPicture()) :
  // au lieu du PiP natif, doc-pip.js ouvre la fenetre maison, sans PiP natif
  // qui s'affiche puis disparait. doc-pip.js accepte par preventDefault ; sans
  // reponse (extension rechargee, module coupe, doc-pip.js absent), le PiP
  // natif part comme avant. Le repli natif de background.js passe toujours
  // (marque data-trinitx-native-pip).
  const nativeRequest = HTMLVideoElement.prototype.requestPictureInPicture;
  HTMLVideoElement.prototype.requestPictureInPicture = function (...args) {
    const root = document.documentElement;
    if (root.hasAttribute("data-trinitx-native-pip") || !root.hasAttribute("data-trinitx-pip-ready")) {
      return nativeRequest.apply(this, args);
    }
    // Video deja dans la fenetre PiP : l'ecouteur est sur le document de la page.
    const target = this.ownerDocument === document ? this : document;
    const ev = new CustomEvent("trinitx-pip-request", { bubbles: true, composed: true, cancelable: true });
    if (target.dispatchEvent(ev)) return nativeRequest.apply(this, args);
    // BTTV n'attend pas de resultat ; une promesse resolue evite une erreur en console.
    return Promise.resolve();
  };

  // Volume par le lecteur (pas par la <video>) : Twitch garde son curseur et
  // son reglage memorise d'accord avec la fenetre PiP.
  document.addEventListener("trinitx-pip-volume", (e) => {
    const v = Number(e.detail);
    if (!Number.isFinite(v)) return;
    try {
      const player = findPlayer();
      if (!player) return;
      player.setVolume(Math.min(1, Math.max(0, v)));
      if (v > 0 && player.isMuted()) player.setMuted(false);
    } catch (err) {
      console.warn("[PipPlayer] volume impossible:", err.message);
    }
  });
})();
