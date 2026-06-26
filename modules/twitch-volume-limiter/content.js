// Twitch — Limiteur de volume — plafonne les pics (cris) sans toucher au son normal.
(() => {
  // Guard : éviter une double exécution si le module est ré-injecté (toggle).
  if (window.__twitchVolumeLimiterLoaded) return;
  window.__twitchVolumeLimiterLoaded = true;

  const TAG = "[Twitch Volume Limiter]";
  const THRESHOLD_KEY = "twitchLimiterThreshold";
  const DEFAULT_THRESHOLD = 0; // dB — 0 = aucune limite (le compresseur est transparent)

  // Réglages fixes du limiteur. knee = 0 (genou dur) -> ZÉRO effet sous le seuil :
  // la voix normale passe intacte, seuls les pics au-dessus du seuil sont matés.
  const KNEE = 0;
  const RATIO = 20; // limiteur (ratio élevé)
  const ATTACK = 0.003; // 3 ms — attrape les cris rapidement
  const RELEASE = 0.25; // 250 ms — relâchement souple, évite le « pompage »

  let audioCtx = null;
  let compressor = null;
  let threshold = DEFAULT_THRESHOLD;
  // Vidéos déjà branchées : createMediaElementSource n'est appelable qu'une seule
  // fois par élément média (un 2e appel jette). WeakSet -> pas de fuite mémoire.
  const connected = new WeakSet();

  // Crée (paresseusement) le contexte + le compresseur partagé, câblé sur la sortie.
  function ensureGraph() {
    if (audioCtx) return;
    const Ctx = window.AudioContext;
    if (!Ctx) {
      console.warn(TAG, "Web Audio API indisponible");
      return;
    }
    audioCtx = new Ctx();
    compressor = audioCtx.createDynamicsCompressor();
    compressor.knee.value = KNEE;
    compressor.ratio.value = RATIO;
    compressor.attack.value = ATTACK;
    compressor.release.value = RELEASE;
    compressor.threshold.value = threshold;
    compressor.connect(audioCtx.destination);
  }

  function applyThreshold() {
    if (compressor) compressor.threshold.value = threshold;
  }

  // Branche un <video> à la chaîne — UNIQUEMENT si le contexte tourne, pour ne
  // JAMAIS couper le son : un élément branché à un contexte suspendu reste muet.
  function attach(video) {
    if (connected.has(video)) return;
    ensureGraph();
    if (!audioCtx || audioCtx.state !== "running") return;
    let source;
    try {
      source = audioCtx.createMediaElementSource(video);
    } catch (e) {
      // Déjà branché ailleurs, ou source cross-origin sans CORS -> on abandonne
      // cet élément (son non filtré) plutôt que de réessayer en boucle.
      console.warn(TAG, "createMediaElementSource impossible :", e.message);
      connected.add(video);
      return;
    }
    connected.add(video);
    source.connect(compressor);
    console.log(TAG, "vidéo branchée au limiteur");
  }

  function scanVideos() {
    document.querySelectorAll("video").forEach(attach);
  }

  // Assure le contexte (resume si suspendu, puis branche) puis branche les vidéos.
  function scan() {
    ensureGraph();
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") {
      audioCtx
        .resume()
        .then(scanVideos)
        .catch(() => {});
    }
    scanVideos();
  }

  // MutationObserver throttlé à 1 scan/frame (Twitch est une SPA très dynamique).
  let scanScheduled = false;
  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      scan();
    });
  }

  // --- Démarrage -----------------------------------------------------------
  chrome.storage.local.get(THRESHOLD_KEY, (res) => {
    const v = res[THRESHOLD_KEY];
    if (typeof v === "number" && isFinite(v)) threshold = v;
    applyThreshold();
    scan();
  });

  // Réglage du curseur en temps réel (popup -> storage -> ici).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[THRESHOLD_KEY]) return;
    const v = changes[THRESHOLD_KEY].newValue;
    if (typeof v === "number" && isFinite(v)) {
      threshold = v;
      applyThreshold();
    }
  });

  // Nouveaux <video> (changement de chaîne, navigation SPA) -> rebrancher.
  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // L'AudioContext démarre souvent « suspended » (autoplay policy) : le 1er geste
  // utilisateur autorise resume(). On s'arme dessus -> le limiteur s'active au
  // premier clic/touche sur la page (avant ça, le son sort normalement, non filtré).
  const onGesture = () => scan();
  window.addEventListener("pointerdown", onGesture, { capture: true });
  window.addEventListener("keydown", onGesture, { capture: true });

  console.log(TAG, "actif");
})();
