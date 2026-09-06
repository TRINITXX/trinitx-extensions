// X — Fil seul — masque la barre de navigation gauche et la colonne droite
// sans deplacer le fil (visibility: hidden garde la place occupee).
// Une pastille discrete en haut a gauche permet de tout reafficher au clic.
(() => {
  // Guard : eviter une double execution si le module est re-injecte (toggle).
  if (window.__xFocusTimelineLoaded) return;
  window.__xFocusTimelineLoaded = true;

  const TAG = "[X Focus Timeline]";

  // Classe posee sur <html> quand l'utilisateur demande a tout revoir. Non
  // persistee : chaque chargement de page repart en mode masque.
  const OFF_CLASS = "x-focus-timeline-off";
  const BUTTON_ID = "x-focus-timeline-toggle";

  // On masque en `visibility: hidden` et JAMAIS en `display: none` : le layout
  // de X est un flex a trois colonnes (banner | primaryColumn | sidebarColumn),
  // retirer une colonne du flux recentrerait le fil. `visibility` laisse la
  // boite en place -> le fil garde exactement la meme position et la meme
  // largeur, et les elements masques ne sont plus ni cliquables ni focusables.
  const css = `
    /* Bande gauche : logo, navigation, bouton Poster, compte */
    html:not(.${OFF_CLASS}) header[role="banner"],
    /* Bande droite : recherche, encarts Premium, tendances, suggestions */
    html:not(.${OFF_CLASS}) div[data-testid="sidebarColumn"],
    /* Boutons flottants en bas a droite (Grok, messagerie) : hors flux,
       les masquer ne decale rien. */
    html:not(.${OFF_CLASS}) [data-testid="GrokDrawer"],
    html:not(.${OFF_CLASS}) [data-testid="chat-drawer-root"] {
      visibility: hidden !important;
    }

    /* Pastille de bascule : zone cliquable de 20px, point de 7px a peine
       visible au repos pour ne pas accrocher l'oeil. Collee dans l'angle haut
       droit, au-dessus de la colonne masquee. */
    #${BUTTON_ID} {
      position: fixed;
      top: 3px;
      right: 3px;
      z-index: 2147483000;
      width: 20px;
      height: 20px;
      padding: 0;
      margin: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      -webkit-appearance: none;
      appearance: none;
    }
    #${BUTTON_ID}::before {
      content: "";
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: currentColor;
      color: #71767b;
      opacity: 0.16;
      transition: opacity 120ms ease;
    }
    #${BUTTON_ID}:hover::before,
    #${BUTTON_ID}:focus-visible::before {
      opacity: 0.9;
    }
    /* Bandes visibles : la pastille reste allumee pour rappeler l'etat. */
    html.${OFF_CLASS} #${BUTTON_ID}::before {
      opacity: 0.55;
    }
  `;

  function injectStyle() {
    if (document.getElementById("x-focus-timeline")) return;
    const style = document.createElement("style");
    style.id = "x-focus-timeline";
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function toggle() {
    const revealed = document.documentElement.classList.toggle(OFF_CLASS);
    const button = document.getElementById(BUTTON_ID);
    if (button) {
      button.title = revealed ? "Masquer les côtés" : "Afficher les côtés";
    }
  }

  function mountButton() {
    if (document.getElementById(BUTTON_ID)) return;
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.title = "Afficher les côtés";
    button.setAttribute("aria-label", "Afficher ou masquer les colonnes latérales");
    button.addEventListener("click", toggle);
    document.body.appendChild(button);
  }

  // A document_start le <body> n'existe pas encore. On surveille ses enfants
  // directs (et seulement eux : X mute son DOM en permanence, un observer
  // `subtree` couterait cher pour rien) afin de remonter la pastille si une
  // navigation interne la retire.
  function keepButtonMounted() {
    const watchBody = () => {
      mountButton();
      new MutationObserver(mountButton).observe(document.body, {
        childList: true,
      });
    };

    if (document.body) {
      watchBody();
      return;
    }

    const bodyWatcher = new MutationObserver(() => {
      if (!document.body) return;
      bodyWatcher.disconnect();
      watchBody();
    });
    bodyWatcher.observe(document.documentElement, { childList: true });
  }

  injectStyle();
  keepButtonMounted();
  console.log(TAG, "bandes laterales masquees");
})();
