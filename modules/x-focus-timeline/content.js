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

  // Lien "Notifications" de la barre laterale + attribut pose sur les seuls
  // noeuds qu'on rallume quand la cloche porte un badge.
  const NOTIF_LINK = 'a[data-testid="AppTabBar_Notifications_Link"]';
  const REVEAL_ATTR = "data-x-focus-timeline-reveal";

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

    /* Exception : la cloche de notifications reste visible quand elle porte un
       badge. Un descendant en visibility: visible annule le hidden de son
       ancetre -> on ne rallume que l'icone et son badge, jamais tout le lien
       (son libelle texte reapparaitrait). */
    html:not(.${OFF_CLASS}) [${REVEAL_ATTR}] {
      visibility: visible !important;
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

  // Le badge est une petite pastille coloree posee sur l'icone. On le reconnait
  // a sa taille (le rond gris du survol fait ~40px) et a son fond opaque : sa
  // couleur, elle, suit l'accent choisi par le compte, donc on ne la teste pas.
  function isBadge(element) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.width > 24 || rect.height > 24) return false;
    const background = getComputedStyle(element).backgroundColor;
    return background !== "transparent" && background !== "rgba(0, 0, 0, 0)";
  }

  let revealed = [];

  function refreshNotificationBadge() {
    for (const element of revealed) element.removeAttribute(REVEAL_ATTR);
    revealed = [];

    const link = document.querySelector(NOTIF_LINK);
    if (!link) return;

    const badges = [...link.querySelectorAll("div")].filter(isBadge);
    // Filet de securite independant de la langue : X chiffre les non-lus dans
    // l'aria-label du lien ("3 notifications non lues. Notifications").
    const label = link.getAttribute("aria-label") || "";
    if (badges.length === 0 && !/\d/.test(label)) return;

    const icon = link.querySelector("svg")?.parentElement;
    revealed = icon ? [icon, ...badges] : badges;
    for (const element of revealed) element.setAttribute(REVEAL_ATTR, "");
  }

  // X remonte un compteur de non-lus en direct : on suit les mutations du
  // header (et le seul attribut qui nous interesse) plutot que de sonder.
  function watchNotifications() {
    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        refreshNotificationBadge();
      }, 300);
    };

    const attach = () => {
      const header = document.querySelector('header[role="banner"]');
      if (!header) return false;
      new MutationObserver(schedule).observe(header, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-label"],
      });
      refreshNotificationBadge();
      return true;
    };

    if (attach()) return;
    const waiter = new MutationObserver(() => {
      if (attach()) waiter.disconnect();
    });
    waiter.observe(document.documentElement, { childList: true, subtree: true });
  }

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
  watchNotifications();
  console.log(TAG, "bandes laterales masquees");
})();
