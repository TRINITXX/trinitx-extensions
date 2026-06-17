"use strict";
(() => {
  // src/content/titles/getIdFromMiniPlayer.js
  (() => {
    const LOG_PREFIX = "[YNT]";
    const LOG_CONTEXT = "[MINIPLAYER ID]";
    const LOG_COLOR = "#9C27B0";
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
    function getVideoIdFromMiniplayer() {
      const idPattern = /^[A-Za-z0-9_-]{11}$/;
      let videoId = null;
      let method = "none";
      try {
        const moviePlayer = document.getElementById("movie_player");
        if (moviePlayer && typeof moviePlayer.getVideoData === "function") {
          const data = moviePlayer.getVideoData();
          const candidate = data && (data.video_id || data.videoId || data.id) ? data.video_id || data.videoId || data.id : null;
          if (candidate && idPattern.test(candidate)) {
            videoId = candidate;
            method = "movie_player.getVideoData";
          }
        }
        if (!videoId) {
          const miniplayerContainer = document.querySelector("ytd-miniplayer");
          if (miniplayerContainer) {
            const attachedPlayer = miniplayerContainer.player_ || miniplayerContainer.player || miniplayerContainer.playerApi;
            if (attachedPlayer && typeof attachedPlayer.getVideoData === "function") {
              const data = attachedPlayer.getVideoData();
              const candidate = data && (data.video_id || data.videoId || data.id) ? data.video_id || data.videoId || data.id : null;
              if (candidate && idPattern.test(candidate)) {
                videoId = candidate;
                method = "miniplayer.attachedPlayer.getVideoData";
              }
            }
          }
        }
        if (!videoId) {
          const miniplayerContainer = document.querySelector("ytd-miniplayer");
          if (miniplayerContainer) {
            const elements = [miniplayerContainer, ...Array.from(miniplayerContainer.querySelectorAll("*"))].slice(0, 200);
            for (const el of elements) {
              try {
                if (typeof el.getVideoData === "function") {
                  const data = el.getVideoData();
                  const candidate = data && (data.video_id || data.videoId || data.id) ? data.video_id || data.videoId || data.id : null;
                  if (candidate && idPattern.test(candidate)) {
                    videoId = candidate;
                    method = "element.getVideoData";
                    break;
                  }
                }
              } catch (e) {
              }
            }
          }
        }
        if (!videoId) {
          errorLog("No video ID found from player APIs");
        }
      } catch (error) {
        errorLog("Error getting video ID from miniplayer:", error);
      }
      window.dispatchEvent(new CustomEvent("ynt-miniplayer-id", {
        detail: { videoId, method }
      }));
      document.currentScript?.remove();
    }
    getVideoIdFromMiniplayer();
  })();
})();
