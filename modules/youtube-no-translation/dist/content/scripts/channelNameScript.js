"use strict";
(() => {
  // src/content/channel/channelNameScript.js
  (() => {
    const LOG_PREFIX = "[YNT]";
    const LOG_CONTEXT = "[CHANNEL NAME]";
    const LOG_COLOR = "#06b6d4";
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
    function getOriginalChannelName() {
      let targetId = "movie_player";
      if (window.location.pathname.startsWith("/shorts")) {
        targetId = "shorts-player";
      }
      const player = document.getElementById(targetId);
      if (!player) {
        log("Player not found");
        window.dispatchEvent(new CustomEvent("ynt-channel-data", {
          detail: { channelName: null }
        }));
        return;
      }
      try {
        const response = player.getPlayerResponse();
        const channelName = response?.microformat?.playerMicroformatRenderer?.ownerChannelName;
        if (channelName) {
          window.dispatchEvent(new CustomEvent("ynt-channel-data", {
            detail: { channelName }
          }));
        } else {
          log("No channel name found in player response");
          window.dispatchEvent(new CustomEvent("ynt-channel-data", {
            detail: { channelName: null }
          }));
        }
      } catch (error) {
        errorLog(`${error.name}: ${error.message}`);
        window.dispatchEvent(new CustomEvent("ynt-channel-data", {
          detail: { channelName: null }
        }));
      }
    }
    getOriginalChannelName();
  })();
})();
