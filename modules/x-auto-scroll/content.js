(() => {
  // Guard: avoid running twice if the module gets re-injected (toggle / reload)
  // while an x.com tab is already open.
  if (window.__xAutoScrollLoaded) return;
  window.__xAutoScrollLoaded = true;

  const TWEET_SELECTOR = 'article[data-testid="tweet"]';
  const BUTTON_TEXT_REGEX = /voir \d+ nouveau/i;
  const DEBOUNCE_MS = 400;
  const SCROLL_OFFSET = 60;
  const LOG_PREFIX = "[X-AutoScroll]";
  const STORAGE_KEY = "lastSeenTweetHref";

  // --- Save tuning ---
  const SAVE_DEBOUNCE_MS = 1500; // persist 1.5s after the user stops scrolling
  const MIN_ENGAGE_SCROLL = 400; // px scrolled before we start saving (anti-clobber)

  // --- Scroll-to-last-seen tuning ---
  const AUTOSCROLL_MAX_MS = 30000; // hard wall-clock cap (~30s)
  const AUTOSCROLL_STEP_FRACTION = 0.7; // scroll < 1 viewport per step (no skip)
  const RENDER_SETTLE_MS = 80; // short pause for X to render after a step
  const AUTOSCROLL_STEP_WAIT_MS = 1200; // max wait for lazy-load when stuck
  const AUTOSCROLL_POLL_MS = 100; // lazy-load poll interval
  const STUCK_LIMIT = 3; // consecutive "bottom & no growth" before giving up
  const RESUME_TRACKING_DELAY_MS = 2500; // resume tracking after a jump
  const REPOSITION_MAX_MS = 8000; // Feature 1: cap for scrolling back to reading pos

  let lastSeenHref = null;
  let isAutoScrolling = false;
  let trackingPaused = false;
  let hasScrolledSinceLoad = false;
  let scrollButton = null;
  let saveDebounceTimer = null;

  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }

  // --- Page & tab detection ---

  function isOnHomePage() {
    return /^https?:\/\/x\.com\/home\b/.test(location.href);
  }

  function isOnForYouTab() {
    const activeTab = document.querySelector(
      '[role="tab"][aria-selected="true"]',
    );
    if (!activeTab) return false;
    const text = activeTab.textContent.trim().toLowerCase();
    return text.includes("pour vous") || text.includes("for you");
  }

  // --- Smooth scroll utility ---

  function smoothScrollTo(targetY) {
    const start = document.documentElement.scrollTop;
    const distance = targetY - start;
    const duration = Math.min(600, Math.abs(distance) * 0.5);
    let startTime = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      document.documentElement.scrollTop = start + distance * ease;
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  // --- Tweet helpers ---

  function getTweetHref(tweet) {
    const link = tweet.querySelector('a[href*="/status/"]');
    return link ? link.getAttribute("href") : null;
  }

  function findNextTweetAfterButton(button) {
    let cell = button;
    while (cell && cell.parentElement) {
      const parent = cell.parentElement;
      if (parent.children.length > 2) {
        let sibling = cell.nextElementSibling;
        while (sibling) {
          const tweet = sibling.querySelector(TWEET_SELECTOR);
          if (tweet) return tweet;
          sibling = sibling.nextElementSibling;
        }
      }
      cell = cell.parentElement;
    }
    return null;
  }

  function findTweetByHref(href) {
    const links = document.querySelectorAll('a[href*="/status/"]');
    for (const link of links) {
      if (link.getAttribute("href") === href) {
        const tweet = link.closest(TWEET_SELECTOR);
        if (tweet) return tweet;
      }
    }
    return null;
  }

  // Topmost tweet currently sitting at the reading line (deterministic
  // "where am I"). Returns its status href, or null.
  function getCurrentTopTweetHref() {
    const tweets = document.querySelectorAll(TWEET_SELECTOR);
    for (const tweet of tweets) {
      const rect = tweet.getBoundingClientRect();
      // first tweet still below the header line and not fully scrolled past
      if (rect.bottom > SCROLL_OFFSET + 8 && rect.top < window.innerHeight) {
        return getTweetHref(tweet);
      }
    }
    return null;
  }

  // --- DOM stability ---

  function waitForDomStable(callback) {
    let timer = null;
    let called = false;

    function done() {
      if (called) return;
      called = true;
      observer.disconnect();
      clearTimeout(timer);
      clearTimeout(safetyTimer);
      callback();
    }

    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(done, DEBOUNCE_MS);
    });

    observer.observe(document.body, { childList: true, subtree: true });
    const safetyTimer = setTimeout(done, 2000);
  }

  // --- Feature 1: Keep reading position when loading "voir X nouveaux" ---

  // After X prepends the new posts (and scrolls to top, virtualizing the tweet
  // we were on), gently scroll back down to that tweet and settle it at its
  // original viewport offset. Uses the same small-step search as the
  // scroll-to-last-seen button (which doesn't disturb X) instead of the old
  // crude 500px probing loop that made X reinsert already-seen posts on top.
  function repositionToReadingTweet(href, beforeTop) {
    const docEl = document.documentElement;
    const startTime = Date.now();
    let stuck = 0;

    function settleOn(tweet) {
      const targetY =
        docEl.scrollTop + tweet.getBoundingClientRect().top - beforeTop;
      smoothScrollTo(targetY);
      log("reading position restored");
    }

    function tick() {
      const found = findTweetByHref(href);
      if (found) {
        settleOn(found);
        return;
      }
      if (Date.now() - startTime >= REPOSITION_MAX_MS) {
        log("reposition gave up (timeout)");
        return;
      }
      const beforeScroll = docEl.scrollTop;
      const beforeHeight = docEl.scrollHeight;
      docEl.scrollTop =
        beforeScroll + window.innerHeight * AUTOSCROLL_STEP_FRACTION;

      setTimeout(() => {
        const t1 = findTweetByHref(href);
        if (t1) {
          settleOn(t1);
          return;
        }
        if (docEl.scrollTop > beforeScroll + 4) {
          stuck = 0;
          tick(); // content already loaded -> keep moving
          return;
        }
        // Bottom of loaded content: wait for X to lazy-load more.
        const t0 = Date.now();
        (function waitGrow() {
          const t2 = findTweetByHref(href);
          if (t2) {
            settleOn(t2);
            return;
          }
          if (docEl.scrollHeight > beforeHeight + 4) {
            stuck = 0;
            tick();
            return;
          }
          if (Date.now() - t0 >= AUTOSCROLL_STEP_WAIT_MS) {
            stuck++;
            if (stuck >= STUCK_LIMIT) {
              log("reposition gave up (bottom)");
              return;
            }
            tick();
            return;
          }
          setTimeout(waitGrow, AUTOSCROLL_POLL_MS);
        })();
      }, RENDER_SETTLE_MS);
    }

    tick();
  }

  function handleClick(e) {
    if (!isOnHomePage() || isOnForYouTab() || isAutoScrolling) {
      return;
    }

    let button = e.target;
    while (button && button !== document.body) {
      if (
        button.tagName === "BUTTON" ||
        button.getAttribute("role") === "button"
      )
        break;
      button = button.parentElement;
    }
    if (!button || button === document.body) return;

    if (!BUTTON_TEXT_REGEX.test(button.textContent)) return;

    log("click detected on:", button.textContent.trim());

    const targetTweet = findNextTweetAfterButton(button);
    if (!targetTweet) {
      log("no tweet found below button");
      return;
    }

    const href = getTweetHref(targetTweet);
    if (!href) {
      log("tweet has no status href");
      return;
    }

    // Remember exactly where the tweet we're reading sits in the viewport,
    // then let X prepend the new posts natively before we scroll back to it.
    const beforeTop = targetTweet.getBoundingClientRect().top;

    waitForDomStable(() => repositionToReadingTweet(href, beforeTop));
  }

  // --- Feature 2: Last seen tweet tracking & scroll-to button ---

  function isContextValid() {
    try {
      return !!chrome.runtime.id;
    } catch {
      return false;
    }
  }

  function saveLastSeenTweet() {
    if (!lastSeenHref || !isContextValid()) return;
    chrome.storage.local.set({ [STORAGE_KEY]: lastSeenHref }, () => {
      log("saved last seen tweet:", lastSeenHref);
      // Only refresh visibility when the button isn't already shown — avoids
      // touching the DOM on every save while the user is scrolling.
      if (scrollButton && scrollButton.style.display === "none") {
        updateButtonVisibility();
      }
    });
  }

  function loadLastSeenTweet(callback) {
    if (!isContextValid()) return;
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      callback(result[STORAGE_KEY] || null);
    });
  }

  function canSaveNow() {
    return (
      isOnHomePage() &&
      !isOnForYouTab() &&
      hasScrolledSinceLoad &&
      !trackingPaused &&
      !isAutoScrolling
    );
  }

  // Update lastSeenHref from the current viewport and persist it.
  function captureAndSave() {
    if (!canSaveNow()) return;
    const href = getCurrentTopTweetHref();
    if (!href) return;
    lastSeenHref = href;
    saveLastSeenTweet();
  }

  function onUserScroll() {
    if (isAutoScrolling) return; // ignore programmatic scrolling
    if (
      !hasScrolledSinceLoad &&
      document.documentElement.scrollTop > MIN_ENGAGE_SCROLL
    ) {
      hasScrolledSinceLoad = true;
    }
    if (!hasScrolledSinceLoad) return;
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(captureAndSave, SAVE_DEBOUNCE_MS);
  }

  // --- Scroll button UI ---

  function createScrollButton() {
    // Remove stale elements from previous injection
    document.getElementById("x-autoscroll-btn")?.remove();
    document.getElementById("x-autoscroll-toast")?.remove();
    document.getElementById("x-autoscroll-style")?.remove();

    const btn = document.createElement("div");
    btn.id = "x-autoscroll-btn";
    btn.title = "Scroll to last position";
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14l-4-4h3V8h2v4h3l-4 4z"/>
      </svg>
    `;

    const style = document.createElement("style");
    style.id = "x-autoscroll-style";
    style.textContent = `
      #x-autoscroll-btn {
        position: fixed;
        top: 8px;
        left: 8px;
        z-index: 999999;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.4);
        display: none;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.2s, color 0.2s, transform 0.2s;
        user-select: none;
      }
      #x-autoscroll-btn:hover {
        background: rgba(29, 155, 240, 0.8);
        color: white;
        transform: scale(1.1);
      }
      #x-autoscroll-btn.scrolling {
        background: rgba(224, 36, 94, 0.8);
        color: white;
      }
      #x-autoscroll-btn.scrolling svg {
        animation: x-autoscroll-spin 1s linear infinite;
      }
      @keyframes x-autoscroll-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      #x-autoscroll-btn.found {
        background: rgba(23, 191, 99, 0.8);
        color: white;
      }
      #x-autoscroll-btn.not-found {
        background: rgba(244, 93, 34, 0.8);
        color: white;
      }
      #x-autoscroll-toast {
        position: fixed;
        top: 56px;
        left: 8px;
        z-index: 999999;
        background: rgba(29, 155, 240, 0.95);
        color: white;
        padding: 8px 14px;
        border-radius: 8px;
        font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        opacity: 0;
        transition: opacity 0.3s;
        pointer-events: none;
      }
      #x-autoscroll-toast.visible {
        opacity: 1;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(btn);

    // Toast element
    const toast = document.createElement("div");
    toast.id = "x-autoscroll-toast";
    document.body.appendChild(toast);

    btn.addEventListener("click", onScrollButtonClick);

    return btn;
  }

  function showToast(message, duration = 3000) {
    const toast = document.getElementById("x-autoscroll-toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("visible");
    setTimeout(() => toast.classList.remove("visible"), duration);
  }

  function updateButtonVisibility() {
    // Re-create button if SPA hydration removed it from DOM
    if (scrollButton && !document.body.contains(scrollButton)) {
      scrollButton = createScrollButton();
    }
    if (!scrollButton) return;

    // Never hide while actively scrolling to a position
    if (isAutoScrolling) return;

    // Hide if not on home page, on "Pour vous" tab, or if tabs aren't loaded yet
    const tablist = document.querySelector('[role="tablist"]');
    if (!isOnHomePage() || !tablist || isOnForYouTab()) {
      scrollButton.style.display = "none";
      return;
    }

    loadLastSeenTweet((href) => {
      if (isAutoScrolling) return;
      scrollButton.style.display = href ? "flex" : "none";
    });
  }

  function onScrollButtonClick() {
    if (isAutoScrolling) {
      cancelAutoScroll();
      return;
    }

    loadLastSeenTweet((href) => {
      if (!href) {
        showToast("No saved position found");
        return;
      }
      log("starting auto-scroll to find:", href);
      startAutoScroll(href);
    });
  }

  // --- Auto-scroll to last seen ---

  function startAutoScroll(targetHref) {
    isAutoScrolling = true;
    scrollButton.classList.remove("found", "not-found");
    scrollButton.classList.add("scrolling");
    showToast("Scrolling to last position...");

    const startTime = Date.now();
    let stuckCount = 0;
    let rafId = null;
    let stepTimer = null;

    function stop() {
      isAutoScrolling = false;
      scrollButton.classList.remove("scrolling");
      if (rafId) cancelAnimationFrame(rafId);
      if (stepTimer) clearTimeout(stepTimer);
    }

    function onFound(tweet) {
      stop();
      trackingPaused = true; // don't re-save while we settle on the target

      const targetY =
        tweet.getBoundingClientRect().top +
        document.documentElement.scrollTop -
        SCROLL_OFFSET;
      smoothScrollTo(targetY);

      // Highlight the found tweet briefly
      tweet.style.outline = "2px solid #1d9bf0";
      tweet.style.outlineOffset = "-2px";
      tweet.style.borderRadius = "12px";
      setTimeout(() => {
        tweet.style.outline = "";
        tweet.style.outlineOffset = "";
        tweet.style.borderRadius = "";
      }, 4000);

      log("found last seen tweet");
      showToast("Position found!");

      // Keep the saved key; resume tracking shortly so new positions save.
      setTimeout(() => {
        trackingPaused = false;
        log("tracking resumed after scroll-to-last-seen");
      }, RESUME_TRACKING_DELAY_MS);
    }

    function giveUp(reason) {
      stop();
      scrollButton.classList.add("not-found");
      setTimeout(() => scrollButton.classList.remove("not-found"), 3000);
      showToast(
        reason === "bottom"
          ? "Bas de la timeline atteint — tweet introuvable"
          : "Position non trouvée (trop ancienne)",
      );
      log("auto-scroll gave up:", reason);
      updateButtonVisibility(); // keep the key & button for a retry
    }

    // Continuous detection: catch the target even if it is rendered only
    // briefly between virtualization passes (fixes the ~1/4 intermittent miss).
    function detectLoop() {
      if (!isAutoScrolling) return;
      const tweet = findTweetByHref(targetHref);
      if (tweet) {
        onFound(tweet);
        return;
      }
      rafId = requestAnimationFrame(detectLoop);
    }

    // Bottom of *loaded* content: poll until X lazy-loads more (scrollHeight
    // grows) or we time out. Only used when a step couldn't advance.
    function waitForGrowth(prevHeight, done) {
      const t0 = Date.now();
      function check() {
        if (!isAutoScrolling) return;
        const grew = document.documentElement.scrollHeight > prevHeight + 4;
        if (grew || Date.now() - t0 >= AUTOSCROLL_STEP_WAIT_MS) {
          done(grew);
          return;
        }
        stepTimer = setTimeout(check, AUTOSCROLL_POLL_MS);
      }
      stepTimer = setTimeout(check, AUTOSCROLL_POLL_MS);
    }

    function step() {
      if (!isAutoScrolling) return;

      if (Date.now() - startTime >= AUTOSCROLL_MAX_MS) {
        giveUp("timeout");
        return;
      }

      const docEl = document.documentElement;
      const beforeTop = docEl.scrollTop;
      const beforeHeight = docEl.scrollHeight;

      // Step less than one viewport so no tweet is skipped between positions.
      docEl.scrollTop =
        beforeTop + window.innerHeight * AUTOSCROLL_STEP_FRACTION;

      // Short settle for render; detectLoop() (rAF) catches the target in the
      // meantime. Only wait long for lazy-load when the step couldn't advance.
      stepTimer = setTimeout(() => {
        if (!isAutoScrolling) return;
        const moved = document.documentElement.scrollTop > beforeTop + 4;
        if (moved) {
          stuckCount = 0;
          step(); // content already loaded -> keep moving fast
          return;
        }
        // Couldn't advance: at the bottom of loaded content -> wait for more.
        waitForGrowth(beforeHeight, (grew) => {
          if (!isAutoScrolling) return;
          if (grew) {
            stuckCount = 0;
            step();
            return;
          }
          stuckCount++;
          if (stuckCount >= STUCK_LIMIT) {
            giveUp("bottom");
            return;
          }
          step();
        });
      }, RENDER_SETTLE_MS);
    }

    detectLoop();
    step();
  }

  function cancelAutoScroll() {
    isAutoScrolling = false;
    if (scrollButton) {
      scrollButton.classList.remove("scrolling");
    }
    log("auto-scroll cancelled by user");
    showToast("Scroll cancelled");
    updateButtonVisibility();
  }

  // --- Tab change detection ---

  function watchTabChanges() {
    let currentTablist = null;
    let tabObserver = null;

    function check() {
      const tablist = document.querySelector('[role="tablist"]');
      if (tablist && tablist !== currentTablist) {
        if (tabObserver) tabObserver.disconnect();
        currentTablist = tablist;
        tabObserver = new MutationObserver(() => updateButtonVisibility());
        tabObserver.observe(tablist, {
          childList: true,
          subtree: true,
          attributes: true,
        });
        log("watching tab changes");
      }
      updateButtonVisibility();
      setTimeout(check, 2000);
    }

    check();
  }

  // --- Init ---

  function init() {
    // Feature 1: click handler (restricted to non-"Pour vous" tabs)
    document.addEventListener("click", handleClick, true);

    // Feature 2: scroll button + tracking
    scrollButton = createScrollButton();
    updateButtonVisibility();
    watchTabChanges();

    // Track reading position from the scroll event (debounced).
    window.addEventListener("scroll", onUserScroll, { passive: true });

    // Persist immediately when the tab is hidden / closed (reliable on tab
    // switch, minimize, window close — unlike beforeunload).
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") captureAndSave();
    });
    window.addEventListener("beforeunload", captureAndSave);

    // Handle SPA navigation (URL changes without page reload)
    let lastUrl = location.href;
    const urlObserver = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        log("URL changed to", lastUrl);
        updateButtonVisibility();
      }
    });
    urlObserver.observe(document.body, { childList: true, subtree: true });

    log("initialized — features: tab restriction + scroll-to-last-seen");
  }

  init();
})();
