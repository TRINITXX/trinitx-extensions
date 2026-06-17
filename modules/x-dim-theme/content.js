// X — Thème Dim — restaure le thème bleu "Dim" sur X.com (color-scheme + RN Web)
(() => {
  // Guard : éviter une double exécution si le module est ré-injecté (toggle).
  if (window.__xDimThemeLoaded) return;
  window.__xDimThemeLoaded = true;

  const TAG = "[X Dim Theme]";

  // Couleurs du thème Dim
  const DIM_BG = "#15202B";
  const DIM_BORDER = "#38444D";
  const DIM_PRIMARY_TEXT = "#F7F9F9";
  const DIM_SECONDARY_TEXT = "#8B98A5";

  // X a supprimé l'attribut html[data-theme="dim"] ; on se base désormais sur le
  // color-scheme inline posé sur <html> dans tout mode sombre (Dim ou Lights Out).
  const DARK_SELECTOR = 'html[style*="color-scheme: dark"]';

  const css = `
    /* ===== Body ===== */
    ${DARK_SELECTOR} body {
      background-color: ${DIM_BG} !important;
      scrollbar-color: ${DIM_BORDER} ${DIM_BG} !important;
    }

    /* ===== RN Web : classe fond noir ===== */
    ${DARK_SELECTOR} .r-kemksi {
      background-color: ${DIM_BG} !important;
    }

    /* ===== Fonds noirs inline ===== */
    ${DARK_SELECTOR} div[style*="background-color: rgb(0, 0, 0)"] {
      background-color: ${DIM_BG} !important;
    }

    /* ===== Header sticky : noir semi-transparent -> dim semi-transparent ===== */
    ${DARK_SELECTOR} .r-5zmot {
      background-color: rgba(21, 32, 43, 0.65) !important;
    }

    /* ===== TEXTE PRINCIPAL : Lights Out #E7E9EA -> Dim #F7F9F9 ===== */
    ${DARK_SELECTOR} .r-1nao33i {
      color: ${DIM_PRIMARY_TEXT} !important;
    }
    ${DARK_SELECTOR} [style*="color: rgb(231, 233, 234)"] {
      color: ${DIM_PRIMARY_TEXT} !important;
    }

    /* ===== TEXTE SECONDAIRE : Lights Out #71767B -> Dim #8B98A5 ===== */
    ${DARK_SELECTOR} .r-1bwzh9t {
      color: ${DIM_SECONDARY_TEXT} !important;
    }
    ${DARK_SELECTOR} [style*="color: rgb(113, 118, 123)"] {
      color: ${DIM_SECONDARY_TEXT} !important;
    }

    /* ===== ARTICLE (X Notes) : texte mode clair -> Dim ===== */
    ${DARK_SELECTOR} [data-testid="twitterArticleReadView"] {
      color: ${DIM_PRIMARY_TEXT} !important;
    }

    /* ===== BORDURES : Lights Out #2F3336 -> Dim #38444D ===== */
    ${DARK_SELECTOR} .r-1kqtdi0 {
      border-color: ${DIM_BORDER} !important;
    }
    ${DARK_SELECTOR} [style*="border-color: rgb(47, 51, 54)"] {
      border-color: ${DIM_BORDER} !important;
    }
    ${DARK_SELECTOR} [style*="border-bottom-color: rgb(47, 51, 54)"] {
      border-bottom-color: ${DIM_BORDER} !important;
    }
    ${DARK_SELECTOR} [style*="border-top-color: rgb(47, 51, 54)"] {
      border-top-color: ${DIM_BORDER} !important;
    }

    /* ===== Scrollbar (Webkit) ===== */
    ${DARK_SELECTOR} ::-webkit-scrollbar-track {
      background: ${DIM_BG} !important;
    }
    ${DARK_SELECTOR} ::-webkit-scrollbar-thumb {
      background-color: ${DIM_BORDER} !important;
    }
  `;

  function applyDimTheme() {
    document.documentElement.style.backgroundColor = DIM_BG;
  }

  function injectStyle() {
    if (document.getElementById("x-dim-theme-restore")) return;
    const style = document.createElement("style");
    style.id = "x-dim-theme-restore";
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function fixBodyBackground() {
    if (document.body) {
      document.body.style.backgroundColor = DIM_BG;
      document.body.style.scrollbarColor = `${DIM_BORDER} ${DIM_BG}`;
    }
  }

  // X réécrit parfois le fond du body en noir -> on le repasse en Dim à chaque fois.
  function observeChanges() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== "attributes") continue;
        const el = mutation.target;

        if (el === document.body && mutation.attributeName === "style") {
          const style = el.getAttribute("style") || "";
          if (style.includes("background-color: rgb(0, 0, 0)")) {
            el.style.backgroundColor = DIM_BG;
          }
        }
      }
    });

    if (document.body) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["style"],
      });
      fixBodyBackground();
    } else {
      // body pas encore présent (document_start) -> on attend qu'il apparaisse.
      const bodyWatcher = new MutationObserver(() => {
        if (document.body) {
          bodyWatcher.disconnect();
          observer.observe(document.body, {
            attributes: true,
            attributeFilter: ["style"],
          });
          fixBodyBackground();
        }
      });
      bodyWatcher.observe(document.documentElement, { childList: true });
    }
  }

  applyDimTheme();
  injectStyle();
  observeChanges();
  console.log(TAG, "thème Dim restauré");
})();
