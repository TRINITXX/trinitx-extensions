(() => {
  // Guard: avoid running twice if the module gets re-injected (toggle / reload)
  // while an x.com tab is already open.
  if (window.__xQuickBlockLoaded) return;
  window.__xQuickBlockLoaded = true;

  const LOG_PREFIX = "[X-QuickBlock]";

  // Public web-client bearer used by x.com itself for its internal API.
  // Not a secret, not the paid developer API. Validated empirically (step 1):
  // if X ever rejects it, fall back to capturing the real header from a live
  // request (see design spec).
  const BEARER =
    "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

  const BLOCK_URL = "https://x.com/i/api/1.1/blocks/create.json";
  const UNBLOCK_URL = "https://x.com/i/api/1.1/blocks/destroy.json";

  const TWEET_SELECTOR = 'article[data-testid="tweet"]';
  const CARET_SELECTOR = 'button[data-testid="caret"]';
  const BTN_CLASS = "x-quick-block-btn";
  const TOAST_HOST_ID = "x-quick-block-toasts";
  const STYLE_ID = "x-quick-block-style";

  const UNDO_TOAST_MS = 6000;
  const INFO_TOAST_MS = 4000;

  // Screen names blocked during this page session. Kept so the grayed-out state
  // can be re-applied after X/React re-renders an article (which would otherwise
  // drop our inline styles). Cleared on reload (X then natively hides them).
  const blockedScreenNames = new Set();

  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }

  // --- Cookies -------------------------------------------------------------

  // ct0 is the CSRF double-submit cookie — not httpOnly, so readable here.
  function getCookie(name) {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }

  // --- Author handle extraction --------------------------------------------

  // The first User-Name block in DOM order is the main tweet author (not a
  // quoted/embedded tweet). Its profile link points to "/screen_name".
  function getScreenName(article) {
    const userName = article.querySelector('[data-testid="User-Name"]');
    const scope = userName || article;
    const links = scope.querySelectorAll('a[href^="/"]');
    for (const link of links) {
      const href = link.getAttribute("href");
      // X handles: 1-15 chars, letters/digits/underscore, single path segment.
      if (/^\/[A-Za-z0-9_]{1,15}$/.test(href)) {
        return href.slice(1);
      }
    }
    return null;
  }

  // --- Internal block API --------------------------------------------------

  async function callBlockApi(url, screenName) {
    const ct0 = getCookie("ct0");
    if (!ct0) throw new Error("not-logged-in");

    const body = new URLSearchParams();
    body.set("screen_name", screenName);

    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        authorization: BEARER,
        "x-csrf-token": ct0,
        "x-twitter-active-user": "yes",
        "x-twitter-auth-type": "OAuth2Session",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!res.ok) throw new Error("http-" + res.status);
    return res.json().catch(() => ({}));
  }

  function blockUser(screenName) {
    return callBlockApi(BLOCK_URL, screenName);
  }

  function unblockUser(screenName) {
    return callBlockApi(UNBLOCK_URL, screenName);
  }

  // --- Toasts (bottom-center, dark/neutral) --------------------------------

  function getToastHost() {
    let host = document.getElementById(TOAST_HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = TOAST_HOST_ID;
      document.body.appendChild(host);
    }
    return host;
  }

  function spawnToast(buildContent, duration) {
    const host = getToastHost();
    const toast = document.createElement("div");
    toast.className = "x-quick-block-toast";

    let timer = null;
    function dismiss() {
      if (timer) clearTimeout(timer);
      toast.classList.remove("visible");
      setTimeout(() => toast.remove(), 300);
    }

    buildContent(toast, dismiss);
    host.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("visible"));
    timer = setTimeout(dismiss, duration);

    return { toast, dismiss };
  }

  function showToast(message) {
    spawnToast((t) => {
      t.textContent = message;
    }, INFO_TOAST_MS);
  }

  function showUndoToast(screenName) {
    spawnToast((t, dismiss) => {
      const span = document.createElement("span");
      span.textContent = "Bloqué @" + screenName;

      const undo = document.createElement("button");
      undo.type = "button";
      undo.className = "x-quick-block-undo";
      undo.textContent = "Annuler";
      undo.addEventListener("click", async () => {
        dismiss();
        try {
          await unblockUser(screenName);
          blockedScreenNames.delete(screenName);
          setGrayedForUser(screenName, false);
          showToast("Déblocage de @" + screenName);
        } catch (err) {
          log("unblock failed", screenName, err.message);
          showToast("Échec du déblocage de @" + screenName);
        }
      });

      t.appendChild(span);
      t.appendChild(undo);
    }, UNDO_TOAST_MS);
  }

  // --- Grayed-out state for blocked authors --------------------------------

  // Inline styles (not a CSS class): React owns the article's className and
  // rewrites it on re-render, but it does not manage these inline properties.
  function setGrayed(article, on) {
    if (on) {
      article.style.opacity = "0.4";
      article.style.filter = "grayscale(0.7)";
      article.style.transition = "opacity 0.2s, filter 0.2s";
    } else {
      article.style.opacity = "";
      article.style.filter = "";
      article.style.transition = "";
    }
  }

  function setGrayedForUser(screenName, on) {
    document.querySelectorAll(TWEET_SELECTOR).forEach((article) => {
      if (getScreenName(article) === screenName) setGrayed(article, on);
    });
  }

  // --- Block click ---------------------------------------------------------

  async function onBlockClick(btn, screenName) {
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      await blockUser(screenName);
      log("blocked", screenName);
      blockedScreenNames.add(screenName);
      setGrayedForUser(screenName, true);
      showUndoToast(screenName);
    } catch (err) {
      log("block failed", screenName, err.message);
      if (err.message === "not-logged-in") {
        showToast("Connecte-toi à X pour bloquer");
      } else {
        showToast("Échec du blocage de @" + screenName);
      }
    } finally {
      btn.disabled = false;
    }
  }

  // --- Button injection ----------------------------------------------------

  function buildButton(screenName) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = BTN_CLASS;
    btn.title = "Bloquer @" + screenName;
    btn.setAttribute("aria-label", "Bloquer @" + screenName);
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
           stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="12" cy="12" r="9"></circle>
        <line x1="5.6" y1="5.6" x2="18.4" y2="18.4"></line>
      </svg>`;
    btn.addEventListener("click", (e) => {
      // Don't let X handle the click (it would open the tweet / its menu).
      e.preventDefault();
      e.stopPropagation();
      onBlockClick(btn, screenName);
    });
    return btn;
  }

  function processArticle(article) {
    const screenName = getScreenName(article);

    // Re-apply the grayed-out state — survives X/React re-renders that would
    // otherwise reset the article's inline styles.
    if (screenName && blockedScreenNames.has(screenName)) {
      setGrayed(article, true);
    }

    if (article.querySelector("." + BTN_CLASS)) return;
    const caret = article.querySelector(CARET_SELECTOR);
    if (!caret || !caret.parentElement) return;
    if (!screenName) return; // retry on a later scan once DOM is complete
    const btn = buildButton(screenName);
    caret.parentElement.insertBefore(btn, caret);
  }

  function scanAndInject() {
    document.querySelectorAll(TWEET_SELECTOR).forEach(processArticle);
  }

  // --- Styles --------------------------------------------------------------

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${BTN_CLASS} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        /* Marges verticales negatives : le bouton garde sa cible visuelle 32x32
           mais ne compte que pour 20px dans la ligne d'en-tete (exactement la
           technique du caret natif de X). Sans ca, sa hauteur de 32px force la
           ligne (20px) a grandir -> +12px par tweet. Cumule sur les tweets
           au-dessus du viewport, ce decalage desynchronise la restauration de
           scroll "manuelle" de X au retour arriere : le fil saute de quelques
           tweets. */
        margin: -6px 0;
        padding: 0;
        border: none;
        background: transparent;
        color: rgb(113, 118, 123);
        opacity: 0.35;
        border-radius: 9999px;
        cursor: pointer;
        -webkit-appearance: none;
        transition: opacity 0.15s, background-color 0.15s;
      }
      .${BTN_CLASS}:hover {
        opacity: 1;
        background-color: rgba(127, 127, 127, 0.1);
      }
      .${BTN_CLASS}:disabled {
        opacity: 0.2;
        cursor: default;
      }
      #${TOAST_HOST_ID} {
        position: fixed;
        left: 50%;
        bottom: 24px;
        transform: translateX(-50%);
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        pointer-events: none;
      }
      .x-quick-block-toast {
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 12px;
        max-width: 90vw;
        background: rgba(32, 35, 39, 0.98);
        color: #e7e9ea;
        padding: 10px 16px;
        border-radius: 9999px;
        font-size: 14px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.1);
        opacity: 0;
        transform: translateY(8px);
        transition: opacity 0.25s, transform 0.25s;
      }
      .x-quick-block-toast.visible {
        opacity: 1;
        transform: translateY(0);
      }
      .x-quick-block-undo {
        background: transparent;
        border: none;
        color: #1d9bf0;
        font-weight: 700;
        font-size: 14px;
        cursor: pointer;
        padding: 4px 6px;
        border-radius: 4px;
        font-family: inherit;
      }
      .x-quick-block-undo:hover {
        text-decoration: underline;
      }
    `;
    document.head.appendChild(style);
  }

  // --- Init ----------------------------------------------------------------

  let scanScheduled = false;
  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      scanAndInject();
    });
  }

  function init() {
    injectStyles();
    scanAndInject();

    // X virtualizes the timeline: re-inject as new tweets enter the DOM.
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true });

    // SPA navigation (URL changes without reload) — rescan periodically.
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        scheduleScan();
      }
    }, 1000);

    log("initialized");
  }

  init();
})();
