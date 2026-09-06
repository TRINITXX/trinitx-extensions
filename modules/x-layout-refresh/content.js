// X — Mise en page figee — detecte une mise en page restee plus large que la
// fenetre et force X a remesurer, comme le fait un aller-retour F11.
(() => {
  // Guard : eviter une double execution si le module est re-injecte (toggle).
  if (window.__xLayoutRefreshLoaded) return;
  window.__xLayoutRefreshLoaded = true;

  const TAG = "[X Layout Refresh]";

  // Pourquoi ce module existe
  // -------------------------
  // X ne pilote PAS la largeur de ses colonnes en CSS : ses seules media
  // queries s'arretent a 600px. Au-dela, la largeur des trois colonnes est
  // calculee en JS a partir de la largeur mesuree du conteneur racine.
  //
  // Un onglet cache (ou une fenetre entierement recouverte) ne rend plus rien :
  // si la page se charge — ou si la fenetre change de taille — pendant ce
  // temps, X reste sur l'ancienne mesure. Symptome verifie en reproduisant le
  // cas a la main : conteneur racine a 1450px dans une fenetre de 1150px ->
  // barre de navigation a 274px ("en grand", libelles + gros bouton Poster) au
  // lieu de 124px, et barre de defilement horizontale.
  //
  // Le correctif ne peut PAS se faire depuis la page : verifie sur le cas reel,
  // retrecir <html> d'un pixel ne change rien, X pose sa largeur en dur et ne la
  // recalcule que sur un vrai changement du viewport. C'est le service worker
  // qui applique le geste (evenement resize, puis aller-retour de zoom, puis
  // aller-retour d'un pixel sur la fenetre), d'ou le message "fix-x-layout".

  // Pages laissees tranquilles a la demande. X etant une application a une
  // seule page, l'URL change sans rechargement : on la revoit a chaque controle
  // plutot qu'une fois au demarrage.
  const SKIP_PATHS = ["/home"];
  const onSkippedPage = () => SKIP_PATHS.includes(location.pathname);

  // Ecart tolere entre la mise en page de X et la fenetre, en pixels.
  const SLACK = 2;
  // Delai minimum entre deux corrections.
  const COOLDOWN = 800;
  // Au-dela, on arrete d'insister : le debordement vient d'ailleurs.
  const MAX_TRIES = 3;

  let lastNudge = 0;
  let tries = 0;
  let fixes = 0;
  let observed = null;
  let observer = null;

  document.documentElement.dataset.xLayoutRefresh = "actif";

  // Conteneur qui porte la largeur de mise en page de X (parent direct des
  // trois colonnes). Sa largeur vaut normalement celle de la fenetre.
  function layoutRoot() {
    const banner = document.querySelector('header[role="banner"]');
    return banner ? banner.parentElement : null;
  }

  // De combien la mise en page de X depasse-t-elle la fenetre ?
  // Deux mesures complementaires : le debordement horizontal global (les
  // colonnes de X ont des largeurs calculees en JS et posees en dur, c'est
  // elles qui depassent) et la largeur du conteneur racine.
  function overflowWidth() {
    const de = document.documentElement;
    const root = layoutRoot();
    const rootWidth = root ? root.getBoundingClientRect().width : 0;
    return Math.max(de.scrollWidth, rootWidth) - de.clientWidth;
  }

  // Attente d'une frame, avec un secours : dans un onglet en arriere-plan
  // requestAnimationFrame est gele et ne rendrait jamais la main.
  const nextFrame = () =>
    new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      requestAnimationFrame(finish);
      setTimeout(finish, 250);
    });

  async function nudge(reason) {
    lastNudge = Date.now();
    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: "fix-x-layout" });
    } catch (e) {
      console.log(TAG, "reparation indisponible:", e.message);
      return;
    }
    if (!res || !res.ok) {
      console.log(TAG, "reparation refusee:", (res && res.reason) || "inconnue");
      return;
    }
    lastNudge = Date.now();
    if (res.after > SLACK) {
      console.log(
        TAG,
        `correction insuffisante (${res.after}px restants, via ${res.via})`,
        reason,
      );
      return;
    }
    tries = 0;
    fixes += 1;
    document.documentElement.dataset.xLayoutRefresh = String(fixes);
    console.log(TAG, `mise en page recalculee via ${res.via} (${reason})`);
  }

  function check(reason) {
    if (document.hidden || onSkippedPage()) return;
    const over = overflowWidth();
    if (over <= SLACK) {
      tries = 0;
      return;
    }
    if (Date.now() - lastNudge < COOLDOWN) return;
    if (tries >= MAX_TRIES) {
      document.documentElement.dataset.xLayoutRefresh = "echec";
      return;
    }
    tries += 1;
    console.log(TAG, `mise en page trop large de ${Math.round(over)}px`, reason);
    nudge(reason);
  }

  // Surveillance principale : l'observateur se declenche des que le conteneur
  // racine change de largeur, donc des que X se remet a jour... ou pas.
  function watch() {
    const root = layoutRoot();
    if (!root || root === observed) return;
    if (observer) observer.disconnect();
    observer = new ResizeObserver(() => check("largeur du conteneur"));
    observer.observe(root);
    observer.observe(document.documentElement);
    observed = root;
    check("conteneur observe");
  }

  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) return;
    // Laisser Chrome remettre le viewport a jour avant de mesurer.
    await nextFrame();
    watch();
    check("retour sur l'onglet");
    setTimeout(() => check("retour sur l'onglet (differe)"), 600);
  });

  // Un vrai redimensionnement remet le compteur a zero : c'est une nouvelle
  // situation. Mais deux des trois leviers de reparation (zoom, fenetre)
  // produisent eux-memes un resize — le recompter relancerait une boucle.
  function resetTries() {
    if (Date.now() - lastNudge > 2000) tries = 0;
  }

  window.addEventListener("resize", () => {
    resetTries();
    setTimeout(() => check("redimensionnement"), 300);
  });

  window.addEventListener("pageshow", () => {
    resetTries();
    setTimeout(() => check("affichage de la page"), 300);
  });

  // Filet : X monte son arborescence en plusieurs temps et la remplace parfois
  // au fil de la navigation. Ce controle rattache l'observateur et rattrape un
  // debordement apparu en dehors de tout evenement.
  setInterval(() => {
    if (document.hidden) return;
    watch();
    check("controle periodique");
  }, 4000);

  // Au chargement, X monte son arborescence en plusieurs temps : on repasse
  // plusieurs fois plutot qu'une seule, sinon on mesure trop tot.
  watch();
  for (const delay of [300, 1000, 2000, 4000]) {
    setTimeout(() => {
      watch();
      check("chargement");
    }, delay);
  }

  console.log(TAG, "actif");
})();
