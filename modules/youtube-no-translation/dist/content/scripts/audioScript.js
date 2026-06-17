"use strict";
(() => {
  // src/content/audio/audioScript.js
  (() => {
    const LOG_PREFIX = "[YNT]";
    const LOG_CONTEXT = "[AUDIO]";
    const LOG_COLOR = "#4CAF50";
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
    let retryCount = 0;
    const MAX_RETRIES = 5;
    function setPreferredTrack() {
      let targetId = "movie_player";
      if (window.location.pathname.startsWith("/shorts")) {
        targetId = "shorts-player";
      } else if (window.location.pathname.startsWith("/@")) {
        targetId = "c4-player";
      }
      const player = document.getElementById(targetId);
      if (!player) return false;
      try {
        const audioLanguage = localStorage.getItem("ynt-audioLanguage") || "original";
        const tracks = player.getAvailableAudioTracks();
        if (tracks.length <= 1) {
          log("Only one audio track available, no change needed");
          return true;
        }
        const currentTrack = player.getAudioTrack();
        if (currentTrack) {
          const base64Part = currentTrack.id.split(";")[1];
          const decoded = atob(base64Part);
          if (audioLanguage === "original") {
            if (decoded.includes("original")) {
              log("Audio track is already original");
              return true;
            }
          } else {
            const langMatch = decoded.match(/lang..([-a-zA-Z]+)/);
            const trackLangCode = langMatch ? langMatch[1].split("-")[0] : null;
            if (trackLangCode === audioLanguage) {
              log("Audio already in preferred language");
              return true;
            }
          }
        }
        if (audioLanguage === "original") {
          const originalTrack = tracks.find((track) => {
            const base64Part = track.id.split(";")[1];
            const decoded = atob(base64Part);
            return decoded.includes("original");
          });
          if (originalTrack) {
            const base64Part = originalTrack.id.split(";")[1];
            const decoded = atob(base64Part);
            const langMatch = decoded.match(/lang..([-a-zA-Z]+)/);
            const langCode = langMatch ? langMatch[1].split("-")[0] : "unknown";
            log("Setting audio to original language: " + langCode);
            player.setAudioTrack(originalTrack);
            return true;
          }
        } else {
          const preferredTrack = tracks.find((track) => {
            const base64Part = track.id.split(";")[1];
            const decoded = atob(base64Part);
            const langMatch = decoded.match(/lang..([-a-zA-Z]+)/);
            if (!langMatch) return false;
            const trackLangCode = langMatch[1].split("-")[0];
            return trackLangCode === audioLanguage;
          });
          if (preferredTrack) {
            log("Setting audio to preferred language: " + audioLanguage);
            player.setAudioTrack(preferredTrack);
            return true;
          }
          log(`Selected language "${audioLanguage}" not available`);
        }
        return false;
      } catch (error) {
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          const delay = 50 * retryCount;
          setTimeout(() => {
            setPreferredTrack();
          }, delay);
        } else {
          retryCount = 0;
        }
        return false;
      }
    }
    setPreferredTrack();
  })();
})();
