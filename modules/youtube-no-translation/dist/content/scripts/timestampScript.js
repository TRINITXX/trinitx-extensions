"use strict";
(() => {
  // src/content/description/timestampScript.js
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
        // Keep context color for prefix
        `color: ${ERROR_COLOR}`,
        ...args
      );
    }
    const timestampEvent = document.currentScript.getAttribute("ynt-timestamp-event");
    if (!timestampEvent) {
      errorLog("No timestamp event found");
      return;
    }
    const timestampData = JSON.parse(timestampEvent);
    const seconds = parseInt(timestampData.seconds, 10);
    const player = document.getElementById("movie_player");
    if (!player) {
      log("Player element not found");
      return;
    }
    try {
      player.seekTo(seconds, true);
      log(`Navigated to timestamp: ${seconds}s`);
    } catch (error) {
      errorLog(`Failed to navigate to timestamp: ${error}`);
    }
  })();
})();
