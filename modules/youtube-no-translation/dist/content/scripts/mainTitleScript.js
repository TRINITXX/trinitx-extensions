"use strict";
(() => {
  // src/content/titles/mainTitleScript.js
  (() => {
    const LOG_PREFIX = "[YNT]";
    const LOG_CONTEXT = "[MAIN TITLE]";
    const LOG_COLOR = "#fcd34d";
    const ERROR_COLOR = "#F44336";
    function isDevLogEnabled() {
      return localStorage.getItem("ynt-devLog") === "true";
    }
    function log(message, ...args) {
      if (!isDevLogEnabled()) return;
      console.log(
        `%c${LOG_PREFIX}${LOG_CONTEXT} ${message}`,
        `color: ${LOG_COLOR}`,
        ...args
      );
    }
    function errorLog(message, ...args) {
      if (!isDevLogEnabled()) return;
      console.log(
        `%c${LOG_PREFIX}${LOG_CONTEXT} %c${message}`,
        `color: ${LOG_COLOR}`,
        // Keep context color for prefix
        `color: ${ERROR_COLOR}`,
        ...args
      );
    }
    function getOriginalTitle() {
      let targetId = "movie_player";
      if (window.location.pathname.startsWith("/shorts")) {
        targetId = "shorts-player";
      } else if (window.location.pathname.startsWith("/@")) {
        targetId = "c4-player";
      }
      const player = document.getElementById(targetId);
      if (!player) {
        log("Player not found");
        window.dispatchEvent(new CustomEvent("ynt-title-data", {
          detail: { title: null }
        }));
        return;
      }
      try {
        const response = player.getPlayerResponse();
        const title = response?.videoDetails?.title;
        if (title) {
          window.dispatchEvent(new CustomEvent("ynt-title-data", {
            detail: { title }
          }));
        } else {
          log("No title found in player response");
          window.dispatchEvent(new CustomEvent("ynt-title-data", {
            detail: { title: null }
          }));
        }
      } catch (error) {
        errorLog(`${error.name}: ${error.message}`);
        window.dispatchEvent(new CustomEvent("ynt-title-data", {
          detail: { title: null }
        }));
      }
    }
    getOriginalTitle();
  })();
})();
