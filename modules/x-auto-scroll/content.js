(() => {
  const TWEET_SELECTOR = 'article[data-testid="tweet"]';
  const BUTTON_TEXT_REGEX = /voir \d+ nouveau/i;
  const DEBOUNCE_MS = 400;
  const SCROLL_OFFSET = 60;
  const LOG_PREFIX = "[X-AutoScroll]";
  const STORAGE_KEY = "lastSeenTweetHref";
  const SCROLL_STEP = 1000;
  const SCROLL_DELAY = 300;
  const MAX_SCROLL_ATTEMPTS = 200;
  const MIN_TIME_BEFORE_SAVE_MS = 180000; // 3 minutes
  const FIRST_SAVE_DELAY_MS = 300000; // 5 minutes
  const SAVE_INTERVAL_MS = 5000;

  let lastSeenHref = null;
  let isAutoScrolling = false;
  let trackingPaused = false;
  let scrollButton = null;
  let tweetObserver = null;
  let saveTimer = null;
  const pageLoadTime = Date.now();

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

  // --- Feature 1: Auto-scroll on "voir X nouveaux" click ---

  function scrollSearchTweet(href, attempt) {
    const maxAttempts = 15;
    if (attempt >= maxAttempts) {
      log("gave up finding tweet after", maxAttempts, "attempts");
      return;
    }

    const tweet = findTweetByHref(href);
    if (tweet) {
      const targetY =
        tweet.getBoundingClientRect().top +
        document.documentElement.scrollTop -
        SCROLL_OFFSET;
      log(
        "found tweet at attempt",
        attempt,
        "scrolling to",
        Math.round(targetY),
      );
      smoothScrollTo(targetY);
      return;
    }

    document.documentElement.scrollTop += 500;
    log(
      "tweet not in DOM, scrolling down to load more (attempt",
      attempt + ")",
    );

    setTimeout(() => scrollSearchTweet(href, attempt + 1), 200);
  }

  function handleClick(e) {
    if (!isOnHomePage() || isOnForYouTab()) {
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

    const tweetAbsoluteY =
      targetTweet.getBoundingClientRect().top +
      document.documentElement.scrollTop;
    const oldScrollHeight = document.documentElement.scrollHeight;

    log("target tweet href:", href, "absoluteY:", Math.round(tweetAbsoluteY));

    waitForDomStable(() => {
      const heightAdded =
        document.documentElement.scrollHeight - oldScrollHeight;
      const estimatedY = tweetAbsoluteY + heightAdded;
      document.documentElement.scrollTop = estimatedY - SCROLL_OFFSET;
      log("phase 1: jumped to estimated position", Math.round(estimatedY));

      setTimeout(() => scrollSearchTweet(href, 0), 300);
    });
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
      updateButtonVisibility();
    });
  }

  function loadLastSeenTweet(callback) {
    if (!isContextValid()) {
      log("loadLastSeenTweet: context invalid, skipping");
      return;
    }
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      const href = result[STORAGE_KEY] || null;
      log("loadLastSeenTweet:", href ? "found" : "empty");
      callback(href);
    });
  }

  function startLastSeenTracking() {
    if (tweetObserver) {
      tweetObserver.disconnect();
    }

    tweetObserver = new IntersectionObserver(
      (entries) => {
        if (
          !isOnHomePage() ||
          isOnForYouTab() ||
          isAutoScrolling ||
          trackingPaused
        )
          return;

        for (const entry of entries) {
          if (entry.isIntersecting) {
            const href = getTweetHref(entry.target);
            if (href) {
              lastSeenHref = href;
            }
          }
        }
      },
      { threshold: 0.5 },
    );

    observeExistingTweets();

    // Also observe new tweets as they appear
    const domObserver = new MutationObserver(() => {
      observeExistingTweets();
    });
    domObserver.observe(document.body, { childList: true, subtree: true });
  }

  function observeExistingTweets() {
    if (!tweetObserver) return;
    const tweets = document.querySelectorAll(TWEET_SELECTOR);
    tweets.forEach((tweet) => {
      if (!tweet.dataset.xAutoScrollObserved) {
        tweet.dataset.xAutoScrollObserved = "1";
        tweetObserver.observe(tweet);
      }
    });
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
        backdrop-filter: blur(4px);
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

    // Hide if not on home page, on "Pour vous" tab, or if tabs aren't loaded yet
    const tablist = document.querySelector('[role="tablist"]');
    if (!isOnHomePage() || !tablist || isOnForYouTab()) {
      scrollButton.style.display = "none";
      return;
    }

    loadLastSeenTweet((href) => {
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

    let attempt = 0;

    function scrollStep() {
      if (!isAutoScrolling) return;

      // Check if tweet is now in DOM
      const tweet = findTweetByHref(targetHref);
      if (tweet) {
        isAutoScrolling = false;
        trackingPaused = true;
        scrollButton.classList.remove("scrolling");
        scrollButton.style.display = "none";
        chrome.storage.local.remove(STORAGE_KEY);

        // Resume tracking after 60s so new positions can be saved
        setTimeout(() => {
          trackingPaused = false;
          log("tracking resumed after scroll-to-last-seen");
        }, 60000);

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

        log("found last seen tweet at attempt", attempt);
        showToast("Position found!");
        return;
      }

      if (attempt >= MAX_SCROLL_ATTEMPTS) {
        isAutoScrolling = false;
        scrollButton.classList.remove("scrolling");
        scrollButton.classList.add("not-found");
        setTimeout(() => scrollButton.classList.remove("not-found"), 3000);
        log("gave up after", MAX_SCROLL_ATTEMPTS, "attempts");
        showToast("Tweet not found - it may have been removed");
        return;
      }

      document.documentElement.scrollTop += SCROLL_STEP;
      attempt++;

      if (attempt % 10 === 0) {
        log("auto-scroll attempt", attempt, "of", MAX_SCROLL_ATTEMPTS);
      }

      setTimeout(scrollStep, SCROLL_DELAY);
    }

    scrollStep();
  }

  function cancelAutoScroll() {
    isAutoScrolling = false;
    if (scrollButton) {
      scrollButton.classList.remove("scrolling");
    }
    log("auto-scroll cancelled by user");
    showToast("Scroll cancelled");
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

  // --- Periodic save ---

  function startPeriodicSave() {
    if (saveTimer) clearInterval(saveTimer);

    function doSave() {
      if (!isContextValid()) {
        clearInterval(saveTimer);
        return;
      }
      if (
        isOnHomePage() &&
        !isOnForYouTab() &&
        !trackingPaused &&
        lastSeenHref
      ) {
        saveLastSeenTweet();
      }
    }

    // First save after 5 minutes, then every SAVE_INTERVAL_MS
    setTimeout(() => {
      doSave();
      saveTimer = setInterval(doSave, SAVE_INTERVAL_MS);
    }, FIRST_SAVE_DELAY_MS);
  }

  // --- Init ---

  function init() {
    // Feature 1: click handler (restricted to non-"Pour vous" tabs)
    document.addEventListener("click", handleClick, true);

    // Feature 2: scroll button + tracking
    scrollButton = createScrollButton();
    updateButtonVisibility();
    startLastSeenTracking();
    startPeriodicSave();
    watchTabChanges();

    // Save when leaving page or switching tabs (more reliable than beforeunload alone)
    function trySave() {
      if (
        isOnHomePage() &&
        !isOnForYouTab() &&
        !trackingPaused &&
        lastSeenHref
      ) {
        saveLastSeenTweet();
      }
    }
    function trySaveIfOldEnough() {
      if (Date.now() - pageLoadTime >= MIN_TIME_BEFORE_SAVE_MS) {
        trySave();
      }
    }
    window.addEventListener("beforeunload", trySaveIfOldEnough);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        trySaveIfOldEnough();
      }
    });

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

    log("initialized - features: tab restriction + scroll-to-last-seen");
  }

  init();
})();
