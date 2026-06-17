"use strict";
(() => {
  // src/utils/logger.ts
  var LOG_PREFIX = "[YNT]";
  var LOG_STYLES = {
    MAIN_TITLE: {
      context: "[Main Title]",
      color: "#fcd34d",
      // yellow
    },
    BROWSING_TITLES: {
      context: "[Browsing Titles]",
      color: "#fca5a5",
      // light red
    },
    TITLES: {
      context: "[Titles]",
      color: "#86efac",
      // light green
    },
    DESCRIPTION: {
      context: "[Description]",
      color: "#2196F3",
      // blue
    },
    AUDIO: {
      context: "[Audio]",
      color: "#4CAF50",
      // green
    },
    CORE: {
      context: "[Core]",
      color: "#c084fc",
      // light purple
    },
    SUBTITLES: {
      context: "[Subtitles]",
      color: "#FF9800",
      // orange
    },
    CHANNEL_NAME: {
      context: "[Channel Name]",
      color: "#06b6d4",
      // light blue
    },
    CHAPTERS: {
      context: "[Chapters]",
      color: "#9C27B0",
      // purple
    },
    THUMBNAILS: {
      context: "[Thumbnails]",
      color: "#8B5CF6",
      // violet
    },
  };
  var ERROR_COLOR = "#F44336";
  var DEV_LOG_KEY = "ynt-devLog";
  browser.storage.local
    .get("settings")
    .then((data) => {
      const enabled = data?.settings?.devLog === true;
      localStorage.setItem(DEV_LOG_KEY, enabled ? "true" : "false");
    })
    .catch(() => {
      localStorage.setItem(DEV_LOG_KEY, "false");
    });
  browser.storage.onChanged.addListener((changes) => {
    if (changes.settings?.newValue?.devLog !== void 0) {
      localStorage.setItem(
        DEV_LOG_KEY,
        changes.settings.newValue.devLog ? "true" : "false",
      );
    }
  });
  function createLogger(category) {
    return (message, ...args) => {
      if (localStorage.getItem(DEV_LOG_KEY) !== "true") return;
      console.log(
        `%c${LOG_PREFIX}${category.context} ${message}`,
        `color: ${category.color}`,
        ...args,
      );
    };
  }
  function createErrorLogger(category) {
    return (message, ...args) => {
      if (localStorage.getItem(DEV_LOG_KEY) !== "true") return;
      console.log(
        `%c${LOG_PREFIX}${category.context} %c${message}`,
        `color: ${category.color}`,
        `color: ${ERROR_COLOR}`,
        ...args,
      );
    };
  }
  var coreLog = createLogger(LOG_STYLES.CORE);
  var coreErrorLog = createErrorLogger(LOG_STYLES.CORE);
  var titlesLog = createLogger(LOG_STYLES.TITLES);
  var titlesErrorLog = createErrorLogger(LOG_STYLES.TITLES);
  var mainTitleLog = createLogger(LOG_STYLES.MAIN_TITLE);
  var mainTitleErrorLog = createErrorLogger(LOG_STYLES.MAIN_TITLE);
  var browsingTitlesLog = createLogger(LOG_STYLES.BROWSING_TITLES);
  var browsingTitlesErrorLog = createErrorLogger(LOG_STYLES.BROWSING_TITLES);
  var audioLog = createLogger(LOG_STYLES.AUDIO);
  var audioErrorLog = createErrorLogger(LOG_STYLES.AUDIO);
  var descriptionLog = createLogger(LOG_STYLES.DESCRIPTION);
  var descriptionErrorLog = createErrorLogger(LOG_STYLES.DESCRIPTION);
  var subtitlesLog = createLogger(LOG_STYLES.SUBTITLES);
  var subtitlesErrorLog = createErrorLogger(LOG_STYLES.SUBTITLES);
  var channelNameLog = createLogger(LOG_STYLES.CHANNEL_NAME);
  var channelNameErrorLog = createErrorLogger(LOG_STYLES.CHANNEL_NAME);
  var chaptersLog = createLogger(LOG_STYLES.CHAPTERS);
  var chaptersErrorLog = createErrorLogger(LOG_STYLES.CHAPTERS);
  var browsingThumbnailsLog = createLogger(LOG_STYLES.THUMBNAILS);
  var browsingThumbnailsErrorLog = createErrorLogger(LOG_STYLES.THUMBNAILS);

  // src/config/constants.ts
  var DEFAULT_SETTINGS = {
    titleTranslation: true,
    originalThumbnails: {
      enabled: true,
    },
    audioTranslation: {
      enabled: true,
      language: "original",
    },
    descriptionTranslation: true,
    subtitlesTranslation: {
      enabled: false,
      language: "disabled",
      asrEnabled: false,
    },
    youtubeDataApi: {
      enabled: false,
      apiKey: "",
    },
    askForSupport: {
      enabled: false,
      installationDate: /* @__PURE__ */ new Date().toISOString(),
      lastPromptDate: "",
    },
    devLog: false,
  };

  // src/utils/browser.ts
  function isSafari() {
    const url = browser.runtime.getURL("");
    return url.startsWith("safari-web-extension://");
  }
  function isFirefox() {
    const url = browser.runtime.getURL("");
    return url.startsWith("moz-extension://");
  }
  function isChromium() {
    const url = browser.runtime.getURL("");
    return url.startsWith("chrome-extension://");
  }
  function isEdge() {
    return isChromium() && navigator.userAgent.includes("Edg/");
  }

  // src/utils/utils.ts
  function isToggleMessage(message) {
    return (
      typeof message === "object" &&
      message !== null &&
      "action" in message &&
      message.action === "toggleTranslation" &&
      "feature" in message &&
      (message.feature === "titles" ||
        message.feature === "audio" ||
        message.feature === "description" ||
        message.feature === "subtitles") &&
      "isEnabled" in message &&
      typeof message.isEnabled === "boolean"
    );
  }
  async function getChannelIdFromInnerTube(handle) {
    const channelHandle = handle;
    if (!channelHandle) {
      coreErrorLog("Channel handle is missing.");
      return null;
    }
    return new Promise((resolve) => {
      let script;
      const handleResult = (event) => {
        const detail = event.detail;
        window.removeEventListener(
          "ynt-get-channel-id-inner-tube",
          handleResult,
        );
        if (script) script.remove();
        resolve(detail?.channelId ?? null);
      };
      window.addEventListener("ynt-get-channel-id-inner-tube", handleResult);
      const url = browser.runtime.getURL(
        "modules/youtube-no-translation/dist/content/scripts/getChannelIdScript.js",
      );
      if (isSafari()) {
        fetch(url)
          .then((r) => r.text())
          .then((code) => {
            script = document.createElement("script");
            script.type = "text/javascript";
            script.textContent = code;
            script.async = true;
            script.setAttribute("data-channel-handle", channelHandle);
            document.documentElement.appendChild(script);
          })
          .catch(() => {
            window.removeEventListener(
              "ynt-get-channel-id-inner-tube",
              handleResult,
            );
            resolve(null);
          });
      } else {
        script = document.createElement("script");
        script.src = url;
        script.async = true;
        script.setAttribute("data-channel-handle", channelHandle);
        document.documentElement.appendChild(script);
      }
      setTimeout(() => {
        window.removeEventListener(
          "ynt-get-channel-id-inner-tube",
          handleResult,
        );
        if (script) script.remove();
        resolve(null);
      }, 3e3);
    });
  }
  function getChannelHandle(url) {
    const match = url.match(/youtube\.com\/@([^\/?#]+)/i);
    if (match && match[1]) {
      return match[1];
    }
    return null;
  }
  function isYouTubeDataAPIEnabled(settings) {
    return !!(
      settings &&
      settings.youtubeDataApi &&
      settings.youtubeDataApi.enabled &&
      typeof settings.youtubeDataApi.apiKey === "string" &&
      settings.youtubeDataApi.apiKey.length > 10
    );
  }

  // src/utils/settings.ts
  function sanitizeSettings(settings, defaults) {
    const added = [];
    const removed = [];
    const fixed = [];
    for (const key in settings) {
      if (
        Object.prototype.hasOwnProperty.call(settings, key) &&
        !Object.prototype.hasOwnProperty.call(defaults, key)
      ) {
        delete settings[key];
        removed.push(key);
      }
    }
    for (const key in defaults) {
      if (!Object.prototype.hasOwnProperty.call(defaults, key)) continue;
      const defaultValue = defaults[key];
      const currentValue = settings[key];
      const hasKey = key in settings;
      if (!hasKey) {
        settings[key] = defaultValue;
        added.push(key);
      } else if (isNestedObject(defaultValue)) {
        if (!isNestedObject(currentValue)) {
          settings[key] = defaultValue;
          fixed.push(key);
        } else {
          const nestedResult = sanitizeSettings(currentValue, defaultValue);
          added.push(
            ...nestedResult.added.map((nestedKey) => `${key}.${nestedKey}`),
          );
          removed.push(
            ...nestedResult.removed.map((nestedKey) => `${key}.${nestedKey}`),
          );
          fixed.push(
            ...nestedResult.fixed.map((nestedKey) => `${key}.${nestedKey}`),
          );
        }
      } else if (!isSameType(currentValue, defaultValue)) {
        settings[key] = defaultValue;
        fixed.push(key);
      }
    }
    return { added, removed, fixed };
  }
  function isNestedObject(value) {
    return (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    );
  }
  function isSameType(value1, value2) {
    if (value1 === null || value2 === null) {
      return value1 === value2;
    }
    if (Array.isArray(value1) !== Array.isArray(value2)) {
      return false;
    }
    return typeof value1 === typeof value2;
  }

  // src/utils/video.ts
  function extractVideoIdFromUrl(videoUrl) {
    try {
      const url = new URL(videoUrl);
      if (url.pathname.startsWith("/watch")) {
        return new URLSearchParams(url.search).get("v");
      } else if (url.pathname.startsWith("/shorts/")) {
        const pathParts = url.pathname.split("/");
        return pathParts.length > 2 ? pathParts[2] : null;
      }
      return null;
    } catch (urlError) {
      browsingTitlesErrorLog("Failed to parse video URL:", urlError);
      return null;
    }
  }
  function extractVideoIdFromWatchFlexy() {
    const watchFlexy = document.querySelector("ytd-watch-flexy");
    return watchFlexy?.getAttribute("video-id") || null;
  }
  function isNewYouTubePlayer() {
    const player = getYouTubePlayer();
    return player?.classList.contains("ytp-delhi-modern") ?? false;
  }
  function getYouTubePlayer() {
    let targetId = "movie_player";
    if (window.location.pathname.startsWith("/shorts")) {
      targetId = "shorts-player";
    } else if (window.location.pathname.startsWith("/@")) {
      targetId = "c4-player";
    }
    return document.getElementById(targetId);
  }

  // src/utils/navigation.ts
  function isSearchResultsPage() {
    return (
      window.location.pathname === "/results" ||
      window.location.pathname === "/feed/history" ||
      window.location.pathname === "/feed/subscriptions"
    );
  }
  function isMobileSite() {
    return window.location.hostname === "m.youtube.com";
  }
  function isYouTubeMusic() {
    return window.location.hostname === "music.youtube.com";
  }
  function isEmbedVideo() {
    return window.location.pathname.startsWith("/embed/");
  }
  function isIrrelevantIframe() {
    if (window === window.top) {
      return false;
    }
    return !isEmbedVideo();
  }

  // src/content/audio/audioIndex.ts
  async function syncAudioLanguagePreference() {
    try {
      const result = await browser.storage.local.get("settings");
      const settings = result.settings;
      if (!settings?.audioTranslation?.enabled) {
        return false;
      }
      if (settings?.audioTranslation?.language) {
        localStorage.setItem(
          "ynt-audioLanguage",
          settings.audioTranslation.language,
        );
      }
      return true;
    } catch (error) {
      audioErrorLog("Error syncing audio language preference:", error);
      return false;
    }
  }
  async function handleAudioTranslation() {
    if (isMobileSite()) {
      return;
    }
    const isEnabled = await syncAudioLanguagePreference();
    if (!isEnabled) {
      return;
    }
    const url = browser.runtime.getURL(
      "modules/youtube-no-translation/dist/content/scripts/audioScript.js",
    );
    if (isSafari()) {
      const code = await (await fetch(url)).text();
      const script = document.createElement("script");
      script.textContent = code;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    } else {
      const script = document.createElement("script");
      script.src = url;
      (document.head || document.documentElement).appendChild(script);
    }
  }
  browser.runtime.onMessage.addListener((message) => {
    if (
      typeof message === "object" &&
      message !== null &&
      "feature" in message &&
      message.feature === "audioLanguage" &&
      "language" in message &&
      typeof message.language === "string"
    ) {
      audioLog(`Setting audio language preference to: ${message.language}`);
      localStorage.setItem("ynt-audioLanguage", message.language);
      handleAudioTranslation();
    }
    return true;
  });

  // src/utils/text.ts
  function normalizeText(text, description = false) {
    if (text === null || text === void 0) {
      return "";
    }
    let normalizedText = text;
    if (description) {
      normalizedText = normalizedText.replace(
        /https?:\/\/(?:www\.)?[^\s]+/g,
        "",
      );
      normalizedText = normalizedText.replace(/\/\s*@?[a-zA-Z0-9_-]+/g, "");
      normalizedText = normalizedText.replace(/@[a-zA-Z0-9_-]+/g, "");
      normalizedText = normalizedText.replace(/\d+:\d+/g, "");
      normalizedText = normalizedText.replace(/[^\p{L}\p{N}\s]/gu, "");
      normalizedText = normalizedText.toLowerCase();
    }
    return normalizedText
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .replace(/[\p{Emoji}]/gu, "")
      .trim();
  }
  function calculateSimilarity(str1, str2) {
    const charCount1 = /* @__PURE__ */ new Map();
    const charCount2 = /* @__PURE__ */ new Map();
    for (const char of str1) {
      charCount1.set(char, (charCount1.get(char) || 0) + 1);
    }
    for (const char of str2) {
      charCount2.set(char, (charCount2.get(char) || 0) + 1);
    }
    let commonCount = 0;
    for (const [char, count1] of charCount1.entries()) {
      const count2 = charCount2.get(char) || 0;
      commonCount += Math.min(count1, count2);
    }
    const totalCount = Math.max(str1.length, str2.length);
    return commonCount / totalCount;
  }

  // src/utils/dom.ts
  function waitForElement(selector, timeout = 7500) {
    return new Promise((resolve, reject) => {
      const existingElement = document.querySelector(selector);
      if (existingElement) {
        return resolve(existingElement);
      }
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "childList") {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const element = node;
                if (element.matches(selector)) {
                  observer.disconnect();
                  clearTimeout(timer);
                  resolve(element);
                  return;
                }
                const descendant = element.querySelector(selector);
                if (descendant) {
                  observer.disconnect();
                  clearTimeout(timer);
                  resolve(descendant);
                  return;
                }
              }
            }
          }
        }
      });
      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error("Timeout waiting for element: " + selector));
      }, timeout);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    });
  }
  function waitForFilledVideoTitles(timeout = 5e3) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      function check() {
        const titles = Array.from(document.querySelectorAll("#video-title"));
        const allFilled =
          titles.length > 0 &&
          titles.every(
            (el) => el.textContent && el.textContent.trim().length > 0,
          );
        if (allFilled) {
          resolve();
        } else if (Date.now() - start > timeout) {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      }
      check();
    });
  }

  // src/content/titles/index.ts
  var TitleCache = class {
    // 24 hours in ms
    constructor() {
      this.cache = {};
      this.MAX_ENTRIES = 1e3;
      this.CLEANUP_INTERVAL = 24 * 60 * 60 * 1e3;
      this.loadCache();
    }
    /**
     * Loads the cache from browser.storage.local.
     */
    async loadCache() {
      if (isIrrelevantIframe()) {
        return;
      }
      try {
        const result = await browser.storage.local.get("ynt-cache");
        const cacheData = result["ynt-cache"];
        if (cacheData && "titles" in cacheData && cacheData.titles) {
          if (typeof cacheData.titles === "string") {
            this.cache = JSON.parse(cacheData.titles);
          } else {
            this.cache = cacheData.titles;
          }
          titlesLog("Persistent title cache loaded");
        }
      } catch (error) {
        titlesErrorLog("Failed to load persistent cache:", error);
      }
    }
    /**
     * Saves the cache to browser.storage.local.
     */
    async saveCache() {
      try {
        const result = await browser.storage.local.get("ynt-cache");
        const cacheData = result["ynt-cache"] || {};
        cacheData.titles = JSON.stringify(this.cache);
        await browser.storage.local.set({ "ynt-cache": cacheData });
      } catch (error) {
        titlesErrorLog("Failed to save persistent cache:", error);
      }
    }
    /**
     * Cleans up the cache if it is too old or too large.
     */
    async cleanupCache() {
      const currentTime = Date.now();
      let hasExpiredEntries = false;
      Object.keys(this.cache).forEach((videoId) => {
        const entry = this.cache[videoId];
        if (currentTime - entry.timestamp > this.CLEANUP_INTERVAL) {
          delete this.cache[videoId];
          hasExpiredEntries = true;
        }
      });
      if (hasExpiredEntries) {
        await this.saveCache();
        titlesLog("Expired title cache entries removed");
      }
      const keys = Object.keys(this.cache);
      if (keys.length > this.MAX_ENTRIES) {
        const sortedEntries = keys
          .map((key) => ({ key, timestamp: this.cache[key].timestamp }))
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, this.MAX_ENTRIES);
        const trimmed = {};
        sortedEntries.forEach((entry) => {
          trimmed[entry.key] = this.cache[entry.key];
        });
        this.cache = trimmed;
        await this.saveCache();
        titlesLog(
          "Title cache size limit reached, keeping most recent entries",
        );
      }
    }
    /**
     * Clears the cache completely.
     */
    async clear() {
      this.cache = {};
      try {
        const result = await browser.storage.local.get("ynt-cache");
        const cacheData = result["ynt-cache"] || {};
        delete cacheData.titles;
        if (Object.keys(cacheData).length === 0) {
          await browser.storage.local.remove("ynt-cache");
        } else {
          await browser.storage.local.set({ "ynt-cache": cacheData });
        }
      } catch (error) {
        titlesErrorLog("Failed to clear title cache:", error);
      }
      titlesLog("Cache cleared");
    }
    /**
     * Stores a title in the cache.
     */
    async setTitle(videoId, title) {
      await this.cleanupCache();
      if (title) {
        this.cache[videoId] = {
          content: title,
          timestamp: Date.now(),
        };
        await this.saveCache();
      }
    }
    /**
     * Retrieves a title from the cache.
     */
    getTitle(videoId) {
      this.cleanupCache().catch((error) => {
        titlesErrorLog("Failed to cleanup cache during read:", error);
      });
      return this.cache[videoId]?.content;
    }
  };
  var titleCache = new TitleCache();
  browser.runtime.onMessage.addListener((message) => {
    if (
      typeof message === "object" &&
      message !== null &&
      "action" in message
    ) {
      if (message.action === "clearCache") {
        titleCache.clear();
        coreLog("Title cache cleared via message");
        return Promise.resolve(true);
      }
    }
    return false;
  });
  async function fetchTitleInnerTube(videoId) {
    return new Promise((resolve) => {
      const handleTitle = (event) => {
        if (event.detail?.videoId === videoId) {
          window.removeEventListener(
            "ynt-browsing-title-inner-tube-data",
            handleTitle,
          );
          if (event.detail?.error) {
            titlesErrorLog(
              `InnerTube script error for ${videoId}: ${event.detail.error}`,
            );
          }
          resolve(event.detail?.title || null);
        }
      };
      window.addEventListener(
        "ynt-browsing-title-inner-tube-data",
        handleTitle,
      );
      const url = browser.runtime.getURL(
        "modules/youtube-no-translation/dist/content/scripts/TitlesInnerTube.js",
      );
      let script;
      if (isSafari()) {
        fetch(url)
          .then((r) => r.text())
          .then((code) => {
            script = document.createElement("script");
            script.type = "text/javascript";
            script.textContent = code;
            script.setAttribute("data-video-id", videoId);
            document.documentElement.appendChild(script);
            setTimeout(() => {
              script.remove();
            }, 100);
          })
          .catch(() => {
            window.removeEventListener(
              "ynt-browsing-title-inner-tube-data",
              handleTitle,
            );
            resolve(null);
          });
      } else {
        script = document.createElement("script");
        script.src = url;
        script.setAttribute("data-video-id", videoId);
        document.documentElement.appendChild(script);
        setTimeout(() => {
          script.remove();
        }, 100);
      }
      setTimeout(() => {
        window.removeEventListener(
          "ynt-browsing-title-inner-tube-data",
          handleTitle,
        );
        resolve(null);
      }, 3e3);
    });
  }
  async function fetchTitleOembed(videoId) {
    const apiUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}`;
    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return data.title || null;
    } catch (error) {
      titlesErrorLog(`Failed to fetch oEmbed title for ${videoId}: ${error}`);
      return null;
    }
  }

  // src/content/titles/mainTitle.ts
  var mainTitleContentObserver = null;
  var pageTitleObserver = null;
  var isEmptyObserver = null;
  var embedTitleContentObserver = null;
  var miniplayerTitleContentObserver = null;
  var mainTitleIsUpdating = false;
  var pageTitleDebounceTimer = null;
  var PAGE_TITLE_DEBOUNCE_MS = 200;
  var mainTitleContentDebounceTimer = null;
  var MAIN_TITLE_CONTENT_DEBOUNCE_MS = 200;
  var embedTitleContentDebounceTimer = null;
  var EMBED_TITLE_CONTENT_DEBOUNCE_MS = 200;
  function cleanupMainTitleContentObserver() {
    if (mainTitleContentObserver) {
      mainTitleContentObserver.disconnect();
      mainTitleContentObserver = null;
    }
    if (mainTitleContentDebounceTimer !== null) {
      clearTimeout(mainTitleContentDebounceTimer);
      mainTitleContentDebounceTimer = null;
    }
  }
  function cleanupIsEmptyObserver() {
    if (isEmptyObserver) {
      isEmptyObserver.disconnect();
      isEmptyObserver = null;
    }
  }
  function cleanupPageTitleObserver() {
    if (pageTitleObserver) {
      pageTitleObserver.disconnect();
      pageTitleObserver = null;
    }
    if (pageTitleDebounceTimer !== null) {
      clearTimeout(pageTitleDebounceTimer);
      pageTitleDebounceTimer = null;
    }
  }
  function cleanupEmbedTitleContentObserver() {
    if (embedTitleContentObserver) {
      embedTitleContentObserver.disconnect();
      embedTitleContentObserver = null;
    }
    if (embedTitleContentDebounceTimer !== null) {
      clearTimeout(embedTitleContentDebounceTimer);
      embedTitleContentDebounceTimer = null;
    }
  }
  function cleanupMiniplayerTitleContentObserver() {
    if (miniplayerTitleContentObserver) {
      miniplayerTitleContentObserver.disconnect();
      miniplayerTitleContentObserver = null;
    }
  }
  function updateMainTitleElement(element, title, videoId) {
    cleanupMainTitleContentObserver();
    cleanupIsEmptyObserver();
    element.removeAttribute("data-ynt-modified");
    mainTitleLog(
      `Updated main title from : %c${normalizeText(element.textContent)}%c to : %c${normalizeText(title)}%c (video id : %c${videoId}%c)`,
      "color: grey",
      "color: #fcd34d",
      "color: white; background: rgba(0,0,0,0.5); padding:2px 4px; border-radius:3px;",
      "color: #fcd34d",
      "color: #4ade80",
      "color: #fcd34d",
    );
    element.removeAttribute("is-empty");
    element.innerText = title;
    element.setAttribute("data-ynt-modified", "true");
    isEmptyObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "is-empty"
        ) {
          mainTitleLog("Blocking is-empty attribute");
          element.removeAttribute("is-empty");
          element.innerText = title;
        }
      });
    });
    isEmptyObserver.observe(element, {
      attributes: true,
      attributeFilter: ["is-empty"],
    });
    mainTitleContentObserver = new MutationObserver((mutations) => {
      if (mainTitleIsUpdating) return;
      if (mainTitleContentDebounceTimer !== null) {
        clearTimeout(mainTitleContentDebounceTimer);
      }
      mainTitleContentDebounceTimer = window.setTimeout(() => {
        const textNodes = Array.from(element.childNodes).filter(
          (node) => node.nodeType === Node.TEXT_NODE,
        );
        if (textNodes.length > 1) {
          mainTitleIsUpdating = true;
          element.innerText = title;
          mainTitleIsUpdating = false;
          mainTitleLog("Multiple text nodes detected, cleaning up");
        }
        mainTitleContentDebounceTimer = null;
      }, MAIN_TITLE_CONTENT_DEBOUNCE_MS);
    });
    mainTitleContentObserver.observe(element, {
      childList: true,
    });
  }
  function updatePageTitle(mainTitle) {
    cleanupPageTitleObserver();
    const expectedTitle = `${mainTitle} - YouTube`;
    mainTitleLog(
      `Updated page title from : %c${normalizeText(document.title)}%c to : %c${normalizeText(expectedTitle)}`,
      "color: grey",
      "color: #fcd34d",
      "color: white; background: rgba(0,0,0,0.5); padding:2px 4px; border-radius:3px;",
    );
    document.title = expectedTitle;
    const titleElement = document.querySelector("title");
    if (titleElement) {
      pageTitleObserver = new MutationObserver(() => {
        if (normalizeText(document.title) !== normalizeText(expectedTitle)) {
          if (pageTitleDebounceTimer !== null) {
            clearTimeout(pageTitleDebounceTimer);
          }
          pageTitleDebounceTimer = window.setTimeout(() => {
            if (
              normalizeText(document.title) !== normalizeText(expectedTitle)
            ) {
              mainTitleLog("YouTube changed page title, reverting");
              document.title = expectedTitle;
            }
            pageTitleDebounceTimer = null;
          }, PAGE_TITLE_DEBOUNCE_MS);
        }
      });
      pageTitleObserver.observe(titleElement, {
        childList: true,
      });
    }
  }
  function updateEmbedTitleElement(element, title, videoId) {
    cleanupEmbedTitleContentObserver();
    mainTitleLog(
      `Updated embed title from : %c${normalizeText(element.textContent)}%c to : %c${normalizeText(title)}%c (video id : %c${videoId}%c)`,
      "color: grey",
      "color: #fcd34d",
      "color: white; background: rgba(0,0,0,0.5); padding:2px 4px; border-radius:3px;",
      "color: #fcd34d",
      "color: #4ade80",
      "color: #fcd34d",
    );
    element.innerText = title;
    embedTitleContentObserver = new MutationObserver((mutations) => {
      if (embedTitleContentDebounceTimer !== null) {
        clearTimeout(embedTitleContentDebounceTimer);
      }
      embedTitleContentDebounceTimer = window.setTimeout(() => {
        const currentText = element.textContent;
        if (normalizeText(currentText) !== normalizeText(title)) {
          mainTitleLog("YouTube changed embed title, reverting");
          element.innerText = title;
        }
        embedTitleContentDebounceTimer = null;
      }, EMBED_TITLE_CONTENT_DEBOUNCE_MS);
    });
    embedTitleContentObserver.observe(element, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
  function updateMiniplayerTitleElement(element, title, videoId) {
    cleanupMiniplayerTitleContentObserver();
    mainTitleLog(
      `Updated miniplayer title from : %c${normalizeText(element.textContent)}%c to : %c${normalizeText(title)}%c (video id : %c${videoId}%c)`,
      "color: grey",
      "color: #fcd34d",
      "color: white; background: rgba(0,0,0,0.5); padding:2px 4px; border-radius:3px;",
      "color: #fcd34d",
      "color: #4ade80",
      "color: #fcd34d",
    );
    element.innerText = title;
    miniplayerTitleContentObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "childList" ||
          mutation.type === "characterData"
        ) {
          const currentText = element.textContent;
          if (normalizeText(currentText) !== normalizeText(title)) {
            mainTitleLog("YouTube changed miniplayer title, reverting");
            element.innerText = title;
          }
        }
      });
    });
    miniplayerTitleContentObserver.observe(element, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
  async function refreshMainTitle() {
    const mainTitleSelector = isMobileSite()
      ? "h2.slim-video-information-title span.yt-core-attributed-string"
      : "h1.ytd-watch-metadata > yt-formatted-string";
    const mainTitle = document.querySelector(mainTitleSelector);
    if (mainTitle && window.location.pathname === "/watch") {
      const videoId = new URLSearchParams(window.location.search).get("v");
      if (videoId) {
        const currentTitle = mainTitle.textContent;
        const originalTitle = await fetchMainTitle(videoId, false);
        if (!originalTitle) {
          mainTitleLog("Failed to get original title, keeping current");
          return;
        }
        if (
          normalizeText(currentTitle) === normalizeText(originalTitle) &&
          !mainTitle.hasAttribute("is-empty")
        ) {
          if (mainTitle.hasAttribute("data-ynt-modified")) {
          } else {
            mainTitleLog("Main title is already original");
          }
          const expectedPageTitle = `${originalTitle} - YouTube`;
          if (
            normalizeText(document.title) !== normalizeText(expectedPageTitle)
          ) {
            updatePageTitle(originalTitle);
          }
          return;
        }
        try {
          updateMainTitleElement(mainTitle, originalTitle, videoId);
          const expectedPageTitle = `${originalTitle} - YouTube`;
          if (
            normalizeText(document.title) !== normalizeText(expectedPageTitle)
          ) {
            updatePageTitle(originalTitle);
          }
        } catch (error) {
          mainTitleErrorLog(`Failed to update main title:`, error);
        }
      }
    }
  }
  async function refreshEmbedTitle() {
    cleanupEmbedTitleContentObserver();
    const isNewPlayer = isNewYouTubePlayer();
    let embedTitle = null;
    try {
      if (isNewPlayer) {
        embedTitle = await waitForElement(
          ".ytp-fullscreen-metadata .ytPlayerOverlayVideoDetailsRendererTitle span.yt-core-attributed-string",
        );
      } else {
        embedTitle = await waitForElement(".ytp-title-link");
      }
      if (embedTitle) {
        let videoId = null;
        if (window.location.pathname.startsWith("/embed/")) {
          videoId = window.location.pathname.split("/embed/")[1];
        } else if (window.location.pathname === "/watch") {
          videoId = new URLSearchParams(window.location.search).get("v");
        }
        if (videoId) {
          const currentTitle = embedTitle.textContent;
          const originalTitle = await fetchMainTitle(videoId, false);
          if (!originalTitle) {
            mainTitleLog("Failed to get original title, keeping current");
            return;
          }
          if (normalizeText(currentTitle) === normalizeText(originalTitle)) {
            return;
          }
          try {
            updateEmbedTitleElement(embedTitle, originalTitle, videoId);
            const expectedPageTitle = `${originalTitle} - YouTube`;
            if (
              normalizeText(document.title) !== normalizeText(expectedPageTitle)
            ) {
              updatePageTitle(originalTitle);
            }
          } catch (error) {
            mainTitleErrorLog(`Failed to update embed title:`, error);
          }
        }
      }
    } catch (error) {}
  }
  async function refreshMiniplayerTitle() {
    cleanupMiniplayerTitleContentObserver();
    try {
      const miniplayerTitle = await waitForElement(
        "ytd-miniplayer-info-bar h1.ytdMiniplayerInfoBarTitle span.yt-core-attributed-string",
      );
      let attempts = 0;
      const maxAttempts = 10;
      while (
        (!miniplayerTitle.textContent ||
          miniplayerTitle.textContent.trim() === "") &&
        attempts < maxAttempts
      ) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        attempts++;
      }
      if (
        !miniplayerTitle.textContent ||
        miniplayerTitle.textContent.trim() === ""
      ) {
        return;
      }
      if (miniplayerTitle) {
        let videoId = null;
        try {
          const miniplayerIdScript = document.createElement("script");
          miniplayerIdScript.type = "text/javascript";
          miniplayerIdScript.src = browser.runtime.getURL(
            "modules/youtube-no-translation/dist/content/scripts/getIdFromMiniPlayer.js",
          );
          const url = browser.runtime.getURL(
            "modules/youtube-no-translation/dist/content/scripts/getIdFromMiniPlayer.js",
          );
          videoId = await new Promise((resolve) => {
            const idListener = (event) => {
              window.removeEventListener("ynt-miniplayer-id", idListener);
              const { videoId: id, method } = event.detail;
              if (id) {
                mainTitleLog(
                  `[Miniplayer] Video ID found via ${method}: ${id}`,
                );
              } else {
                mainTitleErrorLog(
                  "[Miniplayer] Failed to get video ID from player APIs",
                );
              }
              resolve(id);
            };
            window.addEventListener("ynt-miniplayer-id", idListener);
            if (isSafari()) {
              fetch(url)
                .then((r) => r.text())
                .then((code) => {
                  const script = document.createElement("script");
                  script.type = "text/javascript";
                  script.textContent = code;
                  document.head.appendChild(script);
                  setTimeout(() => {
                    script.remove();
                  }, 100);
                })
                .catch(() => {
                  window.removeEventListener("ynt-miniplayer-id", idListener);
                  resolve(null);
                });
            } else {
              document.head.appendChild(miniplayerIdScript);
            }
            setTimeout(() => {
              window.removeEventListener("ynt-miniplayer-id", idListener);
              resolve(null);
            }, 3e3);
          });
        } catch (error) {
          mainTitleErrorLog("[Miniplayer] Error injecting script:", error);
        }
        if (videoId) {
          const originalTitle = await fetchMainTitle(videoId, false);
          if (!originalTitle) {
            mainTitleLog("Failed to get original title, keeping current");
            return;
          }
          const currentTitle = miniplayerTitle.textContent;
          if (normalizeText(currentTitle) === normalizeText(originalTitle)) {
            return;
          }
          try {
            updateMiniplayerTitleElement(
              miniplayerTitle,
              originalTitle,
              videoId,
            );
          } catch (error) {
            mainTitleErrorLog(`Failed to update miniplayer title:`, error);
          }
        } else {
          mainTitleErrorLog(
            "[Miniplayer] No video ID found, skipping title update",
          );
        }
      }
    } catch (error) {}
  }
  async function fetchMainTitle(
    videoId,
    fallbackToPageTitle = false,
    isShorts = false,
  ) {
    let originalTitle = null;
    originalTitle = titleCache.getTitle(videoId) || null;
    if (originalTitle) {
    }
    if (!originalTitle) {
      try {
        const url = browser.runtime.getURL(
          "modules/youtube-no-translation/dist/content/scripts/mainTitleScript.js",
        );
        const mainTitleScript = document.createElement("script");
        mainTitleScript.type = "text/javascript";
        mainTitleScript.src = url;
        const playerTitle = await new Promise((resolve) => {
          const titleListener = (event) => {
            window.removeEventListener("ynt-title-data", titleListener);
            resolve(event.detail.title);
          };
          window.addEventListener("ynt-title-data", titleListener);
          if (isSafari()) {
            fetch(url)
              .then((r) => r.text())
              .then((code) => {
                const script = document.createElement("script");
                script.type = "text/javascript";
                script.textContent = code;
                document.head.appendChild(script);
                setTimeout(() => {
                  script.remove();
                }, 100);
              })
              .catch(() => {
                window.removeEventListener("ynt-title-data", titleListener);
                resolve(null);
              });
          } else {
            document.head.appendChild(mainTitleScript);
          }
        });
        if (playerTitle) {
          originalTitle = playerTitle;
        }
      } catch (error) {
        mainTitleErrorLog("Failed to get title from player:", error);
      }
    }
    if (!originalTitle) {
      mainTitleLog("Falling back to oembed API");
      const oembedUrl = isShorts
        ? `https://www.youtube.com/oembed?url=https://www.youtube.com/shorts/${videoId}`
        : `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}`;
      originalTitle = (await fetchTitleOembed(videoId)) || null;
    }
    if (!originalTitle) {
      try {
        originalTitle = (await fetchTitleInnerTube(videoId)) || null;
      } catch (error) {
        mainTitleErrorLog(`InnerTube API error for ${videoId}:`, error);
      }
    }
    if (
      !originalTitle &&
      currentSettings?.youtubeDataApi?.enabled &&
      currentSettings?.youtubeDataApi?.apiKey
    ) {
      try {
        const youtubeApiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${currentSettings.youtubeDataApi.apiKey}&part=snippet`;
        const response = await fetch(youtubeApiUrl);
        if (response.ok) {
          const data = await response.json();
          if (data.items && data.items.length > 0) {
            originalTitle = data.items[0].snippet.title;
          }
        } else {
          mainTitleLog(
            `YouTube Data API v3 failed for ${videoId}: ${response.status} ${response.statusText}`,
          );
        }
      } catch (apiError) {
        mainTitleErrorLog(
          `YouTube Data API v3 error for ${videoId}:`,
          apiError,
        );
      }
    }
    if (!originalTitle && fallbackToPageTitle) {
      const currentPageTitle = document.title.replace(/ - YouTube$/, "");
      if (currentPageTitle.length > 0) {
        originalTitle = currentPageTitle;
        mainTitleLog(
          "Failed to get original title using APIs, using page title as last resort",
        );
      }
    }
    return originalTitle;
  }

  // src/content/subtitles/subtitlesIndex.ts
  async function syncSubtitlesLanguagePreference() {
    try {
      const result = await browser.storage.local.get("settings");
      const settings = result.settings;
      if (!settings?.subtitlesTranslation?.enabled) {
        return false;
      }
      if (settings.subtitlesTranslation.language) {
        localStorage.setItem(
          "ynt-subtitlesLanguage",
          settings.subtitlesTranslation.language,
        );
      }
      const asrEnabled = settings.subtitlesTranslation.asrEnabled || false;
      localStorage.setItem("ynt-subtitlesAsrEnabled", asrEnabled.toString());
      return true;
    } catch (error) {
      subtitlesLog("Error syncing subtitle language preference:", error);
      return false;
    }
  }
  async function handleSubtitlesTranslation() {
    const isEnabled = await syncSubtitlesLanguagePreference();
    if (!isEnabled) {
      return;
    }
    const url = browser.runtime.getURL(
      "modules/youtube-no-translation/dist/content/scripts/subtitlesScript.js",
    );
    if (isSafari()) {
      const code = await fetch(url).then((r) => r.text());
      const script = document.createElement("script");
      script.type = "text/javascript";
      script.textContent = code;
      document.documentElement.appendChild(script);
      script.remove();
      return;
    } else {
      const script = document.createElement("script");
      script.src = url;
      document.documentElement.appendChild(script);
    }
  }
  browser.runtime.onMessage.addListener((message) => {
    coreLog("Received message:", message);
    if (
      typeof message === "object" &&
      message !== null &&
      "feature" in message &&
      typeof message.feature === "string"
    ) {
      if (
        message.feature === "subtitlesLanguage" &&
        "language" in message &&
        typeof message.language === "string"
      ) {
        subtitlesLog(
          `Setting subtitle language preference to: ${message.language}`,
        );
        localStorage.setItem("ynt-subtitlesLanguage", message.language);
        handleSubtitlesTranslation();
      }
      if (
        message.feature === "asrSubtitles" &&
        "isEnabled" in message &&
        typeof message.isEnabled === "boolean"
      ) {
        subtitlesLog(`Setting ASR subtitles enabled to: ${message.isEnabled}`);
        localStorage.setItem(
          "ynt-subtitlesAsrEnabled",
          message.isEnabled.toString(),
        );
        handleSubtitlesTranslation();
      }
      if (message.feature === "subtitles") {
        subtitlesLog("Subtitles setting changed, syncing preferences");
        syncSubtitlesLanguagePreference();
        handleSubtitlesTranslation();
      }
    }
    return true;
  });

  // src/utils/videoSettings.ts
  function applyAudioTrack() {
    currentSettings?.audioTranslation.enabled && handleAudioTranslation();
  }
  function applySubtitleTrack() {
    currentSettings?.subtitlesTranslation.enabled &&
      handleSubtitlesTranslation();
  }
  function applyEmbedTitle() {
    currentSettings?.titleTranslation && refreshEmbedTitle();
  }
  function applyVideoPlayerSettings() {
    applySubtitleTrack();
    applyEmbedTitle();
  }

  // src/content/description/index.ts
  var DescriptionCache = class {
    // 24 hours in ms
    constructor() {
      this.cache = {};
      this.MAX_ENTRIES = 50;
      this.CLEANUP_INTERVAL = 24 * 60 * 60 * 1e3;
      this.loadCache();
    }
    async loadCache() {
      try {
        const result = await browser.storage.local.get("ynt-cache");
        const yntCache = result["ynt-cache"];
        if (yntCache && yntCache.descriptions) {
          if (typeof yntCache.descriptions === "string") {
            this.cache = JSON.parse(yntCache.descriptions);
          } else if (
            yntCache.descriptions &&
            typeof yntCache.descriptions === "object"
          ) {
            this.cache = yntCache.descriptions;
          }
          descriptionLog("Persistent description cache loaded");
        }
      } catch (error) {
        descriptionErrorLog(
          "Failed to load persistent description cache:",
          error,
        );
      }
    }
    async saveCache() {
      try {
        const result = await browser.storage.local.get("ynt-cache");
        const cacheData = result["ynt-cache"] || {};
        cacheData.descriptions = JSON.stringify(this.cache);
        await browser.storage.local.set({ "ynt-cache": cacheData });
      } catch (error) {
        descriptionErrorLog(
          "Failed to save persistent description cache:",
          error,
        );
      }
    }
    async cleanupCache() {
      const currentTime = Date.now();
      let hasExpiredEntries = false;
      Object.keys(this.cache).forEach((videoId) => {
        const entry = this.cache[videoId];
        if (currentTime - entry.timestamp > this.CLEANUP_INTERVAL) {
          delete this.cache[videoId];
          hasExpiredEntries = true;
        }
      });
      if (hasExpiredEntries) {
        await this.saveCache();
        descriptionLog("Expired description cache entries removed");
      }
      const keys = Object.keys(this.cache);
      if (keys.length > this.MAX_ENTRIES) {
        const sortedEntries = keys
          .map((key) => ({ key, timestamp: this.cache[key].timestamp }))
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, this.MAX_ENTRIES);
        const trimmed = {};
        sortedEntries.forEach((entry) => {
          trimmed[entry.key] = this.cache[entry.key];
        });
        this.cache = trimmed;
        await this.saveCache();
        descriptionLog(
          "Description cache size limit reached, keeping most recent entries",
        );
      }
    }
    async clear() {
      this.cache = {};
      try {
        const result = await browser.storage.local.get("ynt-cache");
        const cacheData = result["ynt-cache"] || {};
        delete cacheData.descriptions;
        if (Object.keys(cacheData).length === 0) {
          await browser.storage.local.remove("ynt-cache");
        } else {
          await browser.storage.local.set({ "ynt-cache": cacheData });
        }
      } catch (error) {
        descriptionErrorLog("Failed to clear description cache:", error);
      }
      descriptionLog("Description cache cleared");
    }
    async setDescription(videoId, description) {
      await this.cleanupCache();
      if (description) {
        this.cache[videoId] = {
          content: description,
          timestamp: Date.now(),
        };
        await this.saveCache();
      }
    }
    getDescription(videoId) {
      this.cleanupCache().catch((error) => {
        descriptionErrorLog("Failed to cleanup cache during read:", error);
      });
      return this.cache[videoId]?.content;
    }
  };
  var descriptionCache = new DescriptionCache();
  browser.runtime.onMessage.addListener((message) => {
    if (
      typeof message === "object" &&
      message !== null &&
      "action" in message
    ) {
      if (message.action === "clearCache") {
        descriptionCache.clear();
        coreLog("[Description cache cleared via message");
        return Promise.resolve(true);
      }
    }
    return false;
  });

  // src/content/description/searchDescriptions.ts
  var searchDescriptionsObserver = /* @__PURE__ */ new Map();
  var searchDescriptionsDebounceTimers = /* @__PURE__ */ new Map();
  var SEARCH_DESCRIPTIONS_DEBOUNCE_MS = 200;
  function cleanupSearchDescriptionElement(element) {
    const observer = searchDescriptionsObserver.get(element);
    if (observer) {
      observer.disconnect();
      searchDescriptionsObserver.delete(element);
    }
    const timer = searchDescriptionsDebounceTimers.get(element);
    if (timer !== void 0) {
      clearTimeout(timer);
      searchDescriptionsDebounceTimers.delete(element);
    }
  }
  function cleanupAllSearchDescriptionsObservers() {
    searchDescriptionsObserver.forEach((observer, element) => {
      observer.disconnect();
    });
    searchDescriptionsObserver.clear();
    searchDescriptionsDebounceTimers.forEach((timer) => {
      clearTimeout(timer);
    });
    searchDescriptionsDebounceTimers.clear();
  }
  async function fetchSearchDescriptionInnerTube(videoId) {
    return new Promise((resolve) => {
      const handleDescription = (event) => {
        if (event.detail?.videoId === videoId) {
          window.removeEventListener(
            "ynt-search-description-inner-tube-data",
            handleDescription,
          );
          if (event.detail?.error) {
            descriptionErrorLog(
              `InnerTube script error for ${videoId}: ${event.detail.error}`,
            );
          }
          resolve(event.detail?.description || null);
        }
      };
      window.addEventListener(
        "ynt-search-description-inner-tube-data",
        handleDescription,
      );
      const url = browser.runtime.getURL(
        "modules/youtube-no-translation/dist/content/scripts/searchDescriptionInnerTube.js",
      );
      let script;
      if (isSafari()) {
        fetch(url)
          .then((r) => r.text())
          .then((code) => {
            script = document.createElement("script");
            script.type = "text/javascript";
            script.textContent = code;
            script.setAttribute("data-video-id", videoId);
            document.documentElement.appendChild(script);
            script.remove();
          })
          .catch(() => {
            window.removeEventListener(
              "ynt-search-description-inner-tube-data",
              handleDescription,
            );
            resolve(null);
          });
      } else {
        script = document.createElement("script");
        script.src = url;
        script.setAttribute("data-video-id", videoId);
        document.documentElement.appendChild(script);
      }
      setTimeout(() => {
        window.removeEventListener(
          "ynt-search-description-inner-tube-data",
          handleDescription,
        );
        if (script) script.remove();
        resolve(null);
      }, 3e3);
    });
  }
  function updateSearchDescriptionElement(element, description, videoId) {
    cleanupSearchDescriptionElement(element);
    descriptionLog(
      `Updated search description for video: %c${videoId}%c`,
      "color: #4ade80",
      "color: #fca5a5",
    );
    if (!document.querySelector("#ynt-search-style")) {
      const style = document.createElement("style");
      style.id = "ynt-search-style";
      style.textContent = `
            /* Hide translated description text */
            .metadata-snippet-text[ynt-search] {
                display: none !important;
            }

            /* Show original description using CSS variables for regular videos */
            .metadata-snippet-container[ynt-search]::after {
                content: attr(data-original-description);
                font-size: var(--ytd-tab-system-font-size-body);
                line-height: var(--ytd-tab-system-line-height-body);
                font-family: var(--ytd-tab-system-font-family);
                color: var(--yt-spec-text-secondary);
                white-space: pre-line;
            }

            /* Show original description using CSS variables for videos with chapters */
            .metadata-snippet-container-one-line[ynt-search]::after {
                content: attr(data-original-description);
                font-size: var(--ytd-tab-system-font-size-body);
                line-height: var(--ytd-tab-system-line-height-body);
                font-family: var(--ytd-tab-system-font-family);
                color: var(--yt-spec-text-secondary);
                white-space: pre-line;
            }

            /* Show original description for history page */
            ytd-video-renderer #description-text[ynt-search] {
                display: block !important;
                color: var(--yt-spec-text-secondary);
                white-space: pre-line;
            }
        `;
      document.head.appendChild(style);
    }
    const container = element.closest(
      ".metadata-snippet-container, .metadata-snippet-container-one-line",
    );
    const lines = description.split("\n");
    const shortDescription = lines.slice(0, 2).join("\n");
    const truncatedDescription =
      shortDescription.length > 100
        ? shortDescription.substring(0, 100) + "..."
        : shortDescription;
    if (container) {
      container.setAttribute("data-original-description", truncatedDescription);
      container.setAttribute("ynt-search", videoId);
      element.setAttribute("ynt-search", videoId);
      element.setAttribute("translate", "no");
    } else if (element.id === "description-text") {
      element.textContent = truncatedDescription;
      element.setAttribute("ynt-search", videoId);
      element.setAttribute("translate", "no");
    }
    const observer = new MutationObserver((mutations) => {
      const existingTimer = searchDescriptionsDebounceTimers.get(element);
      if (existingTimer !== void 0) {
        clearTimeout(existingTimer);
      }
      const timer = window.setTimeout(() => {
        mutations.forEach((mutation) => {
          if (
            mutation.type === "childList" ||
            mutation.type === "characterData"
          ) {
            if (!element.hasAttribute("ynt-search")) {
              element.setAttribute("ynt-search", videoId);
            }
            if (container && !container.hasAttribute("ynt-search")) {
              container.setAttribute("ynt-search", videoId);
              container.setAttribute(
                "data-original-description",
                truncatedDescription,
              );
            }
            if (!container && element.id === "description-text") {
              element.textContent = truncatedDescription;
            }
          }
        });
        searchDescriptionsDebounceTimers.delete(element);
      }, SEARCH_DESCRIPTIONS_DEBOUNCE_MS);
      searchDescriptionsDebounceTimers.set(element, timer);
    });
    observer.observe(element, { childList: true, characterData: true });
    if (container) {
      observer.observe(container, { childList: true, attributes: true });
    }
    searchDescriptionsObserver.set(element, observer);
  }
  function shouldProcessSearchDescriptionElement(isTranslated) {
    if (!currentSettings) return false;
    return (
      isSearchResultsPage() &&
      !isMobileSite() &&
      isTranslated &&
      currentSettings.descriptionTranslation
    );
  }
  async function batchFetchDescriptionsFromYouTubeDataApi(videoIds) {
    const descriptionMap = /* @__PURE__ */ new Map();
    if (!isYouTubeDataAPIEnabled(currentSettings)) {
      return descriptionMap;
    }
    const batchSize = 50;
    for (let i = 0; i < videoIds.length; i += batchSize) {
      const batch = videoIds.slice(i, i + batchSize);
      const idsParam = batch.join(",");
      try {
        const youtubeApiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${idsParam}&key=${currentSettings?.youtubeDataApi.apiKey}&part=snippet`;
        const response = await fetch(youtubeApiUrl);
        if (response.ok) {
          const data = await response.json();
          if (data.items) {
            data.items.forEach((item) => {
              if (item.snippet?.description) {
                descriptionMap.set(item.id, item.snippet.description);
              }
            });
          }
        } else {
          descriptionErrorLog(
            `YouTube Data API v3 batch failed for descriptions: ${response.status} ${response.statusText}`,
          );
        }
      } catch (apiError) {
        descriptionErrorLog(
          `YouTube Data API v3 batch error for descriptions:`,
          apiError,
        );
      }
    }
    return descriptionMap;
  }
  async function fetchOriginalDescription(
    videoId,
    preferenceFetchedDescriptions,
  ) {
    let originalDescription = null;
    if (preferenceFetchedDescriptions?.has(videoId)) {
      const batchDescription = preferenceFetchedDescriptions.get(videoId);
      if (batchDescription && batchDescription.trim()) {
        originalDescription = batchDescription;
      }
    }
    if (!originalDescription) {
      const cached = descriptionCache.getDescription(videoId);
      if (cached) {
        originalDescription = cached;
      }
    }
    if (!originalDescription) {
      try {
        originalDescription = await fetchSearchDescriptionInnerTube(videoId);
      } catch (error) {
        descriptionErrorLog(
          `InnerTube API error for description ${videoId}:`,
          error,
        );
      }
    }
    return originalDescription;
  }
  async function batchProcessSearchDescriptions(titleElements, videoIds) {
    if (!currentSettings?.descriptionTranslation || !isSearchResultsPage()) {
      return;
    }
    const descriptionsToProcess = [];
    for (let i = 0; i < titleElements.length; i++) {
      const titleElement = titleElements[i];
      const videoId = videoIds[i];
      if (!titleElement || !videoId) continue;
      const videoElement = titleElement.closest("ytd-video-renderer");
      if (videoElement) {
        let descriptionElement = videoElement.querySelector(
          ".metadata-snippet-text",
        );
        if (!descriptionElement) {
          descriptionElement = videoElement.querySelector("#description-text");
        }
        if (descriptionElement) {
          const isAlreadyProcessed =
            descriptionElement.hasAttribute("ynt-search") &&
            descriptionElement.getAttribute("ynt-search") === videoId;
          const hasFailed =
            descriptionElement.hasAttribute("ynt-search-fail") &&
            descriptionElement.getAttribute("ynt-search-fail") === videoId;
          if (!isAlreadyProcessed && !hasFailed) {
            descriptionsToProcess.push({
              descriptionElement,
              videoId,
              titleElement,
            });
          }
        }
      }
    }
    if (descriptionsToProcess.length === 0) {
      return;
    }
    let preferenceFetchedDescriptions;
    if (isYouTubeDataAPIEnabled(currentSettings)) {
      const descriptionVideoIds = descriptionsToProcess.map((d) => d.videoId);
      preferenceFetchedDescriptions =
        await batchFetchDescriptionsFromYouTubeDataApi(descriptionVideoIds);
      descriptionLog(
        `Batch fetched ${preferenceFetchedDescriptions.size} descriptions from YouTube Data API v3`,
      );
    }
    for (const {
      descriptionElement,
      videoId,
      titleElement,
    } of descriptionsToProcess) {
      try {
        const originalDescription = await fetchOriginalDescription(
          videoId,
          preferenceFetchedDescriptions,
        );
        if (originalDescription) {
          updateSearchDescriptionElement(
            descriptionElement,
            originalDescription,
            videoId,
          );
          if (!descriptionCache.getDescription(videoId)) {
            await descriptionCache.setDescription(videoId, originalDescription);
          }
        } else {
          descriptionElement.setAttribute("ynt-search-fail", videoId);
        }
      } catch (descError) {
        descriptionErrorLog(
          `Failed to update search description for ${videoId}:`,
          descError,
        );
        descriptionElement.setAttribute("ynt-search-fail", videoId);
      }
    }
  }

  // src/content/Thumbnails/browsingThumbnails.ts
  var thumbnailObservers = /* @__PURE__ */ new Map();
  function removeTranslationMarkers(thumbnailUrl) {
    let originalUrl = thumbnailUrl.replace("vi_lc", "vi");
    originalUrl = originalUrl.replace(/_[a-zA-Z-]+(?=\.jpg)/, "");
    return originalUrl;
  }
  function isThumbnailTranslated(thumbnailUrl) {
    return (
      thumbnailUrl.includes("vi_lc") && /_[a-z]{2,3}\.jpg/i.test(thumbnailUrl)
    );
  }
  function isThumbnailPlaceholder(src) {
    return (
      !src ||
      src === "" ||
      src.includes("data:image") ||
      src.includes("placeholder")
    );
  }
  function setupThumbnailObserver(thumbnailImg, videoId) {
    const existingObserver = thumbnailObservers.get(thumbnailImg);
    if (existingObserver) {
      existingObserver.disconnect();
      thumbnailObservers.delete(thumbnailImg);
    }
    thumbnailImg.setAttribute("ynt-thumbnail", "observed");
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "src"
        ) {
          const currentSrc = thumbnailImg.src;
          if (!isThumbnailPlaceholder(currentSrc)) {
            if (isThumbnailTranslated(currentSrc)) {
              const restoredUrl = removeTranslationMarkers(currentSrc);
              thumbnailImg.src = restoredUrl;
              browsingThumbnailsLog(
                `Restored lazy-loaded thumbnail for video %c${videoId}%c`,
                "color: #4ade80",
                "color: #fca5a5",
              );
            }
            observer.disconnect();
            thumbnailObservers.delete(thumbnailImg);
          }
        }
      });
    });
    observer.observe(thumbnailImg, {
      attributes: true,
      attributeFilter: ["src"],
    });
    thumbnailObservers.set(thumbnailImg, observer);
  }
  function restoreOriginalThumbnail(videoId, titleElement) {
    try {
      const parentSelectors = isMobileSite()
        ? "ytm-video-with-context-renderer, ytm-video-card-renderer, ytm-compact-video-renderer"
        : "ytd-rich-grid-media, ytd-video-renderer, ytd-compact-video-renderer, ytd-rich-item-renderer, ytd-grid-video-renderer, .yt-lockup-view-model";
      const commonParent = titleElement.closest(parentSelectors);
      if (!commonParent) {
        return;
      }
      const thumbnailImg = commonParent.querySelector("img.ytCoreImageHost");
      if (!thumbnailImg) {
        return;
      }
      if (thumbnailImg.hasAttribute("ynt-thumbnail")) {
        return;
      }
      const currentSrc = thumbnailImg.src;
      if (isThumbnailPlaceholder(currentSrc)) {
        setupThumbnailObserver(thumbnailImg, videoId);
        return;
      }
      if (isThumbnailTranslated(currentSrc)) {
        const originalUrl = removeTranslationMarkers(currentSrc);
        thumbnailImg.src = originalUrl;
        thumbnailImg.setAttribute("ynt-thumbnail", "processed");
        browsingThumbnailsLog(
          `Updated thumbnail from translated to original for video %c${videoId}%c (${isMobileSite() ? "mobile" : "desktop"})`,
          "color: #4ade80",
          "color: #fca5a5",
        );
        return;
      }
      thumbnailImg.setAttribute("ynt-thumbnail", "original");
    } catch (error) {
      browsingThumbnailsErrorLog(
        `Failed to restore original thumbnail for ${videoId}:`,
        error,
      );
    }
  }
  function cleanupThumbnailObservers() {
    thumbnailObservers.forEach((observer) => {
      observer.disconnect();
    });
    thumbnailObservers.clear();
    document.querySelectorAll("img[ynt-thumbnail]").forEach((img) => {
      img.removeAttribute("ynt-thumbnail");
    });
  }

  // src/content/titles/browsingTitles.ts
  var browsingTitlesObserver = /* @__PURE__ */ new Map();
  var browsingTitlesDebounceTimer = null;
  var lastBrowsingShortsRefresh = 0;
  var TITLES_DEBOUNCE = 10;
  var processingVideos = /* @__PURE__ */ new Set();
  function cleanupBrowsingTitleElement(element) {
    const observer = browsingTitlesObserver.get(element);
    if (observer) {
      observer.disconnect();
      browsingTitlesObserver.delete(element);
    }
  }
  function cleanupAllBrowsingTitlesElementsObservers() {
    browsingTitlesObserver.forEach((observer, element) => {
      observer.disconnect();
    });
    browsingTitlesObserver.clear();
    lastBrowsingShortsRefresh = 0;
    processingVideos.clear();
    if (browsingTitlesDebounceTimer !== null) {
      clearTimeout(browsingTitlesDebounceTimer);
      browsingTitlesDebounceTimer = null;
    }
  }
  function updateBrowsingTitleElement(
    element,
    title,
    videoId,
    isBrowsingTitle = true,
  ) {
    cleanupBrowsingTitleElement(element);
    element.removeAttribute("ynt");
    element.removeAttribute("ynt-fail");
    element.removeAttribute("ynt-fail-retry");
    element.removeAttribute("ynt-original");
    const previousTitle = element.textContent;
    element.textContent = title;
    element.setAttribute("title", title);
    element.setAttribute("ynt", videoId);
    if (isBrowsingTitle) {
      browsingTitlesLog(
        `Updated title from : %c${normalizeText(previousTitle)}%c to : %c${normalizeText(title)}%c (video id : %c${videoId}%c)`,
        "color: grey",
        "color: #fca5a5",
        "color: white; background: rgba(0,0,0,0.5); padding:2px 4px; border-radius:3px;",
        "color: #fca5a5",
        "color: #4ade80",
        "color: #fca5a5",
      );
    } else {
      titlesLog(
        `Updated title from : %c${normalizeText(previousTitle)}%c to : %c${normalizeText(title)}%c (video id : %c${videoId}%c)`,
        "color: grey",
        "color: #fca5a5",
        "color: white; background: rgba(0,0,0,0.5); padding:2px 4px; border-radius:3px;",
        "color: #fca5a5",
        "color: #4ade80",
        "color: #fca5a5",
      );
    }
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          if (element.textContent !== title) {
            element.textContent = title;
          }
        }
      });
    });
    observer.observe(element, {
      childList: true,
    });
    browsingTitlesObserver.set(element, observer);
  }
  function shouldProcessBrowsingElement(titleElement) {
    if (titleElement.classList.contains("cbCustomTitle")) {
      return { shouldProcess: false };
    }
    const videoUrl = titleElement.closest("a")?.href;
    if (!videoUrl) {
      return { shouldProcess: false };
    }
    const hasPlaylistParam =
      videoUrl.includes("list=") && !videoUrl.includes("&index=");
    const isRichGridPlaylist =
      titleElement.closest("ytd-rich-grid-media") !== null && hasPlaylistParam;
    const parentLink = titleElement.closest(
      "a.yt-lockup-metadata-view-model__title, a.yt-lockup-metadata-view-model-wiz__title, a.ytLockupMetadataViewModelTitle, a.ytLockupMetadataViewModelWizTitle",
    );
    const isPlaylistAlternativeContainer =
      !!parentLink &&
      parentLink.getAttribute("href")?.includes("list=") &&
      !parentLink.getAttribute("href")?.includes("index=");
    const isInKnownPlaylistRenderer = !!titleElement.closest(
      "ytd-grid-playlist-renderer, ytd-playlist-renderer, ytd-compact-playlist-renderer, ytd-playlist-panel-renderer",
    );
    const anchor = titleElement.closest("a#video-title");
    const anchorIsGridPlaylistLink =
      !!anchor && anchor.classList.contains("ytd-grid-playlist-renderer");
    const h3Parent = titleElement.closest("h3");
    const metadataContainer = h3Parent?.parentElement?.querySelector(
      "yt-content-metadata-view-model, .ytContentMetadataViewModelMetadataRow",
    );
    const isPlaylistByMetadata =
      !!metadataContainer &&
      metadataContainer.textContent?.includes("Playlist");
    const isPlaylistContainer =
      isRichGridPlaylist ||
      isPlaylistAlternativeContainer ||
      (hasPlaylistParam &&
        (isInKnownPlaylistRenderer || anchorIsGridPlaylistLink)) ||
      (hasPlaylistParam && isPlaylistByMetadata);
    if (isPlaylistContainer) {
      titleElement.removeAttribute("ynt-fail");
      titleElement.removeAttribute("ynt-original");
      titleElement.removeAttribute("ynt");
      if (
        titleElement.textContent &&
        titleElement.getAttribute("title") !== titleElement.textContent
      ) {
        titleElement.setAttribute("title", titleElement.textContent);
      }
      return { shouldProcess: false };
    }
    const videoId = extractVideoIdFromUrl(videoUrl);
    if (!videoId) {
      return { shouldProcess: false };
    }
    if (processingVideos.has(videoId)) {
      return { shouldProcess: false };
    }
    return {
      shouldProcess: true,
      videoId,
      videoUrl,
    };
  }
  function checkElementProcessingState(titleElement, videoId) {
    if (titleElement.hasAttribute("ynt")) {
      if (titleElement.getAttribute("ynt") === videoId) {
        const directTextNodes = Array.from(titleElement.childNodes).filter(
          (node) =>
            node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        );
        if (
          directTextNodes.length === 1 &&
          normalizeText(directTextNodes[0].textContent || "") ===
            normalizeText(titleElement.getAttribute("title") || "")
        ) {
          return { shouldSkip: true, shouldClean: false };
        } else {
          return { shouldSkip: false, shouldClean: true };
        }
      } else {
        return { shouldSkip: false, shouldClean: true };
      }
    }
    if (titleElement.hasAttribute("ynt-fail")) {
      if (titleElement.getAttribute("ynt-fail") === videoId) {
        const parentTitle = titleElement.parentElement?.getAttribute("title");
        if (parentTitle) {
          if (
            normalizeText(titleElement.getAttribute("title")) !==
            normalizeText(parentTitle)
          ) {
            titleElement.setAttribute("title", parentTitle);
          }
          if (
            normalizeText(titleElement.textContent) !==
            normalizeText(parentTitle)
          ) {
            titleElement.textContent = parentTitle;
          }
        }
        return { shouldSkip: true, shouldClean: false };
      }
      titleElement.removeAttribute("ynt-fail");
    }
    if (titleElement.hasAttribute("ynt-original")) {
      if (titleElement.getAttribute("ynt-original") === videoId) {
        const parentTitle = titleElement.parentElement?.getAttribute("title");
        if (parentTitle) {
          if (
            normalizeText(titleElement.getAttribute("title")) !==
            normalizeText(parentTitle)
          ) {
            titleElement.setAttribute("title", parentTitle);
          }
          if (
            normalizeText(titleElement.textContent) !==
            normalizeText(parentTitle)
          ) {
            titleElement.textContent = parentTitle;
          }
        }
        return { shouldSkip: true, shouldClean: false };
      }
      titleElement.removeAttribute("ynt-original");
    }
    return { shouldSkip: false, shouldClean: false };
  }
  async function batchFetchTitlesFromYouTubeDataApi(videoIds) {
    const titleMap = /* @__PURE__ */ new Map();
    if (!isYouTubeDataAPIEnabled(currentSettings)) {
      return titleMap;
    }
    const batchSize = 50;
    for (let i = 0; i < videoIds.length; i += batchSize) {
      const batch = videoIds.slice(i, i + batchSize);
      const idsParam = batch.join(",");
      try {
        const youtubeApiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${idsParam}&key=${currentSettings?.youtubeDataApi.apiKey}&part=snippet`;
        const response = await fetch(youtubeApiUrl);
        if (response.ok) {
          const data = await response.json();
          if (data.items) {
            data.items.forEach((item) => {
              if (item.snippet?.title) {
                titleMap.set(item.id, item.snippet.title);
              }
            });
          }
        } else {
          browsingTitlesErrorLog(
            `YouTube Data API v3 batch failed: ${response.status} ${response.statusText}`,
          );
        }
      } catch (apiError) {
        browsingTitlesErrorLog(`YouTube Data API v3 batch error:`, apiError);
      }
    }
    return titleMap;
  }
  async function fetchOriginalTitle(
    videoId,
    titleElement,
    currentTitle,
    preferenceFetchedTitles,
  ) {
    let originalTitle = null;
    originalTitle = titleCache.getTitle(videoId) || null;
    if (originalTitle) {
    }
    if (!originalTitle && preferenceFetchedTitles?.has(videoId)) {
      originalTitle = preferenceFetchedTitles.get(videoId) || null;
    }
    if (!originalTitle) {
      try {
        originalTitle = (await fetchTitleOembed(videoId)) || null;
      } catch (error) {
        browsingTitlesErrorLog(`oEmbed API error for ${videoId}:`, error);
      }
    }
    if (!originalTitle) {
      try {
        originalTitle = (await fetchTitleInnerTube(videoId)) || null;
      } catch (error) {
        browsingTitlesErrorLog(`InnerTube API error for ${videoId}:`, error);
      }
    }
    if (!originalTitle) {
      titleElement.setAttribute("ynt-fail", videoId);
      const parentTitle = titleElement.parentElement?.getAttribute("title");
      if (!currentTitle) {
        if (parentTitle) {
          titleElement.textContent = parentTitle;
          if (
            normalizeText(titleElement.getAttribute("title")) !==
            normalizeText(parentTitle)
          ) {
            titleElement.setAttribute("title", parentTitle);
          }
          browsingTitlesErrorLog(
            `No title found for %c${videoId}%c and no title element, restoring title: %c${normalizeText(parentTitle)}%c`,
            "color: #4ade80",
            "color: #F44336",
            "color: white",
            "color: #F44336",
          );
        }
      } else {
        if (parentTitle) {
          if (
            normalizeText(titleElement.getAttribute("title")) !==
            normalizeText(parentTitle)
          ) {
            titleElement.setAttribute("title", parentTitle);
          }
          if (normalizeText(currentTitle) !== normalizeText(parentTitle)) {
            titleElement.textContent = parentTitle;
          }
        }
        browsingTitlesErrorLog(
          `No title found for %c${videoId}%c, keeping current title: %c${normalizeText(currentTitle)}%c`,
          "color: #4ade80",
          "color: #F44336",
          "color: white",
          "color: #F44336",
        );
      }
      return {
        originalTitle: null,
        shouldSkip: true,
        shouldMarkAsOriginal: false,
        shouldMarkAsFailed: true,
      };
    }
    if (normalizeText(currentTitle) === normalizeText(originalTitle)) {
      titleElement.removeAttribute("ynt");
      titleElement.setAttribute("ynt-original", videoId);
      if (
        normalizeText(titleElement.getAttribute("title")) !==
        normalizeText(currentTitle)
      ) {
        titleElement.setAttribute("title", currentTitle);
      }
      return {
        originalTitle,
        shouldSkip: true,
        shouldMarkAsOriginal: true,
        shouldMarkAsFailed: false,
      };
    }
    titleCache.setTitle(videoId, originalTitle);
    return {
      originalTitle,
      shouldSkip: false,
      shouldMarkAsOriginal: false,
      shouldMarkAsFailed: false,
    };
  }
  async function refreshBrowsingVideos() {
    if (browsingTitlesDebounceTimer !== null) {
      clearTimeout(browsingTitlesDebounceTimer);
    }
    browsingTitlesDebounceTimer = window.setTimeout(async () => {
      let browsingTitles = [];
      if (isMobileSite()) {
        const mobileTitles = Array.from(
          document.querySelectorAll(
            "h3[title] > a > span.yt-core-attributed-string",
          ),
        );
        browsingTitles = mobileTitles;
      } else {
        const classicTitles = Array.from(
          document.querySelectorAll("#video-title"),
        );
        const feedbackTitles = Array.from(
          document.querySelectorAll(
            "ytd-compact-video-renderer span#video-title",
          ),
        );
        const browsingVideoTitles = Array.from(
          document.querySelectorAll('h3[title] > a > span[class][role="text"]'),
        );
        browsingTitles = [
          ...classicTitles,
          ...feedbackTitles,
          ...browsingVideoTitles,
        ];
      }
      const videosToProcess = [];
      for (const titleElement of browsingTitles) {
        const processingResult = shouldProcessBrowsingElement(titleElement);
        if (!processingResult.shouldProcess || !processingResult.videoId) {
          continue;
        }
        const { videoId, videoUrl } = processingResult;
        if (processingVideos.has(videoId)) {
          continue;
        }
        if (
          !titleElement.hasAttribute("ynt-original") &&
          currentSettings?.originalThumbnails?.enabled
        ) {
          restoreOriginalThumbnail(videoId, titleElement);
        }
        const currentTitle = titleElement.textContent || "";
        const processingState = checkElementProcessingState(
          titleElement,
          videoId,
        );
        if (processingState.shouldSkip) {
          continue;
        }
        if (processingState.shouldClean) {
          titleElement.removeAttribute("ynt");
          titleElement.removeAttribute("ynt-fail");
          titleElement.removeAttribute("ynt-fail-retry");
          titleElement.removeAttribute("ynt-original");
        }
        videosToProcess.push({ titleElement, videoId, videoUrl, currentTitle });
      }
      let preferenceFetchedTitles;
      if (
        isYouTubeDataAPIEnabled(currentSettings) &&
        videosToProcess.length > 0
      ) {
        const videoIds = videosToProcess.map((v) => v.videoId);
        preferenceFetchedTitles =
          await batchFetchTitlesFromYouTubeDataApi(videoIds);
        browsingTitlesLog(
          `Batch fetched ${preferenceFetchedTitles.size} titles from YouTube Data API v3`,
        );
      }
      const translatedTitleElements = [];
      const translatedVideoIds = [];
      await Promise.all(
        videosToProcess.map(
          async ({ titleElement, videoId, videoUrl, currentTitle }) => {
            let isTranslated = false;
            processingVideos.add(videoId);
            try {
              const titleFetchResult = await fetchOriginalTitle(
                videoId,
                titleElement,
                currentTitle,
                preferenceFetchedTitles,
              );
              if (titleFetchResult.shouldSkip) {
                return;
              }
              const originalTitle = titleFetchResult.originalTitle;
              if (!originalTitle) {
                return;
              }
              try {
                updateBrowsingTitleElement(
                  titleElement,
                  originalTitle,
                  videoId,
                );
                isTranslated = true;
                if (shouldProcessSearchDescriptionElement(isTranslated)) {
                  translatedTitleElements.push(titleElement);
                  translatedVideoIds.push(videoId);
                }
              } catch (error) {
                browsingTitlesErrorLog(
                  `Failed to update browsing title:`,
                  error,
                );
              }
            } finally {
              processingVideos.delete(videoId);
            }
          },
        ),
      );
      if (translatedTitleElements.length > 0 && !isMobileSite()) {
        await batchProcessSearchDescriptions(
          translatedTitleElements,
          translatedVideoIds,
        );
      }
      browsingTitlesDebounceTimer = null;
    }, TITLES_DEBOUNCE);
  }

  // src/content/description/MainDescription.ts
  async function fetchOriginalDescription2() {
    return new Promise((resolve) => {
      const handleDescription = (event) => {
        window.removeEventListener("ynt-description-data", handleDescription);
        resolve(event.detail?.description || null);
      };
      window.addEventListener("ynt-description-data", handleDescription);
      const url = browser.runtime.getURL(
        "modules/youtube-no-translation/dist/content/scripts/MainDescriptionScript.js",
      );
      let script;
      if (isSafari()) {
        fetch(url)
          .then((r) => r.text())
          .then((code) => {
            script = document.createElement("script");
            script.type = "text/javascript";
            script.textContent = code;
            document.documentElement.appendChild(script);
            script.remove();
          })
          .catch(() => {
            window.removeEventListener(
              "ynt-description-data",
              handleDescription,
            );
            resolve(null);
          });
      } else {
        script = document.createElement("script");
        script.src = url;
        document.documentElement.appendChild(script);
      }
    });
  }
  function getCurrentDescriptionText(element) {
    let container = null;
    if (isMobileSite()) {
      container = element.querySelector("#collapsed-string");
    } else {
      const snippet = element.querySelector("#attributed-snippet-text");
      const core = element.querySelector(
        ".yt-core-attributed-string--white-space-pre-wrap",
      );
      container = snippet || core;
    }
    if (!container) return "";
    function extractText(node) {
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        node.matches("a.yt-core-attributed-string__link")
      ) {
        return "";
      }
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent || "";
      }
      let text = "";
      node.childNodes.forEach((child) => {
        text += extractText(child);
      });
      return text;
    }
    return extractText(container).trim();
  }
  function isDescriptionOriginal(cached, current) {
    return normalizeText(cached, true).startsWith(normalizeText(current, true));
  }
  async function refreshDescription(id) {
    const isMobile = isMobileSite();
    const descriptionSelector = isMobile
      ? "ytm-expandable-video-description-body-renderer"
      : "#description-inline-expander";
    try {
      await waitForElement(descriptionSelector);
      const currentVideoId = extractVideoIdFromUrl(window.location.href);
      if (currentVideoId !== id) {
        descriptionLog(
          `Aborting refreshDescription: video changed from ${id} to ${currentVideoId}`,
        );
        return;
      }
      let description = descriptionCache.getDescription(id) || null;
      if (!description) {
        description = await fetchOriginalDescription2();
        const stillCurrentVideoId = extractVideoIdFromUrl(window.location.href);
        if (stillCurrentVideoId !== id) {
          descriptionLog(
            `Aborting refreshDescription after fetch: video changed from ${id} to ${stillCurrentVideoId}`,
          );
          return;
        }
      } else {
      }
      if (description) {
        const descriptionElement = document.querySelector(descriptionSelector);
        if (descriptionElement) {
          updateDescriptionElement(descriptionElement, description, id);
          descriptionLog("Description updated to original");
        }
      }
    } catch (error) {
      descriptionLog(`${error}`);
    }
  }
  function insertDescriptionSpan(container, span) {
    if (!container) return;
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(span.cloneNode(true));
  }
  function createTimestampFragment(text) {
    const timestampPattern = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/g;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    timestampPattern.lastIndex = 0;
    while ((match = timestampPattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        fragment.appendChild(
          document.createTextNode(text.substring(lastIndex, match.index)),
        );
      }
      const timestamp = match[0];
      let seconds = 0;
      if (match[3]) {
        seconds =
          parseInt(match[1]) * 3600 +
          parseInt(match[2]) * 60 +
          parseInt(match[3]);
      } else {
        seconds = parseInt(match[1]) * 60 + parseInt(match[2]);
      }
      const outerSpan = document.createElement("span");
      outerSpan.className = "yt-core-attributed-string--link-inherit-color";
      outerSpan.dir = "auto";
      outerSpan.style.color = "rgb(62, 166, 255)";
      const timestampLink = document.createElement("a");
      timestampLink.textContent = timestamp;
      timestampLink.className =
        "yt-core-attributed-string__link yt-core-attributed-string__link--call-to-action-color";
      timestampLink.style.cursor = "pointer";
      timestampLink.tabIndex = 0;
      timestampLink.setAttribute("ynt-timestamp", seconds.toString());
      outerSpan.appendChild(timestampLink);
      fragment.appendChild(outerSpan);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    }
    return fragment;
  }
  function createUrlLink(url) {
    const link = document.createElement("a");
    link.href = url;
    link.textContent = url;
    link.className =
      "yt-core-attributed-string__link yt-core-attributed-string__link--call-to-action-color";
    link.setAttribute("target", "_blank");
    link.style.color = "rgb(62, 166, 255)";
    return link;
  }
  function updateDescriptionElement(element, description, id) {
    const currentVideoId = extractVideoIdFromUrl(window.location.href);
    if (currentVideoId !== id) {
      descriptionLog(
        `Aborting description update: video changed from ${id} to ${currentVideoId}`,
      );
      return;
    }
    if (isMobileSite()) {
      const collapsedString = element.querySelector("#collapsed-string");
      if (!collapsedString) {
        descriptionErrorLog(
          "No mobile description container found (#collapsed-string)",
        );
        return;
      }
      const parentSpan = document.createElement("span");
      parentSpan.className =
        "yt-core-attributed-string yt-core-attributed-string--white-space-pre-wrap";
      parentSpan.dir = "auto";
      const innerSpan = document.createElement("span");
      innerSpan.className = "yt-core-attributed-string--link-inherit-color";
      innerSpan.dir = "auto";
      const urlPattern = /(https?:\/\/[^\s]+)/g;
      const lines = description.split("\n");
      lines.forEach((line, index) => {
        const parts = line.split(urlPattern);
        parts.forEach((part) => {
          if (part.match(urlPattern)) {
            innerSpan.appendChild(createUrlLink(part));
          } else if (part) {
            const fragment = createTimestampFragment(part);
            innerSpan.appendChild(fragment);
          }
        });
        if (index < lines.length - 1) {
          innerSpan.appendChild(document.createElement("br"));
        }
      });
      parentSpan.appendChild(innerSpan);
      insertDescriptionSpan(collapsedString, parentSpan);
    } else {
      const inlineExpander = element.closest("ytd-text-inline-expander");
      const isExpanded = inlineExpander?.hasAttribute("is-expanded");
      const snippetAttributedString = element.querySelector(
        "#attributed-snippet-text",
      );
      if (!snippetAttributedString) {
        descriptionErrorLog(
          "No desktop description snippet container found (#attributed-snippet-text)",
        );
        return;
      }
      const parentSpan = document.createElement("span");
      parentSpan.className =
        "yt-core-attributed-string yt-core-attributed-string--white-space-pre-wrap";
      parentSpan.dir = "auto";
      parentSpan.setAttribute("role", "text");
      const innerSpan = document.createElement("span");
      innerSpan.className = "yt-core-attributed-string--link-inherit-color";
      innerSpan.dir = "auto";
      const urlPattern = /(https?:\/\/[^\s]+)/g;
      const lines = description.split("\n");
      lines.forEach((line, index) => {
        const parts = line.split(urlPattern);
        parts.forEach((part) => {
          if (part.match(urlPattern)) {
            innerSpan.appendChild(createUrlLink(part));
          } else if (part) {
            const fragment = createTimestampFragment(part);
            innerSpan.appendChild(fragment);
          }
        });
        if (index < lines.length - 1) {
          innerSpan.appendChild(document.createElement("br"));
        }
      });
      parentSpan.appendChild(innerSpan);
      insertDescriptionSpan(snippetAttributedString, parentSpan);
      if (isExpanded) {
        const expandedAttributedString = element.querySelector(
          "#expanded yt-attributed-string",
        );
        if (expandedAttributedString) {
          descriptionLog(
            "Description is expanded, updating expanded container",
          );
          insertDescriptionSpan(expandedAttributedString, parentSpan);
        }
      } else {
        const expandedAttributedString = element.querySelector(
          "#expanded yt-attributed-string",
        );
        if (
          expandedAttributedString &&
          expandedAttributedString.childNodes.length > 0
        ) {
          descriptionLog(
            "Description is collapsed, clearing expanded container",
          );
          while (expandedAttributedString.firstChild) {
            expandedAttributedString.removeChild(
              expandedAttributedString.firstChild,
            );
          }
        }
      }
    }
    setupDescriptionContentObserver(id);
  }
  function compareDescription(element, id) {
    return new Promise(async (resolve) => {
      const currentVideoId = extractVideoIdFromUrl(window.location.href);
      if (currentVideoId !== id) {
        descriptionLog(
          `Aborting compareDescription: video changed from ${id} to ${currentVideoId}`,
        );
        resolve({ isOriginal: false, description: null });
        return;
      }
      let description = descriptionCache.getDescription(id) || null;
      if (!description) {
        description = await fetchOriginalDescription2();
        const stillCurrentVideoId = extractVideoIdFromUrl(window.location.href);
        if (stillCurrentVideoId !== id) {
          descriptionLog(
            `Aborting compareDescription after fetch: video changed from ${id} to ${stillCurrentVideoId}`,
          );
          resolve({ isOriginal: false, description: null });
          return;
        }
      }
      if (!description) {
        resolve({ isOriginal: false, description: null });
        return;
      }
      const currentText = getCurrentDescriptionText(element);
      if (!currentText) {
        resolve({ isOriginal: false, description });
        return;
      }
      const isOriginal = isDescriptionOriginal(description, currentText);
      if (isOriginal) {
        descriptionLog(
          "Description is already in original language, no update needed",
        );
      } else {
        descriptionCache.setDescription(id, description);
      }
      resolve({ isOriginal, description });
    });
  }
  var descriptionExpansionObserver = null;
  var descriptionContentObserver = null;
  async function processDescriptionForVideoId(id) {
    const descriptionSelector = isMobileSite()
      ? "ytm-expandable-video-description-body-renderer"
      : "#description-inline-expander";
    const descriptionElement = document.querySelector(descriptionSelector);
    if (descriptionElement) {
      return waitForElement("#movie_player").then(() => {
        const currentVideoId = extractVideoIdFromUrl(window.location.href);
        if (currentVideoId !== id) {
          descriptionLog(
            `Aborting processDescriptionForVideoId: video changed from ${id} to ${currentVideoId}`,
          );
          return null;
        }
        return compareDescription(descriptionElement, id).then(
          ({ isOriginal, description }) => {
            const stillCurrentVideoId = extractVideoIdFromUrl(
              window.location.href,
            );
            if (stillCurrentVideoId !== id) {
              descriptionLog(
                `Aborting after compareDescription: video changed from ${id} to ${stillCurrentVideoId}`,
              );
              return null;
            }
            if (!isOriginal) {
              return refreshDescription(id).then(() => {
                const finalVideoId = extractVideoIdFromUrl(
                  window.location.href,
                );
                if (finalVideoId !== id) {
                  descriptionLog(
                    `Aborting observer setup: video changed from ${id} to ${finalVideoId}`,
                  );
                  return null;
                }
                descriptionExpandObserver(id);
                setupDescriptionContentObserver(id);
                return descriptionCache.getDescription(id) ?? null;
              });
            } else {
              cleanupDescriptionObservers();
              return description;
            }
          },
        );
      });
    } else {
      return waitForElement(descriptionSelector).then(() => {
        const currentVideoId = extractVideoIdFromUrl(window.location.href);
        if (currentVideoId !== id) {
          descriptionLog(
            `Aborting processDescriptionForVideoId (element wait): video changed from ${id} to ${currentVideoId}`,
          );
          return null;
        }
        return refreshDescription(id).then(() => {
          const finalVideoId = extractVideoIdFromUrl(window.location.href);
          if (finalVideoId !== id) {
            descriptionLog(
              `Aborting observer setup (after wait): video changed from ${id} to ${finalVideoId}`,
            );
            return null;
          }
          descriptionExpandObserver(id);
          setupDescriptionContentObserver(id);
          return descriptionCache.getDescription(id) ?? null;
        });
      });
    }
  }
  function descriptionExpandObserver(id) {
    if (isMobileSite()) {
      const descriptionSelector =
        "ytm-expandable-video-description-body-renderer";
      waitForElement(descriptionSelector).then((descriptionElement) => {
        const collapsibleString =
          descriptionElement.querySelector("collapsible-string");
        if (!collapsibleString) {
          descriptionLog("Mobile collapsible-string not found");
          return;
        }
        descriptionExpansionObserver = new MutationObserver(
          async (mutations) => {
            for (const mutation of mutations) {
              if (
                mutation.type === "attributes" &&
                (mutation.attributeName === "class" ||
                  mutation.attributeName === "aria-expanded")
              ) {
                descriptionLog("Mobile description expanded/collapsed");
                const cachedDescription = descriptionCache.getDescription(id);
                if (cachedDescription) {
                  updateDescriptionElement(
                    descriptionElement,
                    cachedDescription,
                    id,
                  );
                } else {
                  const description = await fetchOriginalDescription2();
                  if (description) {
                    updateDescriptionElement(
                      descriptionElement,
                      description,
                      id,
                    );
                  }
                }
              }
            }
          },
        );
        descriptionExpansionObserver.observe(collapsibleString, {
          attributes: true,
          attributeFilter: ["class", "aria-expanded"],
        });
      });
    } else {
      waitForElement("#description-inline-expander").then(
        (descriptionElement) => {
          descriptionExpansionObserver = new MutationObserver(
            async (mutations) => {
              for (const mutation of mutations) {
                if (
                  mutation.type === "attributes" &&
                  mutation.attributeName === "is-expanded"
                ) {
                  descriptionLog("Desktop description expanded/collapsed");
                  const cachedDescription = descriptionCache.getDescription(id);
                  if (cachedDescription) {
                    updateDescriptionElement(
                      descriptionElement,
                      cachedDescription,
                      id,
                    );
                  } else {
                    const description = await fetchOriginalDescription2();
                    if (description) {
                      updateDescriptionElement(
                        descriptionElement,
                        description,
                        id,
                      );
                    }
                  }
                }
              }
            },
          );
          descriptionExpansionObserver.observe(descriptionElement, {
            attributes: true,
            attributeFilter: ["is-expanded"],
          });
        },
      );
    }
  }
  function setupDescriptionContentObserver(id) {
    cleanupDescriptionContentObserver();
    const descriptionSelector = isMobileSite()
      ? "ytm-expandable-video-description-body-renderer"
      : "#description-inline-expander";
    const descriptionElement = document.querySelector(descriptionSelector);
    if (!descriptionElement) {
      descriptionLog(
        "Description element not found, skipping content observer setup",
      );
      return;
    }
    let cachedDescription = descriptionCache.getDescription(id);
    if (!cachedDescription) {
      descriptionLog("No cached description available, fetching from API");
      fetchOriginalDescription2().then((description) => {
        if (description) {
          cachedDescription = description;
          setupObserver();
        }
      });
      return;
    }
    setupObserver();
    let debounceTimer = null;
    function setupObserver() {
      descriptionContentObserver = new MutationObserver((mutations) => {
        if (!cachedDescription) {
          descriptionLog(
            "No cached description available, skipping content observer setup",
          );
          return;
        }
        if (debounceTimer !== null) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = window.setTimeout(() => {
          debounceTimer = null;
          if (!descriptionElement) return;
          const currentText = getCurrentDescriptionText(descriptionElement);
          if (!currentText) return;
          const similarity = calculateSimilarity(
            normalizeText(currentText, true),
            normalizeText(cachedDescription, true),
          );
          const isOriginal = similarity >= 0.75;
          if (isOriginal) return;
          descriptionLog(
            "Description content changed by YouTube, restoring original",
          );
          descriptionContentObserver?.disconnect();
          updateDescriptionElement(descriptionElement, cachedDescription, id);
          if (descriptionContentObserver) {
            descriptionContentObserver.observe(descriptionElement, {
              childList: true,
              subtree: true,
              characterData: true,
            });
          }
        }, 50);
      });
      if (descriptionContentObserver && descriptionElement) {
        descriptionContentObserver.observe(descriptionElement, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      }
    }
  }
  function cleanupDescriptionContentObserver() {
    descriptionContentObserver?.disconnect();
    descriptionContentObserver = null;
  }
  function cleanupDescriptionObservers() {
    descriptionExpansionObserver?.disconnect();
    descriptionExpansionObserver = null;
    cleanupDescriptionContentObserver();
  }

  // src/content/channel/channelName.ts
  var channelNameContentObserver = null;
  var channelNameDebounceTimer = null;
  var CHANNEL_NAME_DEBOUNCE_MS = 200;
  function cleanupChannelNameContentObserver() {
    if (channelNameContentObserver) {
      channelNameContentObserver.disconnect();
      channelNameContentObserver = null;
    }
    if (channelNameDebounceTimer !== null) {
      clearTimeout(channelNameDebounceTimer);
      channelNameDebounceTimer = null;
    }
  }
  function updateChannelNameElement(element, originalName) {
    cleanupChannelNameContentObserver();
    const anchorElement = element.querySelector("a");
    if (!anchorElement) {
      channelNameErrorLog("No anchor element found in channel name");
      return;
    }
    const currentName = normalizeText(element.textContent);
    element.setAttribute("title", originalName);
    anchorElement.textContent = originalName;
    channelNameLog(
      `Updated channel name from: %c${currentName}%c to: %c${originalName}%c`,
      "color: white",
      "color: #06b6d4",
      "color: white",
      "color: #06b6d4",
    );
    channelNameContentObserver = new MutationObserver((mutations) => {
      if (channelNameDebounceTimer !== null) {
        clearTimeout(channelNameDebounceTimer);
      }
      channelNameDebounceTimer = window.setTimeout(() => {
        mutations.forEach((mutation) => {
          if (
            mutation.type === "childList" ||
            (mutation.type === "attributes" &&
              mutation.attributeName === "title")
          ) {
            const currentText = normalizeText(element.textContent);
            if (
              currentText !== normalizeText(originalName) ||
              element.getAttribute("title") !== originalName
            ) {
              channelNameLog(
                "YouTube changed channel name, reverting to original",
              );
              element.setAttribute("title", originalName);
              anchorElement.textContent = originalName;
            }
          }
        });
        channelNameDebounceTimer = null;
      }, CHANNEL_NAME_DEBOUNCE_MS);
    });
    channelNameContentObserver.observe(element, {
      childList: true,
      attributes: true,
      attributeFilter: ["title"],
      subtree: true,
    });
  }
  async function refreshChannelName() {
    const channelNameElement = document.querySelector(
      "ytd-watch-metadata ytd-video-owner-renderer ytd-channel-name yt-formatted-string#text",
    );
    if (!channelNameElement) {
      return;
    }
    const videoId = new URLSearchParams(window.location.search).get("v");
    if (!videoId) {
      return;
    }
    try {
      const channelNameScript = document.createElement("script");
      channelNameScript.type = "text/javascript";
      channelNameScript.src = browser.runtime.getURL(
        "modules/youtube-no-translation/dist/content/scripts/channelNameScript.js",
      );
      const originalChannelName = await new Promise((resolve) => {
        const channelListener = (event) => {
          window.removeEventListener("ynt-channel-data", channelListener);
          resolve(event.detail.channelName);
        };
        window.addEventListener("ynt-channel-data", channelListener);
        if (isSafari()) {
          const url = browser.runtime.getURL(
            "modules/youtube-no-translation/dist/content/scripts/channelNameScript.js",
          );
          fetch(url)
            .then((r) => r.text())
            .then((code) => {
              const script = document.createElement("script");
              script.type = "text/javascript";
              script.textContent = code;
              script.setAttribute("data-video-id", videoId);
              document.head.appendChild(script);
              script.remove();
            })
            .catch(() => resolve(null));
        } else {
          document.head.appendChild(channelNameScript);
        }
      });
      if (!originalChannelName) {
        channelNameLog("Failed to get original channel name from player");
        return;
      }
      const normalizedCurrentName = normalizeText(
        channelNameElement.textContent,
      );
      const normalizedOriginalName = normalizeText(originalChannelName);
      if (normalizedCurrentName === normalizedOriginalName) {
        channelNameLog("Channel name is already original");
        return;
      }
      updateChannelNameElement(channelNameElement, originalChannelName);
    } catch (error) {
      channelNameErrorLog(`Failed to update channel name:`, error);
    }
  }

  // src/content/titles/shortsTitles.ts
  var shortsAlternativeDebounceTimer = null;
  async function refreshShortMainTitle() {
    const shortTitle = document.querySelector(
      "yt-shorts-video-title-view-model h2.ytShortsVideoTitleViewModelShortsVideoTitle span",
    );
    const linkedVideoTitle = document.querySelector(
      ".ytReelMultiFormatLinkViewModelTitle span",
    );
    if (window.location.pathname.startsWith("/shorts")) {
      const videoId = extractVideoIdFromUrl(window.location.href);
      if (videoId) {
        if (shortTitle) {
          const currentTitle = shortTitle.textContent;
          const originalTitle = await fetchMainTitle(videoId, false, true);
          if (
            !originalTitle ||
            normalizeText(currentTitle) === normalizeText(originalTitle)
          ) {
          } else {
            try {
              updateMainTitleElement(shortTitle, originalTitle, videoId);
            } catch (error) {
              mainTitleErrorLog(`Failed to update shorts title:`, error);
            }
          }
        }
        if (linkedVideoTitle) {
          const currentLinkedTitle = linkedVideoTitle.textContent;
          const linkedVideoAnchor = linkedVideoTitle.closest(
            "a.ytReelMultiFormatLinkViewModelEndpoint",
          );
          if (linkedVideoAnchor) {
            const linkedVideoUrl = linkedVideoAnchor.getAttribute("href");
            if (linkedVideoUrl) {
              const linkedVideoId = extractVideoIdFromUrl(
                `https://www.youtube.com${linkedVideoUrl}`,
              );
              if (linkedVideoId) {
                let linkedOriginalTitle = null;
                linkedOriginalTitle =
                  titleCache.getTitle(linkedVideoId) || null;
                if (!linkedOriginalTitle) {
                  linkedOriginalTitle = await fetchTitleOembed(linkedVideoId);
                }
                if (!linkedOriginalTitle) {
                  linkedOriginalTitle =
                    await fetchTitleInnerTube(linkedVideoId);
                }
                if (
                  linkedOriginalTitle &&
                  normalizeText(currentLinkedTitle) !==
                    normalizeText(linkedOriginalTitle)
                ) {
                  try {
                    updateMainTitleElement(
                      linkedVideoTitle,
                      linkedOriginalTitle,
                      linkedVideoId,
                    );
                  } catch (error) {
                    mainTitleErrorLog(
                      `Failed to update linked video title:`,
                      error,
                    );
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  var checkShortsId = () => {
    if (window.location.pathname.startsWith("/shorts")) {
      waitForElement(
        "yt-shorts-video-title-view-model h2.ytShortsVideoTitleViewModelShortsVideoTitle span",
      ).then(() => {
        const currentVideoId = extractVideoIdFromUrl(window.location.href);
        if (currentVideoId) {
          mainTitleLog(
            "Shorts ID changed, updating title for ID:",
            currentVideoId,
          );
          const delays = [50, 150, 300, 500];
          delays.forEach((delay) => {
            setTimeout(() => {
              const newVideoId = extractVideoIdFromUrl(window.location.href);
              if (
                window.location.pathname.startsWith("/shorts") &&
                newVideoId === currentVideoId
              ) {
                refreshShortMainTitle();
              }
            }, delay);
          });
        }
      });
    }
  };
  async function refreshShortsAlternativeFormat() {
    if (shortsAlternativeDebounceTimer !== null) {
      clearTimeout(shortsAlternativeDebounceTimer);
    }
    shortsAlternativeDebounceTimer = window.setTimeout(async () => {
      const shortsLinks = document.querySelectorAll(
        ".shortsLockupViewModelHostEndpoint",
      );
      for (const shortLink of shortsLinks) {
        try {
          if (shortLink.hasAttribute("ynt")) {
            const currentTitle2 = shortLink.querySelector("span")?.textContent;
            const storedTitle = shortLink.getAttribute("title");
            if (
              currentTitle2 &&
              storedTitle &&
              normalizeText(currentTitle2) === normalizeText(storedTitle)
            ) {
              continue;
            }
          }
          const href = shortLink.getAttribute("href");
          if (!href || !href.includes("/shorts/")) {
            continue;
          }
          const videoId = extractVideoIdFromUrl(
            `https://www.youtube.com${href}`,
          );
          if (!videoId) {
            continue;
          }
          const titleSpan = shortLink.querySelector("span");
          if (!titleSpan) {
            continue;
          }
          const currentTitle = titleSpan.textContent;
          const titleFetchResult = await fetchOriginalTitle(
            videoId,
            shortLink,
            currentTitle || "",
          );
          const originalTitle = titleFetchResult.originalTitle;
          if (!originalTitle) {
            browsingTitlesLog(
              `Failed to get original title from API for short: ${videoId}, keeping current title : ${normalizeText(currentTitle)}`,
            );
            continue;
          }
          if (!originalTitle) {
            browsingTitlesLog(
              `Failed to get original title from API for short: ${videoId}, keeping current title : ${normalizeText(currentTitle)}`,
            );
            continue;
          }
          if (normalizeText(currentTitle) === normalizeText(originalTitle)) {
            continue;
          }
          browsingTitlesLog(
            `Updated shorts title from: %c${normalizeText(currentTitle)}%c to: %c${normalizeText(originalTitle)}%c (short id: %c${videoId}%c)`,
            "color: grey",
            "color: #fca5a5",
            "color: white; background: rgba(0,0,0,0.5); padding:2px 4px; border-radius:3px;",
            "color: #fca5a5",
            "color: #4ade80",
            "color: #fca5a5",
          );
          titleSpan.textContent = originalTitle;
          shortLink.setAttribute("title", originalTitle);
          shortLink.setAttribute("ynt", videoId);
          if (!titleCache.getTitle(videoId)) {
            titleCache.setTitle(videoId, originalTitle);
          }
        } catch (error) {
          browsingTitlesErrorLog(
            "Error processing alternative shorts format:",
            error,
          );
        }
      }
      shortsAlternativeDebounceTimer = null;
    }, TITLES_DEBOUNCE);
  }

  // src/content/titles/notificationTitles.ts
  var notificationMutationObserver = null;
  var notificationDebounceTimer = null;
  var NOTIFICATION_DEBOUNCE_MS = 200;
  function setupNotificationTitlesObserver() {
    cleanupNotificationTitlesObserver();
    const dropdown = document.querySelector(
      'ytd-popup-container tp-yt-iron-dropdown[vertical-align="top"]',
    );
    if (!dropdown) return;
    refreshNotificationTitles();
    const contentWrapper = dropdown.querySelector("#contentWrapper");
    if (!contentWrapper) return;
    notificationMutationObserver = new MutationObserver(() => {
      if (notificationDebounceTimer !== null) {
        clearTimeout(notificationDebounceTimer);
      }
      notificationDebounceTimer = window.setTimeout(() => {
        refreshNotificationTitles();
        notificationDebounceTimer = null;
      }, NOTIFICATION_DEBOUNCE_MS);
    });
    notificationMutationObserver.observe(contentWrapper, {
      childList: true,
      subtree: true,
    });
  }
  function cleanupNotificationTitlesObserver() {
    if (notificationMutationObserver) {
      notificationMutationObserver.disconnect();
      notificationMutationObserver = null;
    }
    if (notificationDebounceTimer !== null) {
      clearTimeout(notificationDebounceTimer);
      notificationDebounceTimer = null;
    }
  }
  async function refreshNotificationTitles() {
    const notificationTitleElements = document.querySelectorAll(
      ".ytd-notification-renderer .message",
    );
    for (const titleElement of notificationTitleElements) {
      const anchor = titleElement.closest("a");
      if (!anchor) continue;
      const href = anchor.getAttribute("href");
      if (!href) continue;
      const videoId = extractVideoIdFromUrl(
        href.startsWith("http") ? href : window.location.origin + href,
      );
      if (!videoId) continue;
      const currentTitle = titleElement.textContent;
      const titleFetchResult = await fetchOriginalTitle(
        videoId,
        titleElement,
        currentTitle || "",
      );
      const originalTitle = titleFetchResult.originalTitle;
      if (!originalTitle) {
        continue;
      }
      if (
        originalTitle &&
        !normalizeText(currentTitle).includes(normalizeText(originalTitle))
      ) {
        titleElement.textContent = originalTitle;
        if (!titleCache.getTitle(videoId)) {
          titleCache.setTitle(videoId, originalTitle);
        }
        titlesLog(
          `Updated pop-up title from : %c${normalizeText(currentTitle)}%c to : %c${normalizeText(originalTitle)}%c (video id : %c${videoId}%c)`,
          "color: grey",
          "color: #fca5a5",
          "color: white; background: rgba(0,0,0,0.5); padding:2px 4px; border-radius:3px;",
          "color: #fca5a5",
          "color: #4ade80",
          "color: #fca5a5",
        );
      }
    }
  }

  // src/content/chapters/button.ts
  var sponsorChapterObserver = null;
  var sponsorChapterDebounceTimer = null;
  var SPONSOR_CHAPTER_DEBOUNCE_MS = 200;
  function updateChapterButton() {
    const chapterButton = document.querySelector(
      ".ytp-chapter-title .ytp-chapter-title-content",
    );
    if (!chapterButton) return;
    const currentTime = getCurrentVideoTime();
    const targetChapter = findChapterByTime(currentTime, cachedChapters);
    if (targetChapter) {
      const currentTitle = chapterButton.textContent?.trim() || "";
      const storedOriginalTitle =
        chapterButton.getAttribute("data-original-chapter-button") || "";
      if (normalizeText(currentTitle) !== normalizeText(targetChapter.title)) {
        chaptersLog(
          `Chapter button updated: Time ${currentTime}s -> from "${currentTitle}" to "${targetChapter.title}"`,
        );
        chapterButton.textContent = targetChapter.title;
        chapterButton.setAttribute(
          "data-original-chapter-button",
          targetChapter.title,
        );
      }
    }
    const sponsorChapterText = document.querySelector(
      ".ytp-chapter-title .sponsorChapterText",
    );
    if (sponsorChapterObserver) {
      sponsorChapterObserver.disconnect();
      sponsorChapterObserver = null;
    }
    if (sponsorChapterDebounceTimer !== null) {
      clearTimeout(sponsorChapterDebounceTimer);
      sponsorChapterDebounceTimer = null;
    }
    if (sponsorChapterText && targetChapter) {
      sponsorChapterText.textContent = targetChapter.title;
      sponsorChapterObserver = new MutationObserver(() => {
        if (sponsorChapterDebounceTimer !== null) {
          clearTimeout(sponsorChapterDebounceTimer);
        }
        sponsorChapterDebounceTimer = window.setTimeout(() => {
          if (sponsorChapterText.textContent !== targetChapter.title) {
            chaptersLog(
              `SponsorBlock chapter text forcibly updated: Time ${currentTime}s -> "${targetChapter.title}"`,
            );
            sponsorChapterText.textContent = targetChapter.title;
          }
          sponsorChapterDebounceTimer = null;
        }, SPONSOR_CHAPTER_DEBOUNCE_MS);
      });
      sponsorChapterObserver.observe(sponsorChapterText, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
  }

  // src/content/chapters/tooltip.ts
  function updateTooltipChapter() {
    const visibleTooltip = document.querySelector(
      '.ytp-tooltip.ytp-bottom.ytp-preview:not([style*="display: none"])',
    );
    if (!visibleTooltip) return;
    const isNewPlayer = isNewYouTubePlayer();
    let timeString = null;
    let titleElement = null;
    if (isNewPlayer) {
      const pillTimeElement = visibleTooltip.querySelector(
        ".ytp-tooltip-progress-bar-pill-time-stamp",
      );
      const pillTitleElement = visibleTooltip.querySelector(
        ".ytp-tooltip-progress-bar-pill-title",
      );
      if (
        pillTimeElement &&
        pillTitleElement &&
        pillTimeElement.textContent?.trim()
      ) {
        timeString = pillTimeElement.textContent.trim();
        titleElement = pillTitleElement;
      }
    } else {
      const timeElement = visibleTooltip.querySelector(".ytp-tooltip-text");
      const oldTitleElement = visibleTooltip.querySelector(
        ".ytp-tooltip-title span",
      );
      if (timeElement && oldTitleElement && timeElement.textContent?.trim()) {
        timeString = timeElement.textContent.trim();
        titleElement = oldTitleElement;
      }
    }
    if (!titleElement || !timeString) return;
    const timeInSeconds = timeStringToSeconds(timeString);
    const targetChapter = findChapterByTime(timeInSeconds, cachedChapters);
    if (targetChapter) {
      const currentOriginalChapter = titleElement.getAttribute(
        "data-original-chapter",
      );
      if (
        normalizeText(currentOriginalChapter) !==
        normalizeText(targetChapter.title)
      ) {
        chaptersLog(
          `Time: ${timeString} (${timeInSeconds}s) -> Chapter: "${targetChapter.title}"`,
        );
        titleElement.setAttribute("data-original-chapter", targetChapter.title);
        titleElement.textContent = targetChapter.title;
      }
    }
  }

  // src/content/chapters/sidePannel.ts
  function isPanelOpen(panel) {
    const visibility = panel.getAttribute("visibility");
    if (visibility === "ENGAGEMENT_PANEL_VISIBILITY_HIDDEN") {
      return false;
    }
    if (visibility === "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED") {
      return true;
    }
    const rect = panel.getBoundingClientRect();
    const isVisuallyVisible =
      rect.height > 50 && rect.width > 50 && rect.top >= 0;
    const computedStyle = window.getComputedStyle(panel);
    const isDisplayed =
      computedStyle.display !== "none" && computedStyle.visibility !== "hidden";
    return isVisuallyVisible && isDisplayed;
  }
  function setupPanelsObserver() {
    const panelsContainer = document.getElementById("panels");
    if (!panelsContainer) return;
    let lastPanelState = null;
    const observer = new MutationObserver((mutations) => {
      let shouldUpdate = false;
      mutations.forEach((mutation) => {
        if (mutation.type === "attributes") {
          const target = mutation.target;
          if (target.matches("ytd-engagement-panel-section-list-renderer")) {
            const targetId = target.getAttribute("target-id");
            if (
              targetId === "engagement-panel-macro-markers-description-chapters"
            ) {
              const isOpen = isPanelOpen(target);
              if (lastPanelState !== isOpen) {
                lastPanelState = isOpen;
                chaptersLog(`Panel chapters ${isOpen ? "opened" : "closed"}`);
                if (isOpen) {
                  shouldUpdate = true;
                }
              }
            }
          }
        }
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node;
              if (
                element.matches("ytd-macro-markers-list-item-renderer") ||
                element.querySelector("ytd-macro-markers-list-item-renderer")
              ) {
                const openChaptersPanel = document.querySelector(
                  'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-macro-markers-description-chapters"][visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]',
                );
                if (openChaptersPanel && openChaptersPanel.contains(element)) {
                  shouldUpdate = true;
                }
              }
            }
          });
        }
      });
      if (shouldUpdate) {
        const currentTimer = getPanelsDebounceTimer();
        if (currentTimer !== null) {
          clearTimeout(currentTimer);
        }
        const newTimer = window.setTimeout(() => {
          replaceChapterTitlesInPanels();
          setPanelsDebounceTimer(null);
        }, PANELS_DEBOUNCE_MS);
        setPanelsDebounceTimer(newTimer);
      }
    });
    setPanelsObserver(observer);
    observer.observe(panelsContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["visibility", "style", "target-id"],
    });
    chaptersLog("Chapter panel observer initialized");
  }
  function replaceChapterTitlesInPanels() {
    if (cachedChapters.length === 0) return;
    const openChaptersPanel = document.querySelector(
      'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-macro-markers-description-chapters"][visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]',
    );
    if (!openChaptersPanel) {
      chaptersLog("No open chapters panel found");
      return;
    }
    const chapterElements = openChaptersPanel.querySelectorAll(
      "ytd-macro-markers-list-item-renderer .macro-markers",
    );
    chapterElements.forEach((element) => {
      const titleElement = element;
      const currentTitle = titleElement.textContent?.trim();
      if (currentTitle) {
        const timeElement = titleElement
          .closest("ytd-macro-markers-list-item-renderer")
          ?.querySelector("#time");
        const timeText = timeElement?.textContent?.trim();
        if (timeText) {
          const timeInSeconds = timeStringToSeconds(timeText);
          const matchingChapter = findChapterByTime(
            timeInSeconds,
            cachedChapters,
          );
          if (
            matchingChapter &&
            normalizeText(currentTitle) !== normalizeText(matchingChapter.title)
          ) {
            titleElement.textContent = matchingChapter.title;
            chaptersLog(
              `Replaced panel chapter: "${currentTitle}" -> "${matchingChapter.title}" at ${timeText}`,
            );
          }
        } else {
          chaptersLog(`No time element found for chapter: "${currentTitle}"`);
        }
      }
    });
  }

  // src/content/chapters/chaptersIndex.ts
  var chapterButtonObserver = null;
  var chaptersObserver = null;
  var panelsObserver = null;
  var chaptersUpdateInterval = null;
  var chapterButtonDebounceTimer = null;
  var chaptersDebounceTimer = null;
  var panelsDebounceTimer = null;
  var CHAPTER_BUTTON_DEBOUNCE_MS = 200;
  var CHAPTERS_DEBOUNCE_MS = 16;
  var PANELS_DEBOUNCE_MS = 200;
  function setPanelsObserver(observer) {
    panelsObserver = observer;
  }
  function setPanelsDebounceTimer(timer) {
    panelsDebounceTimer = timer;
  }
  function getPanelsDebounceTimer() {
    return panelsDebounceTimer;
  }
  var cachedChapters = [];
  var lastDescriptionHash = "";
  function cleanupChaptersObserver() {
    if (chaptersObserver) {
      chaptersObserver.disconnect();
      chaptersObserver = null;
    }
    if (chapterButtonObserver) {
      chapterButtonObserver.disconnect();
      chapterButtonObserver = null;
    }
    if (panelsObserver) {
      panelsObserver.disconnect();
      panelsObserver = null;
    }
    if (chaptersUpdateInterval) {
      clearInterval(chaptersUpdateInterval);
      chaptersUpdateInterval = null;
    }
    if (chapterButtonDebounceTimer !== null) {
      clearTimeout(chapterButtonDebounceTimer);
      chapterButtonDebounceTimer = null;
    }
    if (chaptersDebounceTimer !== null) {
      clearTimeout(chaptersDebounceTimer);
      chaptersDebounceTimer = null;
    }
    if (panelsDebounceTimer !== null) {
      clearTimeout(panelsDebounceTimer);
      panelsDebounceTimer = null;
    }
    const style = document.getElementById("ynt-chapters-style");
    if (style) {
      style.remove();
    }
    document.querySelectorAll("[data-original-chapter]").forEach((el) => {
      el.removeAttribute("data-original-chapter");
    });
    document
      .querySelectorAll("[data-original-chapter-button]")
      .forEach((el) => {
        el.removeAttribute("data-original-chapter-button");
      });
  }
  function timeStringToSeconds(timeString) {
    const parts = timeString.split(":").map(Number);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  }
  function parseChaptersFromDescription(description) {
    const chapters = [];
    const timestampRegex = /(\d{1,2}:\d{2}(?::\d{2})?)/;
    const lines = description.split("\n");
    const linesWithTimestamps = lines.map((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && timestampRegex.test(trimmed);
    });
    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;
      const timestampMatch = trimmedLine.match(timestampRegex);
      if (!timestampMatch) return;
      let hasTimestampBefore = false;
      let hasTimestampAfter = false;
      for (let i = index - 1; i >= 0; i--) {
        if (lines[i].trim().length === 0) continue;
        hasTimestampBefore = linesWithTimestamps[i];
        break;
      }
      for (let i = index + 1; i < lines.length; i++) {
        if (lines[i].trim().length === 0) continue;
        hasTimestampAfter = linesWithTimestamps[i];
        break;
      }
      if (!hasTimestampBefore && !hasTimestampAfter) {
        return;
      }
      const timestamp = timestampMatch[1];
      const timestampIndex = timestampMatch.index;
      const parts = timestamp.split(":").map(Number);
      let totalSeconds = 0;
      if (parts.length === 2) {
        totalSeconds = parts[0] * 60 + parts[1];
      } else if (parts.length === 3) {
        totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
      let title = "";
      if (
        timestampIndex === 0 ||
        /^[\-\–—•·▪▫‣⁃→>\s]*$/.test(trimmedLine.substring(0, timestampIndex))
      ) {
        title = trimmedLine.substring(timestampIndex + timestamp.length);
      } else {
        title = trimmedLine.substring(0, timestampIndex);
      }
      title = title
        .replace(/^[\-\–—•·▪▫‣⁃→>\s]+/, "")
        .replace(/[\-\–—•·▪▫‣⁃→>\s]+$/, "")
        .trim();
      if (title.length < 2) return;
      chapters.push({
        startTime: totalSeconds,
        title,
      });
    });
    chapters.sort((a, b) => a.startTime - b.startTime);
    return chapters;
  }
  function findChapterByTime(timeInSeconds, chapters) {
    if (chapters.length === 0) return null;
    let targetChapter = chapters[0];
    for (let i = chapters.length - 1; i >= 0; i--) {
      if (timeInSeconds >= chapters[i].startTime) {
        targetChapter = chapters[i];
        break;
      }
    }
    return targetChapter;
  }
  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString();
  }
  function getCurrentVideoTime() {
    const video =
      document.querySelector("#movie_player video") ||
      document.querySelector("video");
    if (video && "currentTime" in video) {
      const time = Math.floor(video.currentTime);
      return time;
    }
    chaptersLog("Video element not found or no currentTime property");
    return 0;
  }
  function areChaptersTranslated(descriptionChapters) {
    const openChaptersPanel = document.querySelector(
      'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-macro-markers-description-chapters"]',
    );
    const checkButtonFallback = () => {
      const chapterButton = document.querySelector(
        ".ytp-chapter-title-content",
      );
      if (!chapterButton) {
        chaptersLog(
          "No chapter button found, assuming chapters are not translated",
        );
        return false;
      }
      const displayedTitle = chapterButton.textContent?.trim();
      if (!displayedTitle) {
        return false;
      }
      const currentTime = getCurrentVideoTime();
      const matchingChapter = findChapterByTime(
        currentTime,
        descriptionChapters,
      );
      if (!matchingChapter) {
        return false;
      }
      const normalizedDisplayed = normalizeText(displayedTitle);
      const normalizedOriginal = normalizeText(matchingChapter.title);
      const isTranslated = normalizedDisplayed !== normalizedOriginal;
      if (isTranslated) {
        chaptersLog(
          `Chapter button appears translated: "${displayedTitle}" vs "${matchingChapter.title}"`,
        );
      } else {
        chaptersLog("Chapter button title matches description, not translated");
      }
      return isTranslated;
    };
    if (!openChaptersPanel) {
      return checkButtonFallback();
    }
    const chapterElements = openChaptersPanel.querySelectorAll(
      "ytd-macro-markers-list-item-renderer .macro-markers",
    );
    if (chapterElements.length === 0) {
      return checkButtonFallback();
    }
    let translatedCount = 0;
    chapterElements.forEach((element) => {
      const h4Element = element;
      const displayedTitle = h4Element.textContent?.trim();
      if (!displayedTitle) return;
      const timeElement = h4Element
        .closest("ytd-macro-markers-list-item-renderer")
        ?.querySelector("#time");
      const timeText = timeElement?.textContent?.trim();
      if (!timeText) return;
      const timeInSeconds = timeStringToSeconds(timeText);
      const matchingChapter = findChapterByTime(
        timeInSeconds,
        descriptionChapters,
      );
      if (!matchingChapter) return;
      const normalizedDisplayed = normalizeText(displayedTitle);
      const normalizedOriginal = normalizeText(matchingChapter.title);
      if (normalizedDisplayed !== normalizedOriginal) {
        translatedCount++;
      }
    });
    const areTranslated = translatedCount > 0;
    return areTranslated;
  }
  function checkAndInitializeChapters(videoId, description) {
    if (!description) {
      chaptersLog("No description provided, cannot check chapters");
      return;
    }
    setTimeout(() => {
      const descriptionChapters = parseChaptersFromDescription(description);
      if (descriptionChapters.length === 0) {
        chaptersLog("No chapters found in description");
        return;
      }
      const chaptersTranslated = areChaptersTranslated(descriptionChapters);
      if (chaptersTranslated) {
        chaptersLog("Chapters are translated, initializing replacement system");
        initializeChaptersReplacement(description);
      } else {
        chaptersLog(
          "Chapters are already original, skipping replacement system",
        );
      }
    }, 500);
  }
  function initializeChaptersReplacement(originalDescription) {
    cleanupChaptersObserver();
    const descriptionHash = hashString(originalDescription);
    if (descriptionHash !== lastDescriptionHash) {
      cachedChapters = parseChaptersFromDescription(originalDescription);
      lastDescriptionHash = descriptionHash;
    }
    if (cachedChapters.length === 0) {
      chaptersLog("No chapters found in description");
      return;
    }
    const style = document.createElement("style");
    style.id = "ynt-chapters-style";
    style.textContent = `
        /* Old structure: .ytp-tooltip-title span */
        .ytp-tooltip.ytp-bottom.ytp-preview .ytp-tooltip-title span {
            font-size: 0 !important;
            line-height: 0 !important;
        }
        
        .ytp-tooltip.ytp-bottom.ytp-preview .ytp-tooltip-title span[data-original-chapter]::after {
            content: attr(data-original-chapter);
            font-size: 12px !important;
            line-height: normal !important;
            color: inherit;
            font-family: inherit;
            display: inline !important;
        }
        
        /* New structure: .ytp-tooltip-progress-bar-pill-title */
        .ytp-tooltip-progress-bar-pill-title {
            font-size: 0 !important;
            line-height: 0 !important;
        }
        
        .ytp-tooltip-progress-bar-pill-title[data-original-chapter]::after {
            content: attr(data-original-chapter);
            font-size: 12px !important;
            line-height: normal !important;
            color: inherit;
            font-family: inherit;
            display: inline !important;
        }
    `;
    document.head.appendChild(style);
    chaptersObserver = new MutationObserver((mutations) => {
      let shouldUpdate = false;
      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node;
              if (
                element.classList?.contains("ytp-tooltip") &&
                element.classList?.contains("ytp-preview")
              ) {
                shouldUpdate = true;
              }
            }
          });
        }
        if (mutation.type === "characterData") {
          const parent = mutation.target.parentElement;
          if (parent?.classList?.contains("ytp-tooltip-text")) {
            shouldUpdate = true;
          }
        }
      });
      if (shouldUpdate) {
        if (chaptersDebounceTimer !== null) {
          clearTimeout(chaptersDebounceTimer);
        }
        chaptersDebounceTimer = window.setTimeout(() => {
          updateTooltipChapter();
          chaptersDebounceTimer = null;
        }, CHAPTERS_DEBOUNCE_MS);
      }
    });
    const player = document.getElementById("movie_player");
    if (player) {
      chaptersObserver.observe(player, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
    setupChapterButtonObserver();
    setupPanelsObserver();
    chaptersUpdateInterval = setInterval(updateTooltipChapter, 200);
  }
  function setupChapterButtonObserver() {
    const chapterButton = document.querySelector(".ytp-chapter-title");
    if (!chapterButton) {
      return;
    }
    chapterButtonObserver = new MutationObserver((mutations) => {
      let shouldUpdate = false;
      mutations.forEach((mutation) => {
        if (
          mutation.type === "childList" ||
          mutation.type === "characterData"
        ) {
          const target = mutation.target;
          if (
            target.classList?.contains("ytp-chapter-title-content") ||
            target.closest(".ytp-chapter-title-content")
          ) {
            shouldUpdate = true;
          }
        }
      });
      if (shouldUpdate) {
        if (chapterButtonDebounceTimer !== null) {
          clearTimeout(chapterButtonDebounceTimer);
        }
        chapterButtonDebounceTimer = window.setTimeout(() => {
          updateChapterButton();
          chapterButtonDebounceTimer = null;
        }, CHAPTER_BUTTON_DEBOUNCE_MS);
      }
    });
    chapterButtonObserver.observe(chapterButton, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    updateChapterButton();
  }

  // src/content/titles/endScreenTitles.ts
  var endScreenObserver = null;
  var endScreenDebounceTimer = null;
  var END_SCREEN_DEBOUNCE = 500;
  var processingEndScreenTitle = /* @__PURE__ */ new Set();
  function setupEndScreenObserver() {
    cleanupEndScreenObserver();
    const player = document.getElementById("movie_player");
    if (!player) {
      titlesLog("No player found for end screen observer");
      return;
    }
    endScreenObserver = new MutationObserver((mutations) => {
      let shouldRefresh = false;
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "class"
        ) {
          const target = mutation.target;
          if (
            target.classList?.contains("ytp-ce-element") &&
            target.classList?.contains("ytp-ce-element-show")
          ) {
            if (target.classList?.contains("ytp-ce-video")) {
              shouldRefresh = true;
              titlesLog("End screen video element became visible");
            }
          }
        }
      });
      if (shouldRefresh) {
        if (endScreenDebounceTimer) {
          clearTimeout(endScreenDebounceTimer);
        }
        endScreenDebounceTimer = window.setTimeout(() => {
          titlesLog("Triggering end screen titles refresh");
          refreshEndScreenTitles();
          endScreenDebounceTimer = null;
        }, END_SCREEN_DEBOUNCE);
      }
    });
    endScreenObserver.observe(player, {
      attributes: true,
      attributeFilter: ["class"],
      subtree: true,
    });
    titlesLog("End screen observer initialized");
  }
  function cleanupEndScreenObserver() {
    if (endScreenObserver) {
      endScreenObserver.disconnect();
      endScreenObserver = null;
    }
    if (endScreenDebounceTimer) {
      clearTimeout(endScreenDebounceTimer);
      endScreenDebounceTimer = null;
    }
    processingEndScreenTitle.clear();
  }
  function shouldProcessEndScreenTitleElement(titleElement) {
    const linkElement = titleElement.closest(".ytp-ce-covering-overlay");
    if (!linkElement || !linkElement.href) {
      return { shouldProcess: false };
    }
    const videoId = extractVideoIdFromUrl(linkElement.href);
    if (!videoId) {
      return { shouldProcess: false };
    }
    if (processingEndScreenTitle.has(videoId)) {
      return { shouldProcess: false };
    }
    return {
      shouldProcess: true,
      videoId,
      videoUrl: linkElement.href,
    };
  }
  function checkEndScreenTitleElementProcessingState(titleElement, videoId) {
    if (titleElement.hasAttribute("ynt")) {
      if (titleElement.getAttribute("ynt") === videoId) {
        const directTextNodes = Array.from(titleElement.childNodes).filter(
          (node) =>
            node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        );
        if (
          directTextNodes.length === 1 &&
          normalizeText(directTextNodes[0].textContent || "") ===
            normalizeText(titleElement.getAttribute("title") || "")
        ) {
          return { shouldSkip: true, shouldClean: false };
        } else {
          return { shouldSkip: false, shouldClean: true };
        }
      } else {
        return { shouldSkip: false, shouldClean: true };
      }
    }
    if (titleElement.hasAttribute("ynt-fail")) {
      if (titleElement.getAttribute("ynt-fail") === videoId) {
        return { shouldSkip: true, shouldClean: false };
      }
      titleElement.removeAttribute("ynt-fail");
    }
    if (titleElement.hasAttribute("ynt-original")) {
      if (titleElement.getAttribute("ynt-original") === videoId) {
        return { shouldSkip: true, shouldClean: false };
      }
      titleElement.removeAttribute("ynt-original");
    }
    return { shouldSkip: false, shouldClean: false };
  }
  async function refreshEndScreenTitles() {
    const endScreenTitles = document.querySelectorAll(".ytp-ce-video-title");
    if (endScreenTitles.length === 0) {
      return;
    }
    titlesLog(
      `Found ${endScreenTitles.length} end screen video titles to process`,
    );
    for (const titleElement of endScreenTitles) {
      const processingResult = shouldProcessEndScreenTitleElement(titleElement);
      if (!processingResult.shouldProcess || !processingResult.videoId) {
        continue;
      }
      const { videoId } = processingResult;
      processingEndScreenTitle.add(videoId);
      try {
        const currentTitle = titleElement.textContent || "";
        const processingState = checkEndScreenTitleElementProcessingState(
          titleElement,
          videoId,
        );
        if (processingState.shouldSkip) {
          continue;
        }
        if (processingState.shouldClean) {
          titleElement.removeAttribute("ynt");
          titleElement.removeAttribute("ynt-fail");
          titleElement.removeAttribute("ynt-fail-retry");
          titleElement.removeAttribute("ynt-original");
        }
        const titleFetchResult = await fetchOriginalTitle(
          videoId,
          titleElement,
          currentTitle,
        );
        if (titleFetchResult.shouldSkip) {
          continue;
        }
        const originalTitle = titleFetchResult.originalTitle;
        if (!originalTitle) {
          titlesErrorLog(`No original title found for video ${videoId}`);
          titleElement.setAttribute("ynt-fail", videoId);
          continue;
        }
        try {
          updateBrowsingTitleElement(
            titleElement,
            originalTitle,
            videoId,
            false,
          );
        } catch (error) {
          titlesErrorLog(`Failed to update ending suggested title:`, error);
          titleElement.setAttribute("ynt-fail", videoId);
        }
      } finally {
        processingEndScreenTitle.delete(videoId);
      }
    }
  }

  // src/content/titles/postVideoTitles.ts
  var postVideoObserver = null;
  var processingPostVideoTitles = /* @__PURE__ */ new Set();
  var postVideoDebounceTimer = null;
  var isPostVideoGridActive = false;
  var POST_VIDEO_DEBOUNCE = 500;
  function setupPostVideoObserver() {
    cleanupPostVideoObserver();
    const player = document.getElementById("movie_player");
    if (!player) {
      titlesLog("No player found for post video observer");
      return;
    }
    isPostVideoGridActive = player.classList.contains(
      "ytp-fullscreen-grid-active",
    );
    const existingGrid = document.querySelector(".ytp-fullscreen-grid");
    if (existingGrid && isPostVideoGridActive) {
      titlesLog("Post video grid already active on setup");
      setTimeout(() => {
        refreshPostVideoTitles();
      }, 200);
    }
    postVideoObserver = new MutationObserver((mutations) => {
      let shouldRefresh = false;
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "class"
        ) {
          const target = mutation.target;
          if (target.id === "movie_player") {
            const nowActive = target.classList.contains(
              "ytp-fullscreen-grid-active",
            );
            if (nowActive && !isPostVideoGridActive) {
              shouldRefresh = true;
              titlesLog("Post video grid became active");
            }
            isPostVideoGridActive = nowActive;
          }
        }
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node;
              if (
                element.classList?.contains("ytp-fullscreen-grid") ||
                element.querySelector?.(".ytp-fullscreen-grid")
              ) {
                shouldRefresh = true;
                titlesLog("Post video grid added to DOM");
              }
            }
          });
        }
      });
      if (shouldRefresh) {
        if (postVideoDebounceTimer) {
          clearTimeout(postVideoDebounceTimer);
        }
        postVideoDebounceTimer = window.setTimeout(() => {
          titlesLog("Triggering post video titles refresh");
          refreshPostVideoTitles();
          postVideoDebounceTimer = null;
        }, POST_VIDEO_DEBOUNCE);
      }
    });
    postVideoObserver.observe(player, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    titlesLog("Post video observer initialized");
  }
  function cleanupPostVideoObserver() {
    if (postVideoObserver) {
      postVideoObserver.disconnect();
      postVideoObserver = null;
    }
    if (postVideoDebounceTimer) {
      clearTimeout(postVideoDebounceTimer);
      postVideoDebounceTimer = null;
    }
    processingPostVideoTitles.clear();
    isPostVideoGridActive = false;
  }
  function shouldProcessPostVideoTitleElement(titleElement) {
    const linkElement = titleElement.closest(".ytp-modern-videowall-still");
    if (!linkElement || !linkElement.href) {
      return { shouldProcess: false };
    }
    const videoId = extractVideoIdFromUrl(linkElement.href);
    if (!videoId) {
      return { shouldProcess: false };
    }
    if (processingPostVideoTitles.has(videoId)) {
      return { shouldProcess: false };
    }
    return {
      shouldProcess: true,
      videoId,
      videoUrl: linkElement.href,
    };
  }
  function checkPostVideoTitleElementProcessingState(titleElement, videoId) {
    if (titleElement.hasAttribute("ynt")) {
      if (titleElement.getAttribute("ynt") === videoId) {
        const directTextNodes = Array.from(titleElement.childNodes).filter(
          (node) =>
            node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        );
        if (
          directTextNodes.length === 1 &&
          normalizeText(directTextNodes[0].textContent || "") ===
            normalizeText(titleElement.getAttribute("title") || "")
        ) {
          return { shouldSkip: true, shouldClean: false };
        } else {
          return { shouldSkip: false, shouldClean: true };
        }
      } else {
        return { shouldSkip: false, shouldClean: true };
      }
    }
    if (titleElement.hasAttribute("ynt-fail")) {
      if (titleElement.getAttribute("ynt-fail") === videoId) {
        return { shouldSkip: true, shouldClean: false };
      }
      titleElement.removeAttribute("ynt-fail");
    }
    if (titleElement.hasAttribute("ynt-original")) {
      if (titleElement.getAttribute("ynt-original") === videoId) {
        return { shouldSkip: true, shouldClean: false };
      }
      titleElement.removeAttribute("ynt-original");
    }
    return { shouldSkip: false, shouldClean: false };
  }
  async function refreshPostVideoTitles() {
    const postVideoGrid = document.querySelector(".ytp-fullscreen-grid");
    if (!postVideoGrid) {
      return;
    }
    const postVideoTitles = postVideoGrid.querySelectorAll(
      ".ytp-modern-videowall-still-info-title",
    );
    if (postVideoTitles.length === 0) {
      return;
    }
    for (const titleElement of postVideoTitles) {
      const processingResult = shouldProcessPostVideoTitleElement(titleElement);
      if (!processingResult.shouldProcess || !processingResult.videoId) {
        continue;
      }
      const { videoId } = processingResult;
      processingPostVideoTitles.add(videoId);
      try {
        if (
          !titleElement.hasAttribute("ynt-original") &&
          currentSettings?.originalThumbnails?.enabled
        ) {
          restoreOriginalThumbnail(videoId, titleElement);
        }
        const currentTitle = titleElement.textContent || "";
        const processingState = checkPostVideoTitleElementProcessingState(
          titleElement,
          videoId,
        );
        if (processingState.shouldSkip) {
          continue;
        }
        if (processingState.shouldClean) {
          titleElement.removeAttribute("ynt");
          titleElement.removeAttribute("ynt-fail");
          titleElement.removeAttribute("ynt-fail-retry");
          titleElement.removeAttribute("ynt-original");
        }
        const titleFetchResult = await fetchOriginalTitle(
          videoId,
          titleElement,
          currentTitle,
        );
        if (titleFetchResult.shouldSkip) {
          continue;
        }
        const originalTitle = titleFetchResult.originalTitle;
        if (!originalTitle) {
          titlesErrorLog(`No original title found for video ${videoId}`);
          titleElement.setAttribute("ynt-fail", videoId);
          continue;
        }
        try {
          updateBrowsingTitleElement(
            titleElement,
            originalTitle,
            videoId,
            false,
          );
        } catch (error) {
          titlesErrorLog(`Failed to update post video title:`, error);
          titleElement.setAttribute("ynt-fail", videoId);
        }
      } finally {
        processingPostVideoTitles.delete(videoId);
      }
    }
  }

  // src/content/Mobile/mobilePanel.ts
  var mobilePanelObserver = null;
  async function updateMobilePanelTitle(videoId) {
    const titleElement = document.querySelector(
      "panel-container .primary-info .title span.yt-core-attributed-string",
    );
    if (!titleElement) {
      mainTitleLog("[Mobile Panel] Title element not found");
      return;
    }
    const currentTitle = titleElement.textContent;
    const originalTitle = await fetchMainTitle(videoId, false);
    if (!originalTitle) {
      mainTitleLog("[Mobile Panel] Failed to get original title");
      return;
    }
    if (normalizeText(currentTitle) === normalizeText(originalTitle)) {
      mainTitleLog("[Mobile Panel] Title already correct");
      return;
    }
    mainTitleLog(
      `[Mobile Panel] Updated title from: %c${normalizeText(currentTitle)}%c to: %c${normalizeText(originalTitle)}`,
      "color: grey",
      "color: #fcd34d",
      "color: white; background: rgba(0,0,0,0.5); padding:2px 4px; border-radius:3px;",
    );
    titleElement.textContent = originalTitle;
  }
  async function updateMobilePanelVideoDescription(videoId) {
    const descriptionContainer = document.querySelector(
      "panel-container ytm-expandable-video-description-body-renderer",
    );
    if (!descriptionContainer) {
      descriptionLog("[Mobile Panel] Video description container not found");
      return;
    }
    const description = descriptionCache.getDescription(videoId);
    if (description) {
      descriptionLog("[Mobile Panel] Using cached video description");
      updateDescriptionElement(descriptionContainer, description, videoId);
    } else {
      descriptionLog("[Mobile Panel] No cached video description, fetching...");
      const fetchedDescription = await fetchOriginalDescription2();
      if (fetchedDescription) {
        descriptionCache.setDescription(videoId, fetchedDescription);
        updateDescriptionElement(
          descriptionContainer,
          fetchedDescription,
          videoId,
        );
      } else {
        descriptionLog("[Mobile Panel] Failed to fetch video description");
      }
    }
  }
  async function updateMobilePanelChannelDescription() {
    const descriptionElement = document.querySelector(
      "panel-container ytm-about-channel-renderer .user-text span.yt-core-attributed-string",
    );
    if (!descriptionElement) {
      descriptionLog("[Mobile Panel] Channel description element not found");
      return;
    }
    const currentDescription = descriptionElement.textContent?.trim() || "";
    let channelId = null;
    let originalDescriptionData = null;
    const channelHandle = getChannelHandle(window.location.href);
    if (isYouTubeDataAPIEnabled(currentSettings)) {
      const apiKey = currentSettings?.youtubeDataApi?.apiKey;
      if (!apiKey) {
        descriptionLog("[Mobile Panel] YouTube Data API key is missing");
        return;
      }
      if (channelHandle) {
        originalDescriptionData = await getOriginalChannelDescriptionDataAPI({
          handle: channelHandle,
        });
        if (!originalDescriptionData) {
          channelId = await getChannelIdFromInnerTube(channelHandle);
          if (channelId) {
            originalDescriptionData =
              await getOriginalChannelDescriptionDataAPI({ id: channelId });
          }
        }
      }
    }
    let originalDescription = null;
    if (originalDescriptionData?.description) {
      originalDescription = originalDescriptionData.description;
    } else {
      if (!channelId && channelHandle) {
        channelId = await getChannelIdFromInnerTube(channelHandle);
      }
      if (!channelId) {
        descriptionLog("[Mobile Panel] Channel ID could not be retrieved");
        return;
      }
      originalDescription =
        await getOriginalChannelDescriptionInnerTube(channelId);
      if (!originalDescription) {
        descriptionLog(
          "[Mobile Panel] Failed to fetch channel description from InnerTube",
        );
        return;
      }
    }
    if (
      normalizeText(originalDescription).startsWith(
        normalizeText(currentDescription),
      )
    ) {
      descriptionLog("[Mobile Panel] Channel description already original");
      return;
    }
    descriptionLog("[Mobile Panel] Updating channel description");
    descriptionElement.textContent = originalDescription;
  }
  async function refreshMobileVideoPanelContent() {
    const videoId = extractVideoIdFromUrl(window.location.href);
    if (!videoId) {
      coreLog("[Mobile Panel] No video ID found");
      return;
    }
    coreLog(`[Mobile Panel] Refreshing video panel content for ${videoId}`);
    if (currentSettings?.titleTranslation) {
      await updateMobilePanelTitle(videoId);
    }
    if (currentSettings?.descriptionTranslation) {
      await updateMobilePanelVideoDescription(videoId);
    }
  }
  async function refreshMobileChannelPanelContent() {
    coreLog("[Mobile Panel] Refreshing channel panel content");
    if (currentSettings?.descriptionTranslation) {
      await updateMobilePanelChannelDescription();
    }
  }
  function setupMobilePanelObserver() {
    cleanupMobilePanelObserver();
    waitForElement("ytm-app > panel-container")
      .then((panel) => {
        coreLog("[Mobile Panel] Setting up observer on panel-container");
        mobilePanelObserver = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.type === "childList") {
              const primaryInfoAdded = Array.from(mutation.addedNodes).some(
                (node) => {
                  if (node.nodeType === Node.ELEMENT_NODE) {
                    const element = node;
                    return (
                      element.matches(".primary-info") ||
                      element.querySelector(".primary-info")
                    );
                  }
                  return false;
                },
              );
              if (primaryInfoAdded) {
                coreLog(
                  "[Mobile Panel] Video panel opened (primary-info detected)",
                );
                refreshMobileVideoPanelContent();
                return;
              }
              const aboutChannelAdded = Array.from(mutation.addedNodes).some(
                (node) => {
                  if (node.nodeType === Node.ELEMENT_NODE) {
                    const element = node;
                    return (
                      element.matches("ytm-about-channel-renderer") ||
                      element.querySelector("ytm-about-channel-renderer")
                    );
                  }
                  return false;
                },
              );
              if (aboutChannelAdded) {
                coreLog(
                  "[Mobile Panel] Channel panel opened (ytm-about-channel-renderer detected)",
                );
                refreshMobileChannelPanelContent();
                return;
              }
              const panelClosed = Array.from(mutation.removedNodes).some(
                (node) => {
                  if (node.nodeType === Node.ELEMENT_NODE) {
                    const element = node;
                    return (
                      element.matches(".primary-info") ||
                      element.querySelector(".primary-info") ||
                      element.matches("ytm-about-channel-renderer") ||
                      element.querySelector("ytm-about-channel-renderer")
                    );
                  }
                  return false;
                },
              );
              if (panelClosed) {
                coreLog("[Mobile Panel] Panel closed");
              }
            }
          }
        });
        mobilePanelObserver.observe(panel, {
          childList: true,
          subtree: true,
        });
        const existingPrimaryInfo = panel.querySelector(".primary-info");
        if (existingPrimaryInfo) {
          coreLog("[Mobile Panel] Video panel already open on setup");
          refreshMobileVideoPanelContent();
        }
        const existingAboutChannel = panel.querySelector(
          "ytm-about-channel-renderer",
        );
        if (existingAboutChannel) {
          coreLog("[Mobile Panel] Channel panel already open on setup");
          refreshMobileChannelPanelContent();
        }
      })
      .catch(() => {
        coreLog(
          "[Mobile Panel] panel-container not found (desktop or not available)",
        );
      });
  }
  function cleanupMobilePanelObserver() {
    if (mobilePanelObserver) {
      mobilePanelObserver.disconnect();
      mobilePanelObserver = null;
      coreLog("[Mobile Panel] Observer cleaned up");
    }
  }

  // src/content/channel/channelDescription.ts
  async function getOriginalChannelDescriptionInnerTube(channelId) {
    return new Promise((resolve) => {
      function handleResult(event) {
        const detail = event.detail;
        window.removeEventListener(
          "ynt-get-channel-description-inner-tube",
          handleResult,
        );
        script.remove();
        resolve(detail?.channelDescription ?? null);
      }
      window.addEventListener(
        "ynt-get-channel-description-inner-tube",
        handleResult,
      );
      const url = browser.runtime.getURL(
        "modules/youtube-no-translation/dist/content/scripts/ChannelDescriptionInnerTube.js",
      );
      let script;
      if (isSafari()) {
        fetch(url)
          .then((r) => r.text())
          .then((code) => {
            script = document.createElement("script");
            script.textContent = code;
            script.async = true;
            script.setAttribute("data-channel-id", channelId);
            document.documentElement.appendChild(script);
          });
      } else {
        script = document.createElement("script");
        script.src = url;
        script.async = true;
        script.setAttribute("data-channel-id", channelId);
        document.documentElement.appendChild(script);
      }
      setTimeout(() => {
        window.removeEventListener(
          "ynt-get-channel-description-inner-tube",
          handleResult,
        );
        if (script) script.remove();
        resolve(null);
      }, 3e3);
    });
  }
  async function getOriginalChannelDescriptionDataAPI(identifier) {
    const apiKey = currentSettings?.youtubeDataApi?.apiKey;
    let url = "";
    if (identifier.handle) {
      url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&forHandle=${encodeURIComponent(identifier.handle)}&key=${apiKey}`;
    } else if (identifier.id) {
      url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${identifier.id}&key=${apiKey}`;
    } else {
      descriptionErrorLog(
        "No channel ID or handle provided for YouTube Data API request.",
      );
      return null;
    }
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.items && data.items.length > 0) {
        const item = data.items[0];
        const description = item.snippet.description;
        const id = item.id;
        return { id, description };
      }
      return null;
    } catch (error) {
      descriptionErrorLog("Failed to fetch channel description:", error);
      return null;
    }
  }
  function getShortChannelCurrentDescription() {
    const selector =
      'yt-description-preview-view-model truncated-text-content:not(.ytTruncatedTextHiddenTextContent) > span.ytAttributedStringHost[role="text"]';
    const el = document.querySelector(selector);
    if (el && typeof el.textContent === "string") {
      const text = " el.textContent.trim();";
      if (text.length > 0) {
        return text;
      }
    }
    return null;
  }
  function getShortChannelCurrentDescriptionElement() {
    const selector =
      'yt-description-preview-view-model truncated-text-content:not(.ytTruncatedTextHiddenTextContent) > span.ytAttributedStringHost[role="text"]';
    const el = document.querySelector(selector);
    return el;
  }
  function getFullChannelCurrentDescription() {
    const dialogs = document.querySelectorAll(
      "ytd-popup-container tp-yt-paper-dialog",
    );
    for (const dialog of dialogs) {
      const dialogElement = dialog;
      if (dialogElement.style.display !== "none") {
        const descriptionContainer = dialogElement.querySelector(
          "yt-attributed-string#description-container",
        );
        if (descriptionContainer) {
          const textSpan = descriptionContainer.querySelector(
            ".yt-core-attributed-string",
          );
          if (textSpan && typeof textSpan.textContent === "string") {
            return textSpan.textContent.trim();
          }
        }
      }
    }
    return null;
  }
  function shouldUpdateChannelDescription(
    originalDescription,
    shortDescription,
  ) {
    if (!originalDescription) {
      descriptionLog("Original description is null, no update needed.");
      return false;
    }
    if (
      normalizeText(originalDescription).startsWith(
        normalizeText(shortDescription),
      )
    ) {
      descriptionLog(
        "Channel's description already original, no update needed.",
      );
      return false;
    } else {
      return true;
    }
  }
  async function refreshChannelShortDescription() {
    let channelId = null;
    let originalDescriptionData = null;
    const channelHandle = getChannelHandle(window.location.href);
    if (isYouTubeDataAPIEnabled(currentSettings)) {
      const apiKey = currentSettings?.youtubeDataApi?.apiKey;
      if (!apiKey) {
        descriptionErrorLog("YouTube Data API key is missing.");
        return;
      }
      if (channelId) {
        originalDescriptionData = await getOriginalChannelDescriptionDataAPI({
          id: channelId,
        });
      } else {
        if (channelHandle) {
          originalDescriptionData = await getOriginalChannelDescriptionDataAPI({
            handle: channelHandle,
          });
          if (!originalDescriptionData) {
            channelId = await getChannelIdFromInnerTube(channelHandle);
            if (channelId) {
              originalDescriptionData =
                await getOriginalChannelDescriptionDataAPI({ id: channelId });
            }
          }
        }
      }
    }
    let finalChannelId = null;
    let originalDescription = null;
    if (originalDescriptionData?.description) {
      finalChannelId = originalDescriptionData.id;
      originalDescription = originalDescriptionData.description;
    } else {
      if (!channelId && channelHandle) {
        channelId = await getChannelIdFromInnerTube(channelHandle);
      }
      if (!channelId) {
        descriptionErrorLog(
          "Channel ID could not be retrieved from InnerTube.",
        );
        return;
      }
      originalDescription =
        await getOriginalChannelDescriptionInnerTube(channelId);
      if (!originalDescription) {
        descriptionErrorLog(
          "Could not fetch original channel description from InnerTube.",
        );
        return;
      }
      finalChannelId = channelId;
    }
    const shortDescription = getShortChannelCurrentDescription();
    if (shouldUpdateChannelDescription(originalDescription, shortDescription)) {
      const textSpan = getShortChannelCurrentDescriptionElement();
      if (textSpan) {
        textSpan.textContent = originalDescription || "";
        textSpan.setAttribute("data-original-updated", finalChannelId || "");
        descriptionLog(
          "Short channel description updated with original description.",
        );
      } else {
        descriptionErrorLog("Preview text element not found for update.");
      }
    }
    const previewElement = document.querySelector(
      "yt-description-preview-view-model",
    );
    const previewTextSpan = previewElement
      ? previewElement.querySelector(".yt-core-attributed-string")
      : null;
    if (
      originalDescription !== null &&
      previewTextSpan?.hasAttribute("data-original-updated")
    ) {
      if (!isMobileSite()) {
        observeChannelDescriptionModal(originalDescription);
      } else {
        setupMobilePanelObserver();
      }
    }
  }
  var currentModalObserver = null;
  var modalObserverDebounceTimer = null;
  var MODAL_OBSERVER_DEBOUNCE_MS = 50;
  function cleanupChannelDescriptionModalObserver() {
    if (currentModalObserver) {
      currentModalObserver.disconnect();
      currentModalObserver = null;
      descriptionLog("Channel description modal observer cleaned up.");
    }
    if (modalObserverDebounceTimer !== null) {
      clearTimeout(modalObserverDebounceTimer);
      modalObserverDebounceTimer = null;
    }
  }
  function observeChannelDescriptionModal(originalDescription) {
    cleanupChannelDescriptionModalObserver();
    const popupContainer = document.querySelector("ytd-popup-container");
    if (!popupContainer) {
      descriptionErrorLog("Popup container not found.");
      throw new Error("Popup container not found.");
    }
    const observer = new MutationObserver((mutations) => {
      let shouldUpdate = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (
            node.nodeType === Node.ELEMENT_NODE &&
            node.querySelector &&
            node.querySelector("yt-attributed-string#description-container")
          ) {
            shouldUpdate = true;
            break;
          }
        }
        if (shouldUpdate) break;
      }
      if (shouldUpdate) {
        if (modalObserverDebounceTimer !== null) {
          clearTimeout(modalObserverDebounceTimer);
        }
        modalObserverDebounceTimer = window.setTimeout(() => {
          refreshChannelFullDescription(originalDescription);
          modalObserverDebounceTimer = null;
        }, MODAL_OBSERVER_DEBOUNCE_MS);
      }
    });
    observer.observe(popupContainer, { childList: true, subtree: true });
    currentModalObserver = observer;
    return observer;
  }
  async function refreshChannelFullDescription(originalDescription) {
    const fullDescription = getFullChannelCurrentDescription();
    if (shouldUpdateChannelDescription(originalDescription, fullDescription)) {
      const dialogs = document.querySelectorAll(
        "ytd-popup-container tp-yt-paper-dialog",
      );
      for (const dialog of dialogs) {
        const dialogElement = dialog;
        if (dialogElement.style.display !== "none") {
          const descriptionContainer = dialogElement.querySelector(
            "yt-attributed-string#description-container",
          );
          if (descriptionContainer) {
            const currentDescription = descriptionContainer.querySelector(
              ".yt-core-attributed-string",
            );
            if (
              currentDescription &&
              normalizeText(currentDescription.textContent) !==
                normalizeText(originalDescription)
            ) {
              currentDescription.textContent = originalDescription;
              descriptionLog(
                "Full channel description updated with original description.",
              );
              return;
            }
          }
        }
      }
    }
  }

  // src/content/channel/mainChannelName.ts
  function shouldUpdateChannelName(originalChannelName, currentChannelName) {
    if (!originalChannelName || !currentChannelName) {
      return false;
    }
    return (
      normalizeText(originalChannelName) !== normalizeText(currentChannelName)
    );
  }
  async function fetchChannelNameInnerTube(handle, id) {
    const channelHandle = handle;
    let channelId = id;
    if (!channelHandle) {
      titlesErrorLog("Channel handle is missing.");
      return null;
    }
    if (!channelId) {
      channelId = await getChannelIdFromInnerTube(channelHandle);
      if (!channelId) {
        titlesErrorLog("Could not retrieve channelId from API.");
        return null;
      }
    }
    return new Promise((resolve) => {
      function handleResult(event) {
        const detail = event.detail;
        window.removeEventListener(
          "ynt-get-channel-name-inner-tube",
          handleResult,
        );
        script.remove();
        resolve(detail?.channelName ?? null);
      }
      window.addEventListener("ynt-get-channel-name-inner-tube", handleResult);
      const url = browser.runtime.getURL(
        "modules/youtube-no-translation/dist/content/scripts/ChannelNameInnerTubeScript.js",
      );
      let script;
      if (isSafari()) {
        fetch(url)
          .then((r) => r.text())
          .then((code) => {
            script = document.createElement("script");
            script.type = "text/javascript";
            script.textContent = code;
            script.async = true;
            script.setAttribute("data-channel-id", channelId);
            document.documentElement.appendChild(script);
          })
          .catch(() => {
            window.removeEventListener(
              "ynt-get-channel-name-inner-tube",
              handleResult,
            );
            resolve(null);
          });
      } else {
        script = document.createElement("script");
        script.src = url;
        script.async = true;
        script.setAttribute("data-channel-id", channelId);
        document.documentElement.appendChild(script);
      }
      setTimeout(() => {
        window.removeEventListener(
          "ynt-get-channel-name-inner-tube",
          handleResult,
        );
        if (script) script.remove();
        resolve(null);
      }, 3e3);
    });
  }
  async function fetchChannelNameDataAPI(handle) {
    const apiKey = currentSettings?.youtubeDataApi?.apiKey;
    if (!apiKey) {
      coreLog("API key is not set in current settings.");
      return null;
    }
    let apiUrl = "";
    const channelHandle = handle;
    if (channelHandle) {
      apiUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet&forHandle=${encodeURIComponent(channelHandle)}&key=${apiKey}`;
    } else {
      titlesErrorLog("Channel handle is missing.");
      return null;
    }
    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        titlesErrorLog(`API request failed with status: ${response.status}`);
        return null;
      }
      const data = await response.json();
      if (data.items && data.items.length > 0) {
        const channelTitle = data.items[0].snippet.title;
        return channelTitle || null;
      }
      titlesErrorLog("No items found in API response.");
      return null;
    } catch (error) {
      titlesErrorLog("Failed to fetch channel name:", error);
      return null;
    }
  }
  async function refreshMainChannelName() {
    const channelHandle = getChannelHandle(window.location.href);
    if (!channelHandle) {
      titlesErrorLog("Channel handle could not be extracted from URL.");
      return;
    }
    let originalChannelName = null;
    if (isYouTubeDataAPIEnabled(currentSettings)) {
      originalChannelName = await fetchChannelNameDataAPI(channelHandle);
    } else {
      originalChannelName = await fetchChannelNameInnerTube(channelHandle);
    }
    let channelNameElement = document.querySelector(
      'h1.dynamicTextViewModelH1 > span.yt-core-attributed-string[role="text"]',
    );
    if (!channelNameElement) {
      channelNameElement = document.querySelector(
        "yt-dynamic-text-view-model h1.dynamic-text-view-model-wiz__h1 > span.yt-core-attributed-string",
      );
    }
    if (!channelNameElement) {
      titlesErrorLog("Channel name element not found on the page.");
      return;
    }
    const currentChannelName =
      channelNameElement.childNodes[0]?.textContent?.trim() ||
      channelNameElement.textContent?.trim() ||
      null;
    if (shouldUpdateChannelName(originalChannelName, currentChannelName)) {
      if (
        channelNameElement.childNodes.length > 0 &&
        channelNameElement.childNodes[0].nodeType === Node.TEXT_NODE
      ) {
        channelNameElement.childNodes[0].textContent =
          originalChannelName || "";
      } else {
        channelNameElement.textContent = originalChannelName || "";
      }
      titlesLog("Channel name updated with original channel name from API.");
    }
  }

  // src/content/channel/ChannelRendererPatch.ts
  async function patchChannelRendererBlocks() {
    const rendererSelector = isMobileSite()
      ? "ytm-compact-channel-renderer"
      : "ytd-channel-renderer";
    const channelRenderers = document.querySelectorAll(rendererSelector);
    for (const renderer of channelRenderers) {
      let handle = null;
      if (isMobileSite()) {
        const bylineElements = renderer.querySelectorAll(
          ".YtmCompactMediaItemByline span.yt-core-attributed-string",
        );
        for (const byline of bylineElements) {
          const text = byline.textContent?.trim() || "";
          if (text.startsWith("@")) {
            handle = text.substring(1);
            break;
          }
        }
      } else {
        const handleElement = renderer.querySelector(
          "yt-formatted-string#subscribers",
        );
        const handleText = handleElement?.textContent?.trim() || "";
        const handleMatch = handleText.match(/@([a-zA-Z0-9._-]+)/);
        handle = handleMatch ? handleMatch[1] : null;
      }
      if (!handle) continue;
      let channelId = null;
      let originalChannelName = null;
      if (isYouTubeDataAPIEnabled(currentSettings)) {
        originalChannelName = await fetchChannelNameDataAPI(handle);
      } else {
        channelId = await getChannelIdFromInnerTube(handle);
        if (!channelId) {
          coreErrorLog(`Channel ID not found for handle: ${handle}`);
          continue;
        }
        originalChannelName = await fetchChannelNameInnerTube(
          handle,
          channelId,
        );
      }
      const nameElement = isMobileSite()
        ? renderer.querySelector(
            ".YtmCompactMediaItemHeadline span.yt-core-attributed-string",
          )
        : renderer.querySelector("ytd-channel-name #text");
      const currentName = nameElement?.textContent?.trim() || null;
      if (
        nameElement &&
        shouldUpdateChannelName(originalChannelName, currentName)
      ) {
        nameElement.textContent = originalChannelName || "";
      }
      if (isMobileSite()) continue;
      let originalDescription = null;
      if (isYouTubeDataAPIEnabled(currentSettings)) {
        const data = await getOriginalChannelDescriptionDataAPI({ handle });
        originalDescription = data?.description || null;
      } else {
        if (channelId) {
          originalDescription =
            await getOriginalChannelDescriptionInnerTube(channelId);
        } else {
          coreErrorLog(
            "Channel ID is missing for InnerTube description fetch.",
          );
          continue;
        }
      }
      const descElement = renderer.querySelector(
        "yt-formatted-string#description",
      );
      if (
        descElement &&
        originalDescription &&
        descElement.textContent?.trim() !== originalDescription
      ) {
        descElement.textContent = originalDescription;
      }
    }
  }

  // src/content/channel/channelPlayer.ts
  function updateChannelPlayerDescriptionElement(expanderElement, description) {
    const contentElement = expanderElement.querySelector(
      'yt-formatted-string.content[slot="content"]',
    );
    if (!contentElement) {
      console.error("No content element found in channel player description");
      return;
    }
    contentElement.textContent = description;
  }
  async function refreshChannelPlayer() {
    const playerRenderer = document.querySelector(
      "ytd-channel-video-player-renderer",
    );
    if (!playerRenderer) return;
    if (currentSettings?.titleTranslation) {
      const titleElement = playerRenderer.querySelector(
        "yt-formatted-string#title",
      );
      const titleLink = titleElement?.querySelector('a[href*="/watch?v="]');
      const videoId = titleLink?.href.match(/v=([^&]+)/)?.[1];
      if (titleElement && videoId) {
        const originalTitle = await fetchMainTitle(videoId, true);
        if (originalTitle) {
          updateMainTitleElement(titleElement, originalTitle, videoId);
        }
      }
    }
    if (currentSettings?.descriptionTranslation) {
      const descriptionExpander = playerRenderer.querySelector(
        "ytd-expander#description",
      );
      if (descriptionExpander) {
        const originalDescription = await fetchOriginalDescription2();
        if (originalDescription) {
          updateChannelPlayerDescriptionElement(
            descriptionExpander,
            originalDescription,
          );
        }
      }
    }
  }

  // src/content/channel/ChannelVideoDescriptions.ts
  async function processChannelVideoDescriptions() {
    const videoRenderers = Array.from(
      document.querySelectorAll("ytd-video-renderer"),
    );
    for (const renderer of videoRenderers) {
      const descriptionElement = renderer.querySelector("#description-text");
      if (
        !descriptionElement ||
        descriptionElement.hasAttribute("ynt-channel-desc") ||
        !descriptionElement.textContent?.trim() ||
        descriptionElement.offsetParent === null
      ) {
        continue;
      }
      let videoId = null;
      const titleLink = renderer.querySelector("a#video-title");
      const thumbnailLink = renderer.querySelector("a#thumbnail");
      const url = titleLink?.href || thumbnailLink?.href || "";
      const match = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      if (match) {
        videoId = match[1];
      }
      if (!videoId) continue;
      try {
        const originalDescription = await fetchOriginalDescription(videoId);
        if (originalDescription) {
          const lines = originalDescription.split("\n");
          const shortDescription = lines.slice(0, 2).join("\n");
          const truncatedDescription =
            shortDescription.length > 100
              ? shortDescription.substring(0, 100) + "..."
              : shortDescription;
          descriptionElement.textContent = truncatedDescription;
          descriptionElement.setAttribute("ynt-channel-desc", videoId);
          descriptionElement.setAttribute("translate", "no");
          descriptionLog(
            `Restored original channel video description for videoId: ${videoId}`,
          );
        }
      } catch (error) {
        descriptionErrorLog(
          `Failed to restore channel video description for videoId: ${videoId}`,
          error,
        );
      }
    }
  }

  // src/content/titles/infoCards.ts
  var InfoCardDataManager = class {
    constructor() {
      this.dataMap = /* @__PURE__ */ new Map();
    }
    /**
     * Stores infocard data for a video.
     */
    set(videoId, translatedTitle, originalTitle) {
      this.dataMap.set(videoId, { translatedTitle, originalTitle });
    }
    /**
     * Retrieves infocard data by video ID.
     */
    get(videoId) {
      return this.dataMap.get(videoId);
    }
    /**
     * Finds infocard data by translated title (normalized comparison).
     */
    findByTranslatedTitle(translatedTitle) {
      const normalizedSearch = normalizeText(translatedTitle);
      for (const [videoId, data] of this.dataMap.entries()) {
        if (normalizeText(data.translatedTitle) === normalizedSearch) {
          return data;
        }
      }
      return void 0;
    }
    /**
     * Clears all stored infocard data.
     */
    clear() {
      this.dataMap.clear();
    }
    /**
     * Returns the number of stored infocards.
     */
    size() {
      return this.dataMap.size;
    }
  };
  var infoCardDataManager = new InfoCardDataManager();
  var infoCardsDebounceTimer = null;
  var INFOCARDS_DEBOUNCE_MS = 200;
  function cleanupInfoCardsDebounce() {
    if (infoCardsDebounceTimer !== null) {
      clearTimeout(infoCardsDebounceTimer);
      infoCardsDebounceTimer = null;
    }
  }
  async function refreshInfoCardsTitles() {
    if (infoCardsDebounceTimer !== null) {
      clearTimeout(infoCardsDebounceTimer);
    }
    infoCardsDebounceTimer = window.setTimeout(async () => {
      const infoCardTitleElements = Array.from(
        document.querySelectorAll(
          "ytd-structured-description-video-lockup-renderer #title",
        ),
      );
      if (infoCardTitleElements.length === 0) {
        return;
      }
      titlesLog(`Processing ${infoCardTitleElements.length} infocard titles`);
      for (const titleElement of infoCardTitleElements) {
        try {
          const linkElement = titleElement.closest("a#text-wrapper");
          if (!linkElement) {
            continue;
          }
          const videoUrl = linkElement.href;
          const videoId = extractVideoIdFromUrl(videoUrl);
          if (!videoId) {
            continue;
          }
          if (
            titleElement.hasAttribute("ynt") &&
            titleElement.getAttribute("ynt") === videoId
          ) {
            continue;
          }
          const translatedTitle = titleElement.textContent?.trim() || "";
          if (!translatedTitle) {
            continue;
          }
          const titleFetchResult = await fetchOriginalTitle(
            videoId,
            titleElement,
            translatedTitle,
          );
          if (titleFetchResult.shouldSkip || !titleFetchResult.originalTitle) {
            continue;
          }
          const originalTitle = titleFetchResult.originalTitle;
          infoCardDataManager.set(videoId, translatedTitle, originalTitle);
          updateBrowsingTitleElement(
            titleElement,
            originalTitle,
            videoId,
            false,
          );
          titlesLog(
            `InfoCard stored: %c${videoId}%c - Translated: %c${normalizeText(translatedTitle)}%c \u2192 Original: %c${normalizeText(originalTitle)}%c`,
            "color: #4ade80",
            "color: #fca5a5",
            "color: grey",
            "color: #fca5a5",
            "color: white",
            "color: #fca5a5",
          );
        } catch (error) {
          titlesErrorLog("Error processing infocard:", error);
        }
      }
      titlesLog(`Stored ${infoCardDataManager.size()} infocard data entries`);
      infoCardsDebounceTimer = null;
    }, INFOCARDS_DEBOUNCE_MS);
  }
  function cleanupInfoCards() {
    cleanupInfoCardsDebounce();
    infoCardDataManager.clear();
  }

  // src/content/titles/infoCardsTeasers.ts
  var teaserObserver = null;
  var teaserLabelObservers = /* @__PURE__ */ new Map();
  var teaserDebounceTimer = null;
  var TEASER_DEBOUNCE_MS = 100;
  function isTeaserVisible(teaserElement) {
    const style = window.getComputedStyle(teaserElement);
    return style.display !== "none" && style.visibility !== "hidden";
  }
  function updateTeaserLabel(labelElement) {
    const translatedTitle = labelElement.textContent?.trim();
    if (!translatedTitle) {
      return;
    }
    const infoCardData =
      infoCardDataManager.findByTranslatedTitle(translatedTitle);
    if (!infoCardData) {
      return;
    }
    const originalTitle = infoCardData.originalTitle;
    if (normalizeText(translatedTitle) === normalizeText(originalTitle)) {
      return;
    }
    labelElement.textContent = originalTitle;
    labelElement.setAttribute("ynt-teaser", "true");
    labelElement.setAttribute("ynt-teaser-translated", translatedTitle);
    titlesLog(
      `Teaser updated: %c${normalizeText(translatedTitle)}%c \u2192 %c${normalizeText(originalTitle)}%c`,
      "color: grey",
      "color: #fca5a5",
      "color: white",
      "color: #fca5a5",
    );
    setupTeaserLabelObserver(labelElement, translatedTitle, originalTitle);
  }
  function processTeaserIfVisible() {
    const teaserContainer = document.querySelector(".ytp-cards-teaser");
    if (!teaserContainer || !isTeaserVisible(teaserContainer)) {
      return;
    }
    const teaserLabel = teaserContainer.querySelector(
      ".ytp-cards-teaser-label",
    );
    if (teaserLabel) {
      cleanupAllTeaserLabelObservers();
      teaserLabel.removeAttribute("ynt-teaser");
      teaserLabel.removeAttribute("ynt-teaser-translated");
      updateTeaserLabel(teaserLabel);
    }
  }
  function setupTeaserLabelObserver(
    labelElement,
    expectedTranslatedTitle,
    originalTitle,
  ) {
    cleanupTeaserLabelObserver(labelElement);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "childList" ||
          mutation.type === "characterData"
        ) {
          const currentText = labelElement.textContent?.trim() || "";
          const storedTranslatedTitle =
            labelElement.getAttribute("ynt-teaser-translated") || "";
          const currentInfoCardData =
            infoCardDataManager.findByTranslatedTitle(currentText);
          if (
            currentInfoCardData &&
            normalizeText(currentInfoCardData.translatedTitle) !==
              normalizeText(expectedTranslatedTitle)
          ) {
            titlesLog("New teaser detected, cleaning up old observer");
            cleanupTeaserLabelObserver(labelElement);
            return;
          }
          if (
            normalizeText(currentText) !== normalizeText(originalTitle) &&
            normalizeText(currentText) ===
              normalizeText(expectedTranslatedTitle)
          ) {
            titlesLog(
              "YouTube changed teaser back to translated, reverting to original",
            );
            labelElement.textContent = originalTitle;
          }
        }
      });
    });
    observer.observe(labelElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    teaserLabelObservers.set(labelElement, observer);
  }
  function cleanupTeaserLabelObserver(labelElement) {
    const observer = teaserLabelObservers.get(labelElement);
    if (observer) {
      observer.disconnect();
      teaserLabelObservers.delete(labelElement);
    }
  }
  function cleanupAllTeaserLabelObservers() {
    teaserLabelObservers.forEach((observer) => {
      observer.disconnect();
    });
    teaserLabelObservers.clear();
  }
  function setupInfoCardTeasersObserver() {
    cleanupInfoCardTeasersObserver();
    const player = document.getElementById("movie_player");
    if (!player) {
      return;
    }
    teaserObserver = new MutationObserver((mutations) => {
      let shouldUpdate = false;
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node;
            if (
              element.classList?.contains("ytp-cards-teaser") ||
              element.querySelector(".ytp-cards-teaser")
            ) {
              shouldUpdate = true;
            }
          }
        });
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "style"
        ) {
          const target = mutation.target;
          if (target.classList?.contains("ytp-cards-teaser")) {
            if (isTeaserVisible(target)) {
              shouldUpdate = true;
            }
          }
        }
        if (mutation.type === "childList") {
          const target = mutation.target;
          if (
            target.classList?.contains("ytp-cards-teaser-text") ||
            target.closest(".ytp-cards-teaser")
          ) {
            shouldUpdate = true;
          }
        }
      });
      if (shouldUpdate) {
        if (teaserDebounceTimer !== null) {
          clearTimeout(teaserDebounceTimer);
        }
        teaserDebounceTimer = window.setTimeout(() => {
          processTeaserIfVisible();
          teaserDebounceTimer = null;
        }, TEASER_DEBOUNCE_MS);
      }
    });
    teaserObserver.observe(player, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
    });
    processTeaserIfVisible();
    titlesLog("InfoCard teasers observer initialized");
  }
  function cleanupInfoCardTeasersObserver() {
    if (teaserObserver) {
      teaserObserver.disconnect();
      teaserObserver = null;
    }
    cleanupAllTeaserLabelObservers();
    if (teaserDebounceTimer !== null) {
      clearTimeout(teaserDebounceTimer);
      teaserDebounceTimer = null;
    }
  }

  // src/content/observers.ts
  var hasInitialPlayerLoadTriggered = false;
  var hasInitialSettingsApplied = false;
  var userInitiatedChange = false;
  var userChangeTimeout = null;
  var processedVideoSources = null;
  var allVideoEvents = [
    "loadstart",
    "loadedmetadata",
    "canplay",
    "playing",
    "play",
    "timeupdate",
    "seeked",
  ];
  var shouldApplyVideoPlayerSettings = false;
  var audioTrackListener = null;
  var settingsListener = null;
  var ytPlayerUpdatedHandler = null;
  function setupVideoPlayerListener() {
    cleanUpVideoPlayerListener();
    coreLog("Setting up video player listener");
    processedVideoSources = /* @__PURE__ */ new WeakMap();
    const setUserInitiatedFlag = () => {
      userInitiatedChange = true;
      if (userChangeTimeout) window.clearTimeout(userChangeTimeout);
      userChangeTimeout = window.setTimeout(() => {
        userInitiatedChange = false;
        userChangeTimeout = null;
      }, 2e3);
    };
    document.addEventListener(
      "mousedown",
      (e) => {
        const target = e.target;
        if (
          target.closest(".ytp-settings-menu") ||
          target.closest(".ytp-progress-bar") ||
          target.closest(".ytp-chapters-container")
        ) {
          setUserInitiatedFlag();
        }
      },
      true,
    );
    document.addEventListener(
      "keydown",
      (e) => {
        const seekKeys = [
          "j",
          "l",
          "arrowleft",
          "arrowright",
          "0",
          "1",
          "2",
          "3",
          "4",
          "5",
          "6",
          "7",
          "8",
          "9",
        ];
        if (seekKeys.includes(e.key.toLowerCase())) {
          setUserInitiatedFlag();
        }
      },
      true,
    );
    audioTrackListener = function (e) {
      if (!(e.target instanceof HTMLVideoElement)) return;
      const video = e.target;
      const currentSource = video.currentSrc || video.src || "";
      if (!currentSource) {
        return;
      }
      if (video.srcValue === currentSource) {
        return;
      }
      if (processedVideoSources?.get(video) === currentSource) {
        return;
      }
      if (userInitiatedChange) {
        coreLog("User initiated quality change - skipping");
        return;
      }
      processedVideoSources?.set(video, currentSource);
      video.srcValue = currentSource;
      coreLog("Video source changed. Event:", e.type);
      applyAudioTrack();
      shouldApplyVideoPlayerSettings = true;
      if (!hasInitialPlayerLoadTriggered) {
        hasInitialPlayerLoadTriggered = true;
        coreLog("Optimized: switching to essential events for SPA navigation");
        allVideoEvents.forEach((evt) => {
          if (audioTrackListener)
            document.removeEventListener(evt, audioTrackListener, true);
        });
        document.addEventListener("loadstart", audioTrackListener, true);
        document.addEventListener("loadedmetadata", audioTrackListener, true);
      }
    };
    ytPlayerUpdatedHandler = () => {
      if (!shouldApplyVideoPlayerSettings) return;
      document.removeEventListener("yt-player-updated", ytPlayerUpdatedHandler);
      ytPlayerUpdatedHandler = null;
      hasInitialSettingsApplied = true;
      coreLog("Applying post-playing settings (subtitles, embed title)");
      applyVideoPlayerSettings();
      shouldApplyVideoPlayerSettings = false;
    };
    document.addEventListener("yt-player-updated", ytPlayerUpdatedHandler);
    settingsListener = function (e) {
      if (!(e.target instanceof HTMLVideoElement)) return;
      if (userInitiatedChange) return;
      const isResilienceEvent = e.type === "seeked";
      if (!shouldApplyVideoPlayerSettings && !isResilienceEvent) return;
      if (!hasInitialSettingsApplied && !isResilienceEvent) return;
      coreLog(
        `Applying post-playing settings (subtitles, embed title). Event: ${e.type}`,
      );
      applyVideoPlayerSettings();
      shouldApplyVideoPlayerSettings = false;
    };
    allVideoEvents.forEach((evt) => {
      document.addEventListener(evt, audioTrackListener, true);
    });
    document.addEventListener("canplaythrough", settingsListener, true);
    document.addEventListener("seeked", settingsListener, true);
  }
  function cleanUpVideoPlayerListener() {
    if (audioTrackListener) {
      allVideoEvents.forEach((evt) =>
        document.removeEventListener(evt, audioTrackListener, true),
      );
      document.removeEventListener("loadstart", audioTrackListener, true);
      document.removeEventListener("loadedmetadata", audioTrackListener, true);
      audioTrackListener = null;
    }
    if (settingsListener) {
      document.removeEventListener("canplaythrough", settingsListener, true);
      document.removeEventListener("seeked", settingsListener, true);
      settingsListener = null;
    }
    if (ytPlayerUpdatedHandler) {
      document.removeEventListener("yt-player-updated", ytPlayerUpdatedHandler);
      ytPlayerUpdatedHandler = null;
    }
    if (userChangeTimeout) {
      window.clearTimeout(userChangeTimeout);
      userChangeTimeout = null;
    }
    processedVideoSources = null;
    hasInitialPlayerLoadTriggered = false;
    hasInitialSettingsApplied = false;
    userInitiatedChange = false;
  }
  var mainVideoObserver = null;
  var lastProcessedVideoId = null;
  function setupMainVideoObserver() {
    cleanupMainVideoObserver();
    waitForElement("ytd-watch-flexy").then((watchFlexy) => {
      function checkAndProcessVideo() {
        const domVideoId = extractVideoIdFromWatchFlexy();
        const urlVideoId = extractVideoIdFromUrl(window.location.href);
        if (!urlVideoId) {
          coreLog("[Video] No video ID in URL, skipping");
          return;
        }
        if (!domVideoId) {
          coreLog(
            "[Video] DOM video-id not available yet, waiting for update...",
          );
          return;
        }
        if (domVideoId !== urlVideoId) {
          coreLog(
            `[Video] ID mismatch - DOM: "${domVideoId}" vs URL: "${urlVideoId}", waiting...`,
          );
          return;
        }
        if (domVideoId === lastProcessedVideoId) {
          coreLog(`[Video] Already processed ${domVideoId}, skipping`);
          return;
        }
        lastProcessedVideoId = domVideoId;
        coreLog(`[Video] IDs matched: ${domVideoId}, processing...`);
        cleanupDescriptionObservers();
        if (currentSettings?.descriptionTranslation) {
          processDescriptionForVideoId(domVideoId).then((description) => {
            if (description) {
              checkAndInitializeChapters(domVideoId, description);
            } else {
              coreLog("No description available for chapters check");
            }
          });
        }
        if (currentSettings?.titleTranslation) {
          refreshMainTitle();
          refreshChannelName();
        }
      }
      checkAndProcessVideo();
      mainVideoObserver = new MutationObserver(() => {
        checkAndProcessVideo();
      });
      mainVideoObserver.observe(watchFlexy, {
        attributes: true,
        attributeFilter: ["video-id"],
      });
      coreLog("[Video] Observer setup completed");
    });
  }
  function cleanupMainVideoObserver() {
    if (mainVideoObserver) {
      mainVideoObserver.disconnect();
      mainVideoObserver = null;
    }
    lastProcessedVideoId = null;
  }
  var timestampClickHandler = null;
  function setupTimestampClickObserver() {
    cleanupTimestampClickObserver();
    timestampClickHandler = (event) => {
      const target = event.target;
      const timestampLink = target.closest("a[ynt-timestamp]");
      if (timestampLink instanceof HTMLElement) {
        event.preventDefault();
        event.stopPropagation();
        const seconds = timestampLink.getAttribute("ynt-timestamp");
        window.scrollTo({
          top: 0,
          behavior: "smooth",
        });
        const timestampData = {
          seconds,
        };
        const url = browser.runtime.getURL(
          "modules/youtube-no-translation/dist/content/scripts/timestampScript.js",
        );
        let script;
        if (isSafari()) {
          fetch(url)
            .then((r) => r.text())
            .then((code) => {
              script = document.createElement("script");
              script.type = "text/javascript";
              script.textContent = code;
              script.setAttribute(
                "ynt-timestamp-event",
                JSON.stringify(timestampData),
              );
              document.documentElement.appendChild(script);
              setTimeout(() => {
                if (script.parentNode) {
                  script.parentNode.removeChild(script);
                }
              }, 100);
            });
        } else {
          script = document.createElement("script");
          script.src = url;
          script.setAttribute(
            "ynt-timestamp-event",
            JSON.stringify(timestampData),
          );
          document.documentElement.appendChild(script);
          setTimeout(() => {
            if (script.parentNode) {
              script.parentNode.removeChild(script);
            }
          }, 100);
        }
      }
    };
    document.addEventListener("click", timestampClickHandler);
  }
  function cleanupTimestampClickObserver() {
    if (timestampClickHandler) {
      document.removeEventListener("click", timestampClickHandler);
      timestampClickHandler = null;
    }
  }
  var pageGridObservers = [];
  var pageGridParentObserver = null;
  var recommendedObserver = null;
  var searchObserver = null;
  var playlistObserver = null;
  var OBSERVERS_DEBOUNCE_MS = 100;
  var pageVideosDebounceTimer = null;
  var recommendedDebounceTimer = null;
  var searchDebounceTimer = null;
  var playlistDebounceTimer = null;
  async function pageVideosObserver() {
    cleanupPageVideosObserver();
    let pageName = "";
    if (window.location.pathname === "/") {
      pageName = "Home";
    } else if (window.location.pathname === "/feed/subscriptions") {
      pageName = "Subscriptions";
    } else if (window.location.pathname.includes("/@")) {
      pageName = "Channel";
    } else if (window.location.pathname === "/feed/trending") {
      pageName = "Trending";
    } else {
      pageName = "Unknown";
    }
    coreLog(
      `Setting up ${pageName} page videos observer (${isMobileSite() ? "mobile" : "desktop"})`,
    );
    if (isMobileSite()) {
      const gridContents = document.querySelector(
        ".rich-grid-renderer-contents",
      );
      if (!gridContents) {
        await new Promise((resolve) => {
          const observer = new MutationObserver(() => {
            const found = document.querySelector(
              ".rich-grid-renderer-contents",
            );
            if (found) {
              observer.disconnect();
              resolve();
            }
          });
          observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
          });
        });
      }
      const grid = document.querySelector(".rich-grid-renderer-contents");
      if (grid) {
        const observer = new MutationObserver(() =>
          handleGridMutationDebounced(pageName),
        );
        observer.observe(grid, {
          childList: true,
          attributes: true,
          characterData: true,
        });
        pageGridObservers.push(observer);
      }
    } else {
      const grids = Array.from(
        document.querySelectorAll("#contents.ytd-rich-grid-renderer"),
      );
      if (grids.length === 0) {
        await new Promise((resolve) => {
          const observer = new MutationObserver(() => {
            const found = document.querySelector(
              "#contents.ytd-rich-grid-renderer",
            );
            if (found) {
              observer.disconnect();
              resolve();
            }
          });
          observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
          });
        });
      }
      const allGrids = Array.from(
        document.querySelectorAll("#contents.ytd-rich-grid-renderer"),
      );
      allGrids.forEach((grid) => {
        const observer = new MutationObserver(() =>
          handleGridMutationDebounced(pageName),
        );
        observer.observe(grid, {
          childList: true,
          attributes: true,
          characterData: true,
        });
        pageGridObservers.push(observer);
      });
      const gridParent = document.querySelector(
        "#primary > ytd-rich-grid-renderer",
      );
      if (gridParent) {
        pageGridParentObserver = new MutationObserver(() =>
          handleGridMutationDebounced(pageName),
        );
        pageGridParentObserver.observe(gridParent, {
          attributes: true,
        });
      }
    }
  }
  function handleGridMutationDebounced(pageName) {
    if (pageVideosDebounceTimer !== null) {
      clearTimeout(pageVideosDebounceTimer);
    }
    pageVideosDebounceTimer = window.setTimeout(() => {
      coreLog(`${pageName} page mutation detected.`);
      refreshShortsAlternativeFormat();
      refreshBrowsingVideos();
      refreshBrowsingVideos().then(() => {
        setTimeout(() => {
          refreshBrowsingVideos();
          refreshShortsAlternativeFormat();
        }, 500);
        setTimeout(() => {
          refreshBrowsingVideos();
          refreshShortsAlternativeFormat();
        }, 1e3);
      });
      pageVideosDebounceTimer = null;
    }, OBSERVERS_DEBOUNCE_MS);
  }
  function recommendedVideosObserver() {
    cleanupRecommendedVideosObserver();
    const containerSelector = isMobileSite()
      ? 'ytm-item-section-renderer[section-identifier="related-items"]'
      : "#secondary-inner ytd-watch-next-secondary-results-renderer #items";
    waitForElement(containerSelector).then((contents) => {
      browsingTitlesLog(
        `Setting up recommended videos observer (${isMobileSite() ? "mobile" : "desktop"})`,
      );
      refreshBrowsingVideos();
      if (isMobileSite()) {
        recommendedObserver = new MutationObserver(() => {
          if (recommendedDebounceTimer !== null) {
            clearTimeout(recommendedDebounceTimer);
          }
          recommendedDebounceTimer = window.setTimeout(() => {
            browsingTitlesLog("Recommended videos mutation debounced (mobile)");
            refreshBrowsingVideos().then(() => {
              setTimeout(() => {
                refreshBrowsingVideos();
              }, 1e3);
              setTimeout(() => {
                refreshBrowsingVideos();
              }, 2e3);
            });
            recommendedDebounceTimer = null;
          }, OBSERVERS_DEBOUNCE_MS);
        });
        recommendedObserver.observe(contents, {
          childList: true,
          subtree: true,
        });
      } else {
        const itemSection = contents.querySelector("ytd-item-section-renderer");
        const targetElement = itemSection ? itemSection : contents;
        browsingTitlesLog(
          `Observing: ${targetElement === contents ? "#items directly" : "ytd-item-section-renderer inside #items"}`,
        );
        recommendedObserver = new MutationObserver(() => {
          if (recommendedDebounceTimer !== null) {
            clearTimeout(recommendedDebounceTimer);
          }
          recommendedDebounceTimer = window.setTimeout(() => {
            browsingTitlesLog(
              "Recommended videos mutation debounced (desktop)",
            );
            refreshBrowsingVideos().then(() => {
              setTimeout(() => {
                refreshBrowsingVideos();
              }, 1e3);
              setTimeout(() => {
                refreshBrowsingVideos();
              }, 2e3);
            });
            recommendedDebounceTimer = null;
          }, OBSERVERS_DEBOUNCE_MS);
        });
        recommendedObserver.observe(targetElement, {
          childList: true,
          subtree: true,
        });
      }
    });
  }
  function searchResultsObserver() {
    cleanupSearchResultsVideosObserver();
    const containerSelector = isMobileSite()
      ? "ytm-section-list-renderer"
      : "ytd-section-list-renderer #contents";
    waitForElement(containerSelector).then((contents) => {
      let pageName = null;
      if (window.location.pathname === "/results") {
        pageName = "Search";
      } else if (window.location.pathname === "/feed/history") {
        pageName = "History";
      } else if (window.location.pathname === "/feed/subscriptions") {
        pageName = "Subscriptions";
      } else {
        pageName = "Unknown";
      }
      browsingTitlesLog(
        `Setting up ${pageName} results videos observer (${isMobileSite() ? "mobile" : "desktop"})`,
      );
      waitForFilledVideoTitles().then(() => {
        refreshBrowsingVideos();
        refreshShortsAlternativeFormat();
      });
      searchObserver = new MutationObserver((mutations) => {
        if (isMobileSite()) {
          let hasChanges = false;
          for (const mutation of mutations) {
            if (
              mutation.type === "childList" &&
              mutation.addedNodes.length > 0
            ) {
              hasChanges = true;
              break;
            }
          }
          if (hasChanges) {
            if (searchDebounceTimer !== null) {
              clearTimeout(searchDebounceTimer);
            }
            searchDebounceTimer = window.setTimeout(() => {
              browsingTitlesLog(`${pageName} page mutation debounced (mobile)`);
              refreshShortsAlternativeFormat();
              refreshBrowsingVideos().then(() => {
                setTimeout(() => {
                  refreshBrowsingVideos();
                  refreshShortsAlternativeFormat();
                }, 1e3);
                setTimeout(() => {
                  refreshBrowsingVideos();
                  refreshShortsAlternativeFormat();
                }, 2e3);
              });
              searchDebounceTimer = null;
            }, OBSERVERS_DEBOUNCE_MS);
          }
        } else {
          for (const mutation of mutations) {
            if (
              mutation.type === "childList" &&
              mutation.addedNodes.length > 0 &&
              mutation.target instanceof HTMLElement
            ) {
              const titles = mutation.target.querySelectorAll("#video-title");
              if (titles.length > 0) {
                if (searchDebounceTimer !== null) {
                  clearTimeout(searchDebounceTimer);
                }
                searchDebounceTimer = window.setTimeout(() => {
                  browsingTitlesLog(`${pageName} page mutation debounced`);
                  refreshShortsAlternativeFormat();
                  refreshBrowsingVideos().then(() => {
                    setTimeout(() => {
                      refreshBrowsingVideos();
                      refreshShortsAlternativeFormat();
                    }, 1e3);
                    setTimeout(() => {
                      refreshBrowsingVideos();
                      refreshShortsAlternativeFormat();
                    }, 2e3);
                  });
                  searchDebounceTimer = null;
                }, OBSERVERS_DEBOUNCE_MS);
                break;
              }
            }
          }
        }
      });
      searchObserver.observe(contents, {
        childList: true,
        subtree: true,
      });
    });
  }
  function playlistVideosObserver() {
    cleanupPlaylistVideosObserver();
    waitForElement("ytd-playlist-panel-renderer#playlist #items").then(
      (contents) => {
        browsingTitlesLog("Setting up playlist observer");
        playlistObserver = new MutationObserver((mutations) => {
          let hasVideoChange = false;
          mutations.forEach((mutation) => {
            const target = mutation.target;
            const isRelevant =
              // Direct childList changes on #items
              (mutation.type === "childList" && target.id === "items") || // Direct addition/removal of video renderer elements
              (mutation.type === "childList" &&
                Array.from(mutation.addedNodes).some(
                  (node) =>
                    node instanceof Element &&
                    node.tagName === "YTD-PLAYLIST-PANEL-VIDEO-RENDERER",
                )) ||
              (mutation.type === "childList" &&
                Array.from(mutation.removedNodes).some(
                  (node) =>
                    node instanceof Element &&
                    node.tagName === "YTD-PLAYLIST-PANEL-VIDEO-RENDERER",
                ));
            if (isRelevant) {
              const hasAddedVideos = Array.from(mutation.addedNodes).some(
                (node) =>
                  node instanceof Element &&
                  node.tagName === "YTD-PLAYLIST-PANEL-VIDEO-RENDERER",
              );
              const hasRemovedVideos = Array.from(mutation.removedNodes).some(
                (node) =>
                  node instanceof Element &&
                  node.tagName === "YTD-PLAYLIST-PANEL-VIDEO-RENDERER",
              );
              if (hasAddedVideos || hasRemovedVideos) {
                hasVideoChange = true;
                browsingTitlesLog("Playlist video change detected");
              }
            }
          });
          if (hasVideoChange) {
            if (playlistDebounceTimer !== null) {
              clearTimeout(playlistDebounceTimer);
            }
            playlistDebounceTimer = window.setTimeout(() => {
              refreshBrowsingVideos();
              playlistDebounceTimer = null;
            }, OBSERVERS_DEBOUNCE_MS);
          }
        });
        playlistObserver.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
      },
    );
  }
  function cleanupAllBrowsingTitlesObservers() {
    cleanupPageVideosObserver();
    cleanupRecommendedVideosObserver();
    cleanupSearchResultsVideosObserver();
    cleanupPlaylistVideosObserver();
  }
  function cleanupPageVideosObserver() {
    pageGridObservers.forEach((observer) => observer.disconnect());
    pageGridObservers = [];
    pageGridParentObserver?.disconnect();
    pageGridParentObserver = null;
    if (pageVideosDebounceTimer !== null) {
      clearTimeout(pageVideosDebounceTimer);
      pageVideosDebounceTimer = null;
    }
  }
  function cleanupRecommendedVideosObserver() {
    recommendedObserver?.disconnect();
    recommendedObserver = null;
    if (recommendedDebounceTimer !== null) {
      clearTimeout(recommendedDebounceTimer);
      recommendedDebounceTimer = null;
    }
  }
  function cleanupSearchResultsVideosObserver() {
    searchObserver?.disconnect();
    searchObserver = null;
    if (searchDebounceTimer !== null) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }
  }
  function cleanupPlaylistVideosObserver() {
    playlistObserver?.disconnect();
    playlistObserver = null;
    if (playlistDebounceTimer !== null) {
      clearTimeout(playlistDebounceTimer);
      playlistDebounceTimer = null;
    }
  }
  var notificationTitlesDropdownObserver = null;
  var notificationDropdownHandled = false;
  function setupNotificationTitlesDropdownObserver() {
    cleanupNotificationTitlesDropdownObserver();
    notificationDropdownHandled = false;
    notificationTitlesDropdownObserver = new MutationObserver(() => {
      waitForElement(
        'ytd-popup-container tp-yt-iron-dropdown[vertical-align="top"]',
      )
        .then((dropdown) => {
          const menuRenderer = dropdown.querySelector(
            "ytd-multi-page-menu-renderer",
          );
          const menuStyle = menuRenderer?.getAttribute("menu-style");
          const isNotificationMenu =
            menuStyle === "multi-page-menu-style-type-notifications";
          const computedStyle = window.getComputedStyle(dropdown);
          const isVisible = computedStyle.display !== "none";
          if (isVisible && isNotificationMenu && !notificationDropdownHandled) {
            notificationDropdownHandled = true;
            coreLog(
              "Notification titles dropdown appeared, setting up observer",
            );
            setupNotificationTitlesObserver();
          } else if (
            (!isVisible || !isNotificationMenu) &&
            notificationDropdownHandled
          ) {
            notificationDropdownHandled = false;
            cleanupNotificationTitlesObserver();
          }
        })
        .catch(() => {});
    });
    const popupContainer = document.querySelector("ytd-popup-container");
    const targetElement = popupContainer || document.documentElement;
    notificationTitlesDropdownObserver.observe(targetElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
    });
  }
  function cleanupNotificationTitlesDropdownObserver() {
    if (notificationTitlesDropdownObserver) {
      notificationTitlesDropdownObserver.disconnect();
      notificationTitlesDropdownObserver = null;
    }
    notificationDropdownHandled = false;
    cleanupNotificationTitlesObserver();
  }
  var urlChangeDebounceTimer = null;
  var URL_CHANGE_DEBOUNCE_MS = 250;
  function setupUrlObserver() {
    if (isIrrelevantIframe()) {
      coreLog(
        `[URL] Ignored observer setup for iframe: ${window.location.href}`,
      );
      return;
    }
    coreLog("Setting up URL observer");
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function (...args) {
      coreLog("pushState called with:", args);
      originalPushState.apply(this, args);
      handleUrlChange();
    };
    history.replaceState = function (...args) {
      coreLog("replaceState called with:", args);
      originalReplaceState.apply(this, args);
      handleUrlChange();
    };
    window.addEventListener("popstate", () => {
      coreLog("popstate event triggered");
      handleUrlChange();
    });
    if (isMobileSite()) {
      window.addEventListener("state-navigateend", () => {
        coreLog("Mobile SPA navigation completed (state-navigateend)");
        handleUrlChange();
      });
    } else {
      window.addEventListener("yt-page-data-updated", () => {
        coreLog("Desktop page data updated (yt-page-data-updated)");
        handleUrlChange();
      });
    }
    handleUrlChange();
  }
  function observersCleanup() {
    coreLog("Cleaning up all previous observers");
    cleanupMainVideoObserver();
    cleanupMainTitleContentObserver();
    cleanupIsEmptyObserver();
    cleanupPageTitleObserver();
    cleanupEmbedTitleContentObserver();
    cleanupMiniplayerTitleContentObserver();
    cleanupChannelNameContentObserver();
    cleanupAllBrowsingTitlesObservers();
    cleanupAllBrowsingTitlesElementsObservers();
    cleanupDescriptionObservers();
    cleanupTimestampClickObserver();
    cleanupChaptersObserver();
    cleanupAllSearchDescriptionsObservers();
    cleanupNotificationTitlesDropdownObserver();
    cleanupEndScreenObserver();
    cleanupPostVideoObserver();
    cleanupChannelDescriptionModalObserver();
    cleanupInfoCards();
    cleanupInfoCardTeasersObserver();
    cleanupThumbnailObservers();
    cleanupMobilePanelObserver();
  }
  function handleUrlChange() {
    if (urlChangeDebounceTimer !== null) {
      clearTimeout(urlChangeDebounceTimer);
    }
    urlChangeDebounceTimer = window.setTimeout(() => {
      handleUrlChangeInternal();
      urlChangeDebounceTimer = null;
    }, URL_CHANGE_DEBOUNCE_MS);
  }
  function handleUrlChangeInternal() {
    coreLog(`[URL] Full URL:`, window.location.href);
    observersCleanup();
    if (!isMobileSite() && currentSettings?.titleTranslation) {
      setupNotificationTitlesDropdownObserver();
    }
    if (currentSettings?.titleTranslation) {
      setTimeout(() => {
        refreshBrowsingVideos();
        refreshShortsAlternativeFormat();
      }, 2e3);
      setTimeout(() => {
        refreshBrowsingVideos();
        refreshShortsAlternativeFormat();
      }, 5e3);
      setTimeout(() => {
        refreshBrowsingVideos();
        refreshShortsAlternativeFormat();
      }, 1e4);
      refreshMiniplayerTitle();
      setTimeout(() => refreshMiniplayerTitle(), 1e3);
      setTimeout(() => refreshMiniplayerTitle(), 3e3);
    }
    const isChannelPage = window.location.pathname.includes("/@");
    if (isChannelPage) {
      coreLog(`[URL] Detected channel page`);
      if (
        (currentSettings?.titleTranslation ||
          currentSettings?.descriptionTranslation) &&
        !isMobileSite()
      ) {
        waitForElement("#c4-player").then(() => {
          refreshChannelPlayer();
        });
      }
      if (currentSettings?.titleTranslation) {
        pageVideosObserver();
        waitForElement("h1.dynamicTextViewModelH1")
          .then(() => {
            refreshMainChannelName();
          })
          .catch((err) => {
            titlesErrorLog("Timeout waiting for channel name element:", err);
            refreshMainChannelName();
          });
      }
      if (currentSettings?.descriptionTranslation && !isMobileSite()) {
        waitForElement("ytd-video-renderer").then(() => {
          processChannelVideoDescriptions();
        });
        waitForElement("yt-description-preview-view-model").then(() => {
          refreshChannelShortDescription();
        });
      }
      return;
    }
    const isShortsPage = window.location.pathname.startsWith("/shorts");
    if (isShortsPage) {
      coreLog(`[URL] Detected shorts page`);
      currentSettings?.titleTranslation && checkShortsId();
      return;
    }
    switch (window.location.pathname) {
      case "/results":
        coreLog(`[URL] Detected search page`);
        if (currentSettings?.titleTranslation) {
          searchResultsObserver();
          refreshBrowsingVideos();
          refreshShortsAlternativeFormat();
          patchChannelRendererBlocks();
        }
        break;
      case "/":
        coreLog(`[URL] Detected home page`);
        currentSettings?.titleTranslation && pageVideosObserver();
        break;
      case "/feed/subscriptions":
        coreLog(`[URL] Detected subscriptions page`);
        currentSettings?.titleTranslation && pageVideosObserver();
        currentSettings?.titleTranslation && searchResultsObserver();
        break;
      case "/feed/trending":
        coreLog(`[URL] Detected trending page`);
        currentSettings?.titleTranslation && pageVideosObserver();
        break;
      case "/feed/history":
        coreLog(`[URL] Detected history page`);
        currentSettings?.titleTranslation && searchResultsObserver();
        break;
      case "/playlist":
        coreLog(`[URL] Detected playlist page`);
        if (!isMobileSite()) {
          currentSettings?.titleTranslation && playlistVideosObserver();
        }
        break;
      case "/channel":
        coreLog(`[URL] Detected channel page`);
        currentSettings?.titleTranslation && pageVideosObserver();
        break;
      case "/watch":
        coreLog(`[URL] Detected video page`);
        if (!isMobileSite()) {
          if (
            currentSettings?.titleTranslation &&
            window.location.search.includes("list=")
          ) {
            coreLog(`[URL] Detected video page with playlist`);
            playlistVideosObserver();
          }
          if (
            currentSettings?.titleTranslation ||
            currentSettings?.descriptionTranslation
          ) {
            setupMainVideoObserver();
          }
          currentSettings?.descriptionTranslation &&
            setupTimestampClickObserver();
          if (currentSettings?.titleTranslation) {
            refreshEmbedTitle();
            setTimeout(() => refreshEmbedTitle(), 1e3);
            setTimeout(() => refreshEmbedTitle(), 3e3);
          }
        } else {
          if (currentSettings?.titleTranslation) {
            waitForElement("ytm-slim-video-information-renderer").then(() => {
              refreshMainTitle();
            });
          }
        }
        if (currentSettings?.titleTranslation) {
          recommendedVideosObserver();
          if (!isMobileSite()) {
            setupEndScreenObserver();
            setupPostVideoObserver();
            refreshInfoCardsTitles();
            setupInfoCardTeasersObserver();
          }
        }
        if (
          isMobileSite() &&
          (currentSettings?.titleTranslation ||
            currentSettings?.descriptionTranslation)
        ) {
          setupMobilePanelObserver();
        }
        break;
      case "/embed":
        coreLog(`[URL] Detected embed video page`);
        break;
    }
  }
  var visibilityChangeListener = null;
  function setupVisibilityChangeListener() {
    cleanupVisibilityChangeListener();
    coreLog("Setting up visibility change listener");
    visibilityChangeListener = () => {
      if (document.visibilityState === "visible") {
        coreLog(
          "Tab became visible, refreshing titles to fix potential duplicates",
        );
        if (currentSettings?.titleTranslation) {
          refreshBrowsingVideos();
          refreshShortsAlternativeFormat();
          refreshMiniplayerTitle();
          if (window.location.pathname === "/watch") {
            refreshMainTitle();
            if (!isMobileSite()) {
              refreshEndScreenTitles();
              refreshInfoCardsTitles();
            }
          }
        }
      }
    };
    document.addEventListener("visibilitychange", visibilityChangeListener);
  }
  function cleanupVisibilityChangeListener() {
    if (visibilityChangeListener) {
      document.removeEventListener(
        "visibilitychange",
        visibilityChangeListener,
      );
      visibilityChangeListener = null;
    }
  }

  // src/utils/i18n.ts
  function getMessage(key, substitutions) {
    return browser.i18n.getMessage(key, substitutions) || key;
  }
  function localizeDocument() {
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      const key = element.getAttribute("data-i18n");
      if (key) {
        element.textContent = getMessage(key);
      }
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
      const key = element.getAttribute("data-i18n-placeholder");
      if (key && element instanceof HTMLInputElement) {
        element.placeholder = getMessage(key);
      }
    });
    document.querySelectorAll("[data-i18n-title]").forEach((element) => {
      const key = element.getAttribute("data-i18n-title");
      if (key && element instanceof HTMLElement) {
        element.title = getMessage(key);
      }
    });
    document.querySelectorAll("option[data-i18n]").forEach((element) => {
      const key = element.getAttribute("data-i18n");
      if (key && element instanceof HTMLOptionElement) {
        element.textContent = getMessage(key);
      }
    });
  }

  // src/content/SupportToast/toast.ts
  var TOAST_ID = "ynt-support-toast";
  var REMIND_DELAY = 30;
  var INITIAL_DELAY = 7;
  var toastStorageListener = null;
  var FIREFOX_REVIEW_URL =
    "https://addons.mozilla.org/firefox/addon/youtube-no-translation/reviews/";
  var CHROME_REVIEW_URL =
    "https://chromewebstore.google.com/detail/youtube-no-translation/lmkeolibdeeglfglnncmfleojmakecjb/reviews";
  var EDGE_REVIEW_URL =
    "https://microsoftedge.microsoft.com/addons/detail/youtube-no-translation/dflkepcdbnjbbfdokanhhdeolodkcofb";
  function daysBetween(date1, date2) {
    return Math.floor(
      (new Date(date2).getTime() - new Date(date1).getTime()) /
        (1e3 * 60 * 60 * 24),
    );
  }
  async function getSettings() {
    const data = await browser.storage.local.get("settings");
    return data.settings;
  }
  async function setSettings(settings) {
    await browser.storage.local.set({ settings });
  }
  function getReviewUrl() {
    if (isFirefox()) {
      return FIREFOX_REVIEW_URL;
    } else if (isEdge()) {
      return EDGE_REVIEW_URL;
    } else if (isChromium()) {
      return CHROME_REVIEW_URL;
    }
    return null;
  }
  function getStoreNameKey() {
    if (isFirefox()) {
      return "toast_storeName_firefox";
    } else if (isEdge()) {
      return "toast_storeName_edge";
    } else if (isChromium()) {
      return "toast_storeName_chrome";
    }
    return null;
  }
  function injectToast() {
    if (document.getElementById(TOAST_ID)) return;
    const reviewUrl = getReviewUrl();
    const storeNameKey = getStoreNameKey();
    fetch(
      browser.runtime.getURL(
        "modules/youtube-no-translation/dist/content/toast.html",
      ),
    )
      .then((res) => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then((html) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const toast = doc.body.firstElementChild;
        if (toast) {
          document.body.appendChild(toast);
          localizeDocument();
          if (toastStorageListener) {
            browser.storage.onChanged.removeListener(toastStorageListener);
            toastStorageListener = null;
          }
          toastStorageListener = (changes, area) => {
            if (area === "local" && changes.supportToastClosed?.newValue) {
              removeToast();
            }
          };
          browser.storage.onChanged.addListener(toastStorageListener);
        }
        const extensionIcon = document.querySelector(
          '#ynt-support-toast img[alt="Extension icon"]',
        );
        if (extensionIcon) {
          extensionIcon.src = browser.runtime.getURL(
            "modules/youtube-no-translation/dist/assets/icons/icon_48.png",
          );
        }
        const koFiImg = document.getElementById("ynt-ko-fi-img");
        if (koFiImg) {
          koFiImg.src = browser.runtime.getURL(
            "modules/youtube-no-translation/dist/assets/icons/ko-fi.png",
          );
        }
        if (reviewUrl && storeNameKey) {
          const koFiContainer = document.querySelector(
            "#ynt-support-toast > div:nth-child(4)",
          );
          if (koFiContainer) {
            const reviewSection = document.createElement("div");
            reviewSection.style.cssText =
              "font-size: 0.85em; text-align: center; color: #d1d5db; width: 100%;";
            const textBefore = document.createTextNode(
              getMessage("toast_review_prefix"),
            );
            const reviewLink = document.createElement("a");
            reviewLink.href = reviewUrl;
            reviewLink.target = "_blank";
            reviewLink.rel = "noopener noreferrer";
            reviewLink.style.cssText =
              "color: #60a5fa; text-decoration: none; font-weight: 500;";
            reviewLink.textContent = getMessage(storeNameKey);
            const textAfter = document.createTextNode(
              getMessage("toast_review_suffix"),
            );
            reviewSection.appendChild(textBefore);
            reviewSection.appendChild(reviewLink);
            reviewSection.appendChild(textAfter);
            koFiContainer.insertAdjacentElement("afterend", reviewSection);
          }
        }
        const supportBtn = document.getElementById("ynt-ko-fi-btn");
        const remindBtn = document.getElementById("ynt-remind-btn");
        supportBtn?.addEventListener("click", () => {
          window.open("https://ko-fi.com/yougo", "_blank");
        });
        remindBtn?.addEventListener("click", async () => {
          const settings = await getSettings();
          if (settings) {
            settings.askForSupport.lastPromptDate =
              /* @__PURE__ */ new Date().toISOString();
            await setSettings(settings);
          }
          removeToast();
        });
        const dismissBtns = document.querySelectorAll(".ynt-dismiss-btn");
        dismissBtns.forEach((btn) => {
          btn.addEventListener("click", async () => {
            const settings = await getSettings();
            if (settings) {
              settings.askForSupport.enabled = false;
              await setSettings(settings);
            }
            removeToast();
          });
        });
      })
      .catch((err) => {
        console.error("[YNT] Failed to fetch toast.html:", err);
      });
  }
  async function removeToast() {
    const toast = document.getElementById(TOAST_ID);
    if (toast) toast.remove();
    if (toastStorageListener) {
      browser.storage.onChanged.removeListener(toastStorageListener);
      toastStorageListener = null;
    }
    await browser.storage.local.set({ supportToastClosed: true });
  }
  async function maybeShowSupportToast() {
    if (!window.location.hostname.match(/(^|\.)youtube\.com$/)) {
      return;
    }
    const settings = await getSettings();
    if (!settings?.askForSupport?.enabled) {
      return;
    }
    const { supportToastClosed } =
      await browser.storage.local.get("supportToastClosed");
    if (supportToastClosed) return;
    const now = /* @__PURE__ */ new Date().toISOString();
    const { installationDate, lastPromptDate } = settings.askForSupport;
    if (!lastPromptDate) {
      if (daysBetween(installationDate, now) >= INITIAL_DELAY) {
        injectToast();
      } else {
      }
      return;
    }
    if (daysBetween(lastPromptDate, now) >= REMIND_DELAY) {
      injectToast();
    } else {
    }
  }

  // src/content/index.ts
  coreLog("Content script starting to load...");
  var currentSettings = null;
  async function fetchSettings() {
    const data = await browser.storage.local.get("settings");
    currentSettings = data.settings;
    if (!currentSettings) {
      coreLog("No settings found, using default settings.");
      currentSettings = DEFAULT_SETTINGS;
      await browser.storage.local.set({ settings: DEFAULT_SETTINGS });
    } else {
      const { added, removed, fixed } = sanitizeSettings(
        currentSettings,
        DEFAULT_SETTINGS,
      );
      const changes = [];
      if (added.length) changes.push(`added: ${added.join(", ")}`);
      if (removed.length) changes.push(`removed: ${removed.join(", ")}`);
      if (fixed.length) changes.push(`fixed types: ${fixed.join(", ")}`);
      if (changes.length) {
        coreLog(`Settings sanitized: ${changes.join(" | ")}`);
        await browser.storage.local.set({ settings: currentSettings });
      }
    }
  }
  async function initializeFeatures() {
    if (isYouTubeMusic()) {
      coreLog("YouTube Music detected; extension disabled for this domain.");
      return;
    }
    if (isIrrelevantIframe()) {
      return;
    }
    await fetchSettings();
    setupUrlObserver();
    setupVisibilityChangeListener();
    if (isEmbedVideo()) {
      coreLog("Embed video detected;");
    }
    currentSettings?.titleTranslation && initializeTitleTranslation();
    if (!isMobileSite()) {
      currentSettings?.audioTranslation?.enabled &&
        initializeAudioTranslation();
    } else {
      coreLog(
        "Mobile site detected; skipping audio translation initialization.",
      );
    }
    currentSettings?.descriptionTranslation &&
      initializeDescriptionTranslation();
    currentSettings?.subtitlesTranslation?.enabled &&
      initializeSubtitlesTranslation();
    currentSettings?.askForSupport?.enabled && maybeShowSupportToast();
  }
  var videoPlayerListenerInitialized = false;
  function initializeVideoPlayerListener() {
    if (
      !videoPlayerListenerInitialized &&
      (currentSettings?.audioTranslation?.enabled ||
        currentSettings?.subtitlesTranslation?.enabled)
    ) {
      setupVideoPlayerListener();
      videoPlayerListenerInitialized = true;
    }
  }
  var mainVideoObserverInitialized = false;
  function initializeMainVideoObserver() {
    if (
      !mainVideoObserverInitialized &&
      (currentSettings?.titleTranslation ||
        currentSettings?.descriptionTranslation)
    ) {
      setupMainVideoObserver();
      mainVideoObserverInitialized = true;
    }
  }
  function initializeTitleTranslation() {
    titlesLog("Initializing title translation prevention");
    if (isEmbedVideo()) {
      initializeVideoPlayerListener();
      return;
    }
  }
  function initializeAudioTranslation() {
    audioLog("Initializing audio translation prevention");
    initializeVideoPlayerListener();
  }
  function initializeDescriptionTranslation() {
    if (isEmbedVideo()) {
      return;
    }
    descriptionLog("Initializing description translation prevention");
  }
  function initializeSubtitlesTranslation() {
    subtitlesLog("Initializing subtitles translation prevention");
    initializeVideoPlayerListener();
  }
  browser.runtime.onMessage.addListener((message) => {
    if (isToggleMessage(message)) {
      switch (message.feature) {
        case "audio":
          if (message.isEnabled) {
            handleAudioTranslation();
            initializeVideoPlayerListener();
          }
          break;
        case "titles":
          if (message.isEnabled) {
            refreshMainTitle();
            refreshBrowsingVideos();
            refreshShortsAlternativeFormat();
            initializeMainVideoObserver();
          }
          break;
        case "description":
          if (message.isEnabled) {
            initializeMainVideoObserver();
          }
          break;
        case "subtitles":
          if (message.isEnabled) {
            handleSubtitlesTranslation();
            initializeVideoPlayerListener();
          }
          break;
        case "thumbnails":
          {
            refreshBrowsingVideos();
          }
          break;
      }
      return true;
    }
    return true;
  });
  initializeFeatures();
})();
