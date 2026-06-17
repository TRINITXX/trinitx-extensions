"use strict";
(() => {
  // src/content/description/MainDescriptionScript.js
  (() => {
    const LOG_PREFIX = "[YNT]";
    const LOG_CONTEXT = "[DESCRIPTION]";
    const LOG_COLOR = "#2196F3";
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
        `color: ${ERROR_COLOR}`,
        ...args
      );
    }
    function getTargetPlayerId() {
      if (window.location.pathname.startsWith("/shorts")) return "shorts-player";
      if (window.location.pathname.startsWith("/@")) return "c4-player";
      return "movie_player";
    }
    function fetchDescriptionWithRetry(player2, maxAttempts = 10, delayMs = 300) {
      let attempt = 0;
      function tryFetch() {
        const response = player2.getPlayerResponse();
        const description = response?.videoDetails?.shortDescription;
        if (description) {
          window.dispatchEvent(new CustomEvent("ynt-description-data", {
            detail: { description }
          }));
        } else if (attempt < maxAttempts) {
          attempt++;
          setTimeout(tryFetch, delayMs);
        } else {
          errorLog("No description found in player response after retries");
          window.dispatchEvent(new CustomEvent("ynt-description-data", {
            detail: { description: null }
          }));
        }
      }
      tryFetch();
    }
    const targetId = getTargetPlayerId();
    const player = document.getElementById(targetId);
    if (!player) {
      log("Player not found");
      window.dispatchEvent(new CustomEvent("ynt-title-data", {
        detail: { title: null }
      }));
      return;
    }
    fetchDescriptionWithRetry(player);
  })();
})();
