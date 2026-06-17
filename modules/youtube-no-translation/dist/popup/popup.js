"use strict";
(() => {
  // src/config/constants.ts
  var DEFAULT_SETTINGS = {
    titleTranslation: true,
    originalThumbnails: {
      enabled: true
    },
    audioTranslation: {
      enabled: true,
      language: "original"
    },
    descriptionTranslation: true,
    subtitlesTranslation: {
      enabled: false,
      language: "disabled",
      asrEnabled: false
    },
    youtubeDataApi: {
      enabled: false,
      apiKey: ""
    },
    askForSupport: {
      enabled: true,
      installationDate: (/* @__PURE__ */ new Date()).toISOString(),
      lastPromptDate: ""
    },
    devLog: false
  };

  // src/utils/settings.ts
  function sanitizeSettings(settings, defaults) {
    const added = [];
    const removed = [];
    const fixed = [];
    for (const key in settings) {
      if (Object.prototype.hasOwnProperty.call(settings, key) && !Object.prototype.hasOwnProperty.call(defaults, key)) {
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
          added.push(...nestedResult.added.map((nestedKey) => `${key}.${nestedKey}`));
          removed.push(...nestedResult.removed.map((nestedKey) => `${key}.${nestedKey}`));
          fixed.push(...nestedResult.fixed.map((nestedKey) => `${key}.${nestedKey}`));
        }
      } else if (!isSameType(currentValue, defaultValue)) {
        settings[key] = defaultValue;
        fixed.push(key);
      }
    }
    return { added, removed, fixed };
  }
  function isNestedObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
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

  // src/utils/logger.ts
  var LOG_PREFIX = "[YNT]";
  var LOG_STYLES = {
    MAIN_TITLE: {
      context: "[Main Title]",
      color: "#fcd34d"
      // yellow
    },
    BROWSING_TITLES: {
      context: "[Browsing Titles]",
      color: "#fca5a5"
      // light red
    },
    TITLES: {
      context: "[Titles]",
      color: "#86efac"
      // light green
    },
    DESCRIPTION: {
      context: "[Description]",
      color: "#2196F3"
      // blue
    },
    AUDIO: {
      context: "[Audio]",
      color: "#4CAF50"
      // green
    },
    CORE: {
      context: "[Core]",
      color: "#c084fc"
      // light purple
    },
    SUBTITLES: {
      context: "[Subtitles]",
      color: "#FF9800"
      // orange
    },
    CHANNEL_NAME: {
      context: "[Channel Name]",
      color: "#06b6d4"
      // light blue
    },
    CHAPTERS: {
      context: "[Chapters]",
      color: "#9C27B0"
      // purple
    },
    THUMBNAILS: {
      context: "[Thumbnails]",
      color: "#8B5CF6"
      // violet
    }
  };
  var ERROR_COLOR = "#F44336";
  var DEV_LOG_KEY = "ynt-devLog";
  browser.storage.local.get("settings").then((data) => {
    const enabled = data?.settings?.devLog === true;
    localStorage.setItem(DEV_LOG_KEY, enabled ? "true" : "false");
  }).catch(() => {
    localStorage.setItem(DEV_LOG_KEY, "false");
  });
  browser.storage.onChanged.addListener((changes) => {
    if (changes.settings?.newValue?.devLog !== void 0) {
      localStorage.setItem(DEV_LOG_KEY, changes.settings.newValue.devLog ? "true" : "false");
    }
  });
  function createLogger(category) {
    return (message, ...args) => {
      if (localStorage.getItem(DEV_LOG_KEY) !== "true") return;
      console.log(
        `%c${LOG_PREFIX}${category.context} ${message}`,
        `color: ${category.color}`,
        ...args
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
        ...args
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

  // src/utils/browser.ts
  function isSafari() {
    const url = browser.runtime.getURL("");
    return url.startsWith("safari-web-extension://");
  }

  // src/utils/display.ts
  var extensionVersionElement = document.getElementById("extensionVersion");
  var extensionNameElement = document.getElementById("extensionName");
  function displayExtensionVersion() {
    if (extensionVersionElement) {
      const manifest = browser.runtime.getManifest();
      extensionVersionElement.textContent = manifest.version;
    }
  }
  function displayExtensionName() {
    if (extensionNameElement) {
      const manifest = browser.runtime.getManifest();
      extensionNameElement.textContent = manifest.name;
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

  // src/popup/popup.ts
  var titleToggle = document.getElementById("titleTranslation");
  var originalThumbnailsToggle = document.getElementById("originalThumbnails");
  var audioToggle = document.getElementById("audioTranslation");
  var audioLanguageSelect = document.getElementById("audioLanguage");
  var descriptionToggle = document.getElementById("descriptionTranslation");
  var subtitlesToggle = document.getElementById("subtitlesTranslation");
  var subtitlesLanguageSelect = document.getElementById("subtitlesLanguage");
  var asrSubtitlesToggle = document.getElementById("asrSubtitlesEnabled");
  var asrToggleContainer = document.getElementById("asrToggleContainer");
  var youtubeDataApiToggle = document.getElementById("youtubeDataApiEnabled");
  var youtubeDataApiKeyInput = document.getElementById("youtubeDataApiKey");
  var youtubeApiKeyContainer = document.getElementById("youtubeApiKeyContainer");
  var devLogToggle = document.getElementById("devLogEnabled");
  var clearCacheBtn = document.getElementById("clearCacheBtn");
  var extraSettingsToggle = document.getElementById("extraSettingsToggle");
  var extraSettingsContent = document.getElementById("extraSettingsContent");
  var extraSettingsArrow = document.getElementById("extraSettingsArrow");
  function toggleExtraSettings() {
    if (!extraSettingsContent || !extraSettingsArrow) return;
    const isHidden = extraSettingsContent.classList.contains("hidden");
    if (isHidden) {
      extraSettingsContent.classList.remove("hidden");
      extraSettingsArrow.style.transform = "rotate(180deg)";
      adjustTooltipPositions();
    } else {
      extraSettingsContent.classList.add("hidden");
      extraSettingsArrow.style.transform = "rotate(0deg)";
    }
  }
  function updateAsrToggleVisibility() {
    if (!asrToggleContainer) return;
    const subtitlesEnabled = subtitlesToggle.checked;
    const selectedLanguage = subtitlesLanguageSelect.value;
    const shouldShow = subtitlesEnabled && selectedLanguage !== "disabled";
    asrToggleContainer.style.display = shouldShow ? "block" : "none";
  }
  document.addEventListener("DOMContentLoaded", async () => {
    localizeDocument();
    displayExtensionVersion();
    displayExtensionName();
    try {
      const data = await browser.storage.local.get("settings");
      let settings;
      let needsUpdate = false;
      if (!data.settings) {
        settings = DEFAULT_SETTINGS;
        needsUpdate = true;
        coreLog("No settings found, using defaults");
      } else {
        settings = { ...data.settings };
        const { added, removed, fixed } = sanitizeSettings(settings, DEFAULT_SETTINGS);
        const changes = [];
        if (added.length) changes.push(`added: ${added.join(", ")}`);
        if (removed.length) changes.push(`removed: ${removed.join(", ")}`);
        if (fixed.length) changes.push(`fixed types: ${fixed.join(", ")}`);
        if (changes.length > 0) {
          coreLog(`Settings sanitized: ${changes.join(" | ")}`);
          needsUpdate = true;
        }
      }
      if (needsUpdate) {
        await browser.storage.local.set({ settings });
        coreLog("Updated settings saved to storage");
      }
      titleToggle.checked = settings.titleTranslation;
      originalThumbnailsToggle.checked = settings.originalThumbnails.enabled;
      audioToggle.checked = settings.audioTranslation.enabled;
      audioLanguageSelect.value = settings.audioTranslation.language;
      descriptionToggle.checked = settings.descriptionTranslation;
      subtitlesToggle.checked = settings.subtitlesTranslation.enabled;
      subtitlesLanguageSelect.value = settings.subtitlesTranslation.language;
      asrSubtitlesToggle.checked = settings.subtitlesTranslation.asrEnabled;
      youtubeDataApiToggle.checked = settings.youtubeDataApi.enabled;
      youtubeDataApiKeyInput.value = settings.youtubeDataApi.apiKey;
      if (devLogToggle) devLogToggle.checked = settings.devLog ?? false;
      updateAsrToggleVisibility();
      if (youtubeDataApiToggle.checked && youtubeApiKeyContainer && youtubeApiKeyContainer.style.display !== void 0) {
        youtubeApiKeyContainer.style.display = "block";
      }
      coreLog(
        "Settings loaded - Title translation prevention is: %c%s",
        settings.titleTranslation ? "color: green; font-weight: bold" : "color: red; font-weight: bold",
        settings.titleTranslation ? "ON" : "OFF"
      );
      coreLog(
        "Settings loaded - Original thumbnails is: %c%s",
        settings.originalThumbnails.enabled ? "color: green; font-weight: bold" : "color: red; font-weight: bold",
        settings.originalThumbnails.enabled ? "ON" : "OFF"
      );
      coreLog(
        "Settings loaded - Audio translation prevention is: %c%s",
        settings.audioTranslation.enabled ? "color: green; font-weight: bold" : "color: red; font-weight: bold",
        settings.audioTranslation.enabled ? "ON" : "OFF"
      );
      coreLog(
        "Settings loaded - Description translation prevention is: %c%s",
        settings.descriptionTranslation ? "color: green; font-weight: bold" : "color: red; font-weight: bold",
        settings.descriptionTranslation ? "ON" : "OFF"
      );
      coreLog(
        "Settings loaded - Subtitles translation prevention is: %c%s",
        settings.subtitlesTranslation.enabled ? "color: green; font-weight: bold" : "color: red; font-weight: bold",
        settings.subtitlesTranslation.enabled ? "ON" : "OFF"
      );
    } catch (error) {
      coreErrorLog("Settings load error:", error);
    }
  });
  var urlParams = new URLSearchParams(window.location.search);
  var isWelcome = urlParams.get("welcome") === "true";
  if (isWelcome) {
    const pageTitle = document.getElementById("pageTitle");
    const welcomeMessage = document.getElementById("welcomeMessage");
    if (pageTitle) {
      const imgElement = pageTitle.querySelector("img");
      const extensionName = browser.runtime.getManifest().name;
      if (imgElement) {
        pageTitle.innerHTML = "";
        pageTitle.appendChild(imgElement);
        pageTitle.appendChild(document.createTextNode(getMessage("settings_welcome_titleComplete", extensionName)));
      }
    }
    if (welcomeMessage) {
      welcomeMessage.classList.remove("hidden");
    }
  }
  if (extraSettingsToggle) {
    extraSettingsToggle.addEventListener("click", toggleExtraSettings);
  }
  async function handleToggleChange(config) {
    const isEnabled = config.element.checked;
    try {
      const data = await browser.storage.local.get("settings");
      let settings = data.settings;
      if (config.storagePath && config.storagePath.length > 0) {
        let obj = settings;
        for (let i = 0; i < config.storagePath.length - 1; i++) {
          obj = obj[config.storagePath[i]];
        }
        obj[config.storagePath[config.storagePath.length - 1]] = isEnabled;
      } else {
        settings[config.storageKey] = isEnabled;
      }
      await browser.storage.local.set({ settings });
      if (config.uiUpdate) config.uiUpdate();
      try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id && tabs[0]?.url) {
          const isYouTubeTab = tabs[0].url.includes("youtube.com") || tabs[0].url.includes("youtube-nocookie.com");
          if (isYouTubeTab) {
            await browser.tabs.sendMessage(tabs[0].id, {
              action: "toggleTranslation",
              feature: config.messageFeature,
              isEnabled
            });
            coreLog(`Message sent to YouTube tab for ${config.messageFeature}`);
          } else {
            coreLog(`Settings updated but not sending message (not a YouTube tab): ${tabs[0].url}`);
          }
        }
      } catch (messageError) {
        coreLog(`Could not send message to content script for ${config.messageFeature}:`, messageError);
      }
      coreLog(`${config.storageKey} state updated`);
    } catch (error) {
      coreErrorLog(`${config.storageKey} update error:`, error);
    }
  }
  titleToggle.addEventListener(
    "change",
    () => handleToggleChange({
      element: titleToggle,
      storageKey: "titleTranslation",
      messageFeature: "titles"
    })
  );
  originalThumbnailsToggle.addEventListener(
    "change",
    () => handleToggleChange({
      element: originalThumbnailsToggle,
      storageKey: "originalThumbnails",
      storagePath: ["originalThumbnails", "enabled"],
      messageFeature: "thumbnails"
    })
  );
  audioToggle.addEventListener(
    "change",
    () => handleToggleChange({
      element: audioToggle,
      storageKey: "audioTranslation",
      storagePath: ["audioTranslation", "enabled"],
      messageFeature: "audio"
    })
  );
  descriptionToggle.addEventListener(
    "change",
    () => handleToggleChange({
      element: descriptionToggle,
      storageKey: "descriptionTranslation",
      messageFeature: "description"
    })
  );
  subtitlesToggle.addEventListener(
    "change",
    () => handleToggleChange({
      element: subtitlesToggle,
      storageKey: "subtitlesTranslation",
      storagePath: ["subtitlesTranslation", "enabled"],
      messageFeature: "subtitles",
      uiUpdate: updateAsrToggleVisibility
    })
  );
  asrSubtitlesToggle.addEventListener(
    "change",
    () => handleToggleChange({
      element: asrSubtitlesToggle,
      storageKey: "subtitlesTranslation",
      storagePath: ["subtitlesTranslation", "asrEnabled"],
      messageFeature: "asrSubtitles"
    })
  );
  youtubeDataApiToggle.addEventListener(
    "change",
    () => handleToggleChange({
      element: youtubeDataApiToggle,
      storageKey: "youtubeDataApi",
      storagePath: ["youtubeDataApi", "enabled"],
      messageFeature: "youtubeDataApi",
      uiUpdate: () => {
        if (youtubeApiKeyContainer && youtubeApiKeyContainer.style.display !== void 0) {
          youtubeApiKeyContainer.style.display = youtubeDataApiToggle.checked ? "block" : "none";
        }
      }
    })
  );
  if (devLogToggle) {
    devLogToggle.addEventListener(
      "change",
      () => handleToggleChange({
        element: devLogToggle,
        storageKey: "devLog",
        messageFeature: "devLog"
      })
    );
  }
  subtitlesLanguageSelect.addEventListener("change", async () => {
    const selectedLanguage = subtitlesLanguageSelect.value;
    updateAsrToggleVisibility();
    try {
      const data = await browser.storage.local.get("settings");
      const settings = data.settings;
      await browser.storage.local.set({
        settings: {
          ...settings,
          subtitlesTranslation: {
            ...settings.subtitlesTranslation,
            language: selectedLanguage
          }
        }
      });
      coreLog("Subtitles language saved:", selectedLanguage);
      try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id && tabs[0]?.url) {
          const isYouTubeTab = tabs[0].url.includes("youtube.com") || tabs[0].url.includes("youtube-nocookie.com");
          if (isYouTubeTab) {
            await browser.tabs.sendMessage(tabs[0].id, {
              feature: "subtitlesLanguage",
              language: selectedLanguage
            });
          }
        }
      } catch (messageError) {
        coreLog("Could not send language change message:", messageError);
      }
    } catch (error) {
      coreErrorLog("Failed to save subtitles language:", error);
    }
  });
  audioLanguageSelect.addEventListener("change", async () => {
    const selectedLanguage = audioLanguageSelect.value;
    try {
      const data = await browser.storage.local.get("settings");
      const settings = data.settings;
      await browser.storage.local.set({
        settings: {
          ...settings,
          audioTranslation: {
            ...settings.audioTranslation,
            language: selectedLanguage
          }
        }
      });
      coreLog("Audio language saved:", selectedLanguage);
      try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id && tabs[0]?.url) {
          const isYouTubeTab = tabs[0].url.includes("youtube.com") || tabs[0].url.includes("youtube-nocookie.com");
          if (isYouTubeTab) {
            await browser.tabs.sendMessage(tabs[0].id, {
              feature: "audioLanguage",
              language: selectedLanguage
            });
          }
        }
      } catch (messageError) {
        coreLog("Could not send audio language change message:", messageError);
      }
    } catch (error) {
      coreErrorLog("Failed to save audio language:", error);
    }
  });
  function adjustTooltipPositions() {
    const tooltipGroups = document.querySelectorAll(".tooltip");
    const bodyWidth = document.body.clientWidth;
    tooltipGroups.forEach((group) => {
      const tooltip = group.querySelector("span");
      if (!tooltip) return;
      tooltip.style.marginLeft = "";
      const tooltipRect = tooltip.getBoundingClientRect();
      if (tooltipRect.right > bodyWidth) {
        tooltip.style.marginLeft = `-${tooltipRect.right - bodyWidth + 20}px`;
      }
    });
  }
  adjustTooltipPositions();
  youtubeDataApiKeyInput.addEventListener("input", async () => {
    const apiKey = youtubeDataApiKeyInput.value.trim();
    try {
      const data = await browser.storage.local.get("settings");
      const settings = data.settings;
      await browser.storage.local.set({
        settings: {
          ...settings,
          youtubeDataApi: {
            ...settings.youtubeDataApi,
            apiKey
          }
        }
      });
      coreLog("YouTube Data API key saved");
    } catch (error) {
      coreErrorLog("YouTube Data API key save error:", error);
    }
  });
  clearCacheBtn.addEventListener("click", async () => {
    const originalText = clearCacheBtn.textContent;
    try {
      clearCacheBtn.disabled = true;
      clearCacheBtn.textContent = getMessage("popup_clearCache_clearing");
      await browser.storage.local.remove("ynt-cache");
      try {
        const tabs = await browser.tabs.query({
          url: ["*://*.youtube.com/*", "*://*.youtube-nocookie.com/*"]
        });
        let clearedTabs = 0;
        for (const tab of tabs) {
          if (tab.id) {
            try {
              await browser.tabs.sendMessage(tab.id, {
                action: "clearCache"
              });
              clearedTabs++;
            } catch (messageError) {
              coreLog(`Could not send clear cache message to tab ${tab.id}`);
            }
          }
        }
        clearCacheBtn.textContent = getMessage("popup_clearCache_clearedTabs", clearedTabs.toString());
        coreLog(`Cache cleared successfully. Notified ${clearedTabs} YouTube tabs.`);
      } catch (error) {
        clearCacheBtn.textContent = getMessage("popup_clearCache_cacheCleared");
        coreLog("Cache cleared from storage, but could not notify content scripts:", error);
      }
      setTimeout(() => {
        clearCacheBtn.textContent = originalText;
        clearCacheBtn.disabled = false;
      }, 2e3);
    } catch (error) {
      coreErrorLog("Failed to clear cache:", error);
      clearCacheBtn.textContent = getMessage("popup_clearCache_error");
      clearCacheBtn.disabled = false;
      setTimeout(() => {
        clearCacheBtn.textContent = originalText;
      }, 2e3);
    }
  });
  if (isWelcome) {
    const reloadBtn = document.getElementById("reloadYoutubeTabsBtn");
    if (reloadBtn) {
      if (isSafari()) {
        reloadBtn.style.display = "none";
      } else {
        reloadBtn.onclick = async () => {
          try {
            const tabs = await browser.tabs.query({
              url: [
                "*://*.youtube.com/*",
                "*://*.youtube-nocookie.com/*"
              ]
            });
            let count = 0;
            for (const tab of tabs) {
              if (tab.id && tab.discarded === false) {
                await browser.tabs.reload(tab.id);
                count++;
              }
            }
            reloadBtn.textContent = getMessage("settings_welcome_reloadButton_done", count.toString());
            reloadBtn.disabled = true;
          } catch (error) {
            reloadBtn.textContent = getMessage("settings_welcome_reloadButton_error");
            reloadBtn.disabled = true;
            coreErrorLog("Failed to reload YouTube tabs:", error);
          }
        };
      }
    }
  }
  function setExtensionName() {
    const manifest = browser.runtime.getManifest();
    document.querySelectorAll("#extensionName").forEach((el) => {
      el.textContent = manifest.name;
    });
    const titleEl = document.getElementById("extensionTitle");
    if (titleEl) {
      titleEl.textContent = manifest.name;
    }
  }
  document.addEventListener("DOMContentLoaded", setExtensionName);
})();
