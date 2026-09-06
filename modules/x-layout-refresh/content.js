// X — Mise en page figee — remet la mise en page a la largeur de la fenetre
// quand X est reste sur une mesure obsolete, sans que ca se voie.
(() => {
  // Guard : eviter une double execution si le module est re-injecte (toggle).
  if (window.__xLayoutRefreshLoaded) return;
  window.__xLayoutRefreshLoaded = true;

  const TAG = "[X Layout Refresh]";

  // Pourquoi ce module existe
  // -------------------------
  // X ne pilote pas la largeur de ses colonnes en CSS (ses seules media queries
  // s'arretent a 600px) : il la calcule en JS et la pose EN DUR sur son
  // conteneur. Avec un zoom de page sur x.com, un onglet ouvert en arriere-plan
  // est d'abord mis en page au zoom 100 %, puis Chrome applique le zoom — sans
  // que X ne remesure. Mesure sur le cas reel : fenetre 1150 px, mise en page
  // restee a 1265 px (1150 x 1,1), barre de navigation a 275 px "en grand" au
  // lieu de 124 px, et defilement horizontal.
  //
  // Le correctif agit sur le DOM et sur lui seul. Toutes les tentatives passant
  // par le navigateur (chrome.tabs.setZoom, redimensionnement de fenetre)
  // marchaient mais finissaient toujours par se voir a l'ecran, alors meme que
  // le zoom applique par Chrome, lui, ne se voit pas. Ici on change la largeur
  // du conteneur que X observe, le temps de deux frames : son observateur voit
  // le changement, recalcule ses colonnes, et on relache — la largeur qu'il
  // vient de poser lui-meme est desormais la bonne.

  // Pages laissees tranquilles a la demande. X etant une application a une
  // seule page, l'URL change sans rechargement : on la revoit a chaque controle
  // plutot qu'une fois au demarrage.
  const SKIP_PATHS = ["/home"];
  const onSkippedPage = () => SKIP_PATHS.includes(location.pathname);

  // Ecart tolere entre la mise en page de X et la fenetre, en pixels.
  const SLACK = 2;
  // Delai minimum entre deux corrections.
  const COOLDOWN = 250;
  // Au-dela, on arrete d'insister : le debordement vient d'ailleurs.
  const MAX_TRIES = 3;

  let lastFix = 0;
  let tries = 0;
  let fixes = 0;
  let observed = null;
  let observer = null;

  document.documentElement.dataset.xLayoutRefresh = "actif";

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

  // Conteneur qui porte la largeur de mise en page de X (parent direct des
  // trois colonnes). Sa largeur vaut normalement celle de la fenetre.
  function layoutRoot() {
    const banner = document.querySelector('header[role="banner"]');
    return banner ? banner.parentElement : null;
  }

  // De combien la mise en page depasse-t-elle la fenetre ?
  function overflowWidth() {
    const de = document.documentElement;
    const root = layoutRoot();
    const rootWidth = root ? root.getBoundingClientRect().width : 0;
    return Math.max(de.scrollWidth, rootWidth) - de.clientWidth;
  }

  // Les elements trop larges, en partant du conteneur de X. On ne descend que
  // de quelques niveaux : c'est la que X pose ses largeurs, et ratisser toute
  // la page couterait cher pour rien.
  function tooWideElements() {
    const target = document.documentElement.clientWidth;
    const root = layoutRoot();
    if (!root) return [];
    const found = [];
    let level = [root];
    for (let depth = 0; depth < 3 && level.length; depth += 1) {
      const next = [];
      for (const node of level) {
        if (node.getBoundingClientRect().width > target + SLACK) {
          found.push(node);
          next.push(...node.children);
        }
      }
      level = next;
    }
    return found;
  }

  // Le geste : imposer une largeur au conteneur que X observe, le temps de deux
  // frames, puis relacher. L'observateur de X voit deux changements et recalcule
  // ses colonnes — d'abord sur la largeur imposee, puis sur la vraie.
  //
  // On force volontairement une valeur FRANCHEMENT differente (et non la
  // largeur cible) : c'est le changement qui declenche le recalcul, et un ecart
  // net evite qu'un arrondi ne l'escamote. Les elements deja trop larges sont
  // ramenes en meme temps, au cas ou X ne toucherait pas a tout.
  async function reclaimWidth() {
    const target = document.documentElement.clientWidth;
    const root = layoutRoot();
    const nodes = new Set(tooWideElements());
    if (root) nodes.add(root);
    if (nodes.size === 0) return false;

    const touched = [...nodes].map((el) => [
      el,
      el.style.getPropertyValue("width"),
      el.style.getPropertyPriority("width"),
    ]);
    for (const [el] of touched) {
      const forced = el === root ? Math.max(320, target - 120) : target;
      el.style.setProperty("width", `${forced}px`, "important");
    }
    await nextFrame();
    await nextFrame();
    for (const [el, value, priority] of touched) {
      if (value) el.style.setProperty("width", value, priority);
      else el.style.removeProperty("width");
    }
    await nextFrame();
    await nextFrame();
    return true;
  }

  // Aucun secours par le zoom ici, meme masque : verifie a l'usage, le geste du
  // service worker (chrome.tabs.setZoom) se voit toujours d'une facon ou d'une
  // autre. Il ne reste accessible que par le bouton du popup, ou l'utilisateur
  // le declenche sciemment. Si la reprise DOM ne suffit pas, on renonce.
  async function repair(reason) {
    if (onSkippedPage()) return true;
    const over = overflowWidth();
    if (over <= SLACK) {
      tries = 0;
      return true;
    }
    if (Date.now() - lastFix < COOLDOWN) return false;
    if (tries >= MAX_TRIES) {
      document.documentElement.dataset.xLayoutRefresh = "echec";
      return false;
    }
    tries += 1;
    lastFix = Date.now();
    console.log(TAG, `mise en page trop large de ${Math.round(over)}px`, reason);

    await reclaimWidth();
    if (overflowWidth() > SLACK) {
      const left = Math.round(overflowWidth());
      console.log(TAG, `correction insuffisante (${left}px)`);
      return false;
    }
    tries = 0;
    fixes += 1;
    document.documentElement.dataset.xLayoutRefresh = String(fixes);
    console.log(TAG, `mise en page recalculee (${reason})`);
    return true;
  }

  // Aucun cache, aucun masquage : demande explicite de l'utilisateur. Si la
  // reprise ne suffit pas, la page reste telle quelle plutot que de clignoter.
  // Duree maximale pendant laquelle on garde la main au premier affichage.
  const SETTLE_MAX = 800;
  // Nombre de frames sans debordement avant de considerer la page stable.
  const SETTLE_CALM = 4;

  // Premier affichage : le decalage peut n'apparaitre qu'apres quelques frames,
  // conclure des la premiere mesure donnerait un faux "rien a corriger".
  async function settle() {
    const deadline = Date.now() + SETTLE_MAX;
    let calm = 0;
    while (Date.now() < deadline) {
      await nextFrame();
      if (overflowWidth() > SLACK) {
        calm = 0;
        const fixed = await repair("premier affichage");
        if (!fixed && tries >= MAX_TRIES) break;
        continue;
      }
      calm += 1;
      if (calm >= SETTLE_CALM) break;
    }
  }

  // Surveillance : l'observateur se declenche des que le conteneur change de
  // largeur, donc des que X se remet a jour... ou pas.
  function watch() {
    const root = layoutRoot();
    if (!root || root === observed) return;
    if (observer) observer.disconnect();
    observer = new ResizeObserver(() => {
      if (!document.hidden) repair("largeur du conteneur");
    });
    observer.observe(root);
    observer.observe(document.documentElement);
    observed = root;
  }

  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) return;
    watch();
    await settle();
  });

  window.addEventListener("resize", () => {
    // Un vrai redimensionnement est une situation neuve : on redonne sa chance
    // au module, sauf si c'est notre propre correction qui l'a provoque.
    if (Date.now() - lastFix > 1500) tries = 0;
    setTimeout(() => repair("redimensionnement"), 250);
  });

  window.addEventListener("pageshow", () => {
    setTimeout(() => repair("affichage de la page"), 250);
  });

  // Filet : X remplace parfois son arborescence au fil de la navigation. Ce
  // controle rattache l'observateur et rattrape un debordement passe entre les
  // mailles, sans jamais recourir au secours visible.
  setInterval(() => {
    if (document.hidden) return;
    watch();
    repair("controle periodique");
  }, 4000);

  // X monte son arborescence en plusieurs temps : on repasse plutot qu'une
  // seule fois, sinon on mesure trop tot.
  watch();
  for (const delay of [300, 1000, 2500]) {
    setTimeout(() => {
      watch();
      repair("chargement");
    }, delay);
  }

  console.log(TAG, "actif");
})();
