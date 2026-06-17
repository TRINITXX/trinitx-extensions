// X — Masquer les partenariats rémunérés
// Cache les tweets disclosés comme « Partenariat rémunéré » (paid partnership),
// ET, si le tweet est la tête d'un self-thread, toute la suite du thread.
//
// Détection du marqueur indépendante de la langue : le libellé varie selon la
// locale, mais il pointe toujours vers la page paid-partnerships-policy de X.
//
// Détection du thread indépendante des classes CSS (X les hashe et les fait
// varier entre builds) : on repère géométriquement le trait vertical gris que X
// dessine au-dessus de l'avatar d'un tweet rattaché au tweet précédent. La
// règle se propage de proche en proche (une cellule rattachée à une cellule
// déjà masquée est masquée à son tour), ce qui rattrape aussi les réponses
// rendues paresseusement au scroll.
(() => {
  // Guard: éviter une double exécution si le module est ré-injecté (toggle /
  // reload) alors qu'un onglet x.com est déjà ouvert.
  if (window.__xHideSponsoredLoaded) return;
  window.__xHideSponsoredLoaded = true;

  const TAG = "[X-HideSponsored]";

  const TWEET_SELECTOR = 'article[data-testid="tweet"]';
  // Signal stable et fiable : le marqueur « Partenariat rémunéré » contient
  // toujours ce lien, quelle que soit la langue de l'interface.
  const PARTNERSHIP_LINK = 'a[href*="paid-partnerships-policy"]';
  // Unité de timeline qui enveloppe chaque tweet (positionnée en absolu par X).
  // La cacher (plutôt que l'article seul) évite de laisser un trou.
  const CELL_SELECTOR = 'div[data-testid="cellInnerDiv"]';
  const AVATAR_SELECTOR = '[data-testid="Tweet-User-Avatar"]';
  const HIDDEN_ATTR = "data-trinitx-sponsored";

  let hiddenCount = 0;

  // Vrai si X dessine un trait de connecteur AU-DESSUS de l'avatar, c.-à-d. si
  // ce tweet est rattaché (même thread) au tweet rendu juste au-dessus. La barre
  // est un <div> vide, fin, coloré et aligné verticalement avec l'avatar.
  function hasAboveConnector(article) {
    const avatar = article.querySelector(AVATAR_SELECTOR);
    if (!avatar) return false;
    const a = avatar.getBoundingClientRect();
    if (!a.height) return false; // article masqué -> pas de géométrie
    const midY = a.top + a.height / 2;
    const midX = a.left + a.width / 2;
    return Array.from(article.querySelectorAll("div")).some((d) => {
      if (d.childElementCount !== 0) return false; // une barre est un div vide
      const r = d.getBoundingClientRect();
      if (r.width <= 0 || r.width > 6 || r.height < 8) return false; // fine et assez haute
      if (Math.abs(r.left + r.width / 2 - midX) > a.width) return false; // colonne de l'avatar
      if (r.top + r.height > midY + 2) return false; // doit être au-dessus du centre
      return getComputedStyle(d).backgroundColor !== "rgba(0, 0, 0, 0)"; // trait coloré
    });
  }

  function hideCell(cell) {
    if (cell.getAttribute(HIDDEN_ATTR)) return false;
    cell.setAttribute(HIDDEN_ATTR, "hidden");
    cell.style.display = "none";
    hiddenCount++;
    return true;
  }

  function scan() {
    const cells = Array.from(document.querySelectorAll(CELL_SELECTOR));
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (cell.getAttribute(HIDDEN_ATTR)) continue; // déjà masqué
      const article = cell.querySelector(TWEET_SELECTOR);
      if (!article) continue;

      // 1) Tweet sponsorisé (tête de thread ou tweet isolé).
      if (article.querySelector(PARTNERSHIP_LINK)) {
        if (hideCell(cell)) {
          console.log(
            TAG,
            "tweet sponsorisé masqué (total " + hiddenCount + ")",
          );
        }
        continue;
      }

      // 2) Suite de thread : cellule rattachée (barre au-dessus) à une cellule
      // précédente que NOUS avons masquée. Le test du connecteur n'est évalué
      // que dans ce cas rare -> pas de coût sur le reste du fil.
      const prev = cells[i - 1];
      if (
        prev &&
        prev.getAttribute(HIDDEN_ATTR) &&
        hasAboveConnector(article)
      ) {
        if (hideCell(cell)) {
          console.log(
            TAG,
            "réponse de thread masquée (total " + hiddenCount + ")",
          );
        }
      }
    }
  }

  let scanScheduled = false;
  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      scan();
    });
  }

  function init() {
    scan();

    // X virtualise le fil : re-scanner à mesure que les tweets entrent dans le DOM.
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true });

    // Navigation SPA (l'URL change sans rechargement) — re-scan périodique.
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        scheduleScan();
      }
    }, 1000);

    console.log(TAG, "initialized");
  }

  init();
})();
