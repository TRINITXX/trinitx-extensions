"use strict";
(() => {
  // src/content/subtitles/subtitlesScript.js
  (() => {
    const LOG_PREFIX = "[YNT]";
    const LOG_CONTEXT = "[SUBTITLES]";
    const LOG_COLOR = "#FF9800";
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
    function getBaseLanguageCode(languageCode) {
      return languageCode ? languageCode.split("-")[0] : "";
    }
    function languageCodesMatch(code1, code2) {
      return getBaseLanguageCode(code1) === getBaseLanguageCode(code2);
    }
    let retryCount = 0;
    const MAX_RETRIES = 5;
    function setPreferredSubtitles() {
      let targetId = "movie_player";
      if (window.location.pathname.startsWith("/shorts")) {
        targetId = "shorts-player";
      } else if (window.location.pathname.startsWith("/@")) {
        targetId = "c4-player";
      }
      const player = document.getElementById(targetId);
      if (!player) return false;
      try {
        const subtitlesLanguage = localStorage.getItem("ynt-subtitlesLanguage") || "original";
        const asrEnabled = localStorage.getItem("ynt-subtitlesAsrEnabled") === "true";
        const currentTrack = player.getOption("captions", "track");
        if (subtitlesLanguage === "disabled") {
          if (!currentTrack || !currentTrack.languageCode) {
            log("Subtitles are already disabled");
            return true;
          }
          log("Subtitles are disabled, disabling subtitles");
          player.setOption("captions", "track", {});
          return true;
        }
        const response = player.getPlayerResponse();
        const captionTracks = response.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (!captionTracks) {
          throw new Error("Caption tracks not available");
        }
        if (subtitlesLanguage === "original") {
          const asrTrack2 = captionTracks.find((track) => track.kind === "asr");
          if (!asrTrack2) {
            if (captionTracks.length === 1) {
              const singleTrack = captionTracks[0];
              if (currentTrack && languageCodesMatch(currentTrack.languageCode, singleTrack.languageCode) && !currentTrack.kind && !currentTrack.translationLanguage) {
                log(`Subtitles already set to original (manual): "${singleTrack.name.simpleText}" [${singleTrack.languageCode}]`);
                return true;
              }
              log(`Only subtitle track found is manual, assuming it's original: "${singleTrack.name.simpleText}" [${singleTrack.languageCode}]`);
              player.setOption("captions", "track", singleTrack);
              return true;
            }
            log("Cannot determine original language, disabling subtitles");
            player.setOption("captions", "track", {});
            return true;
          }
          const originalTrack = captionTracks.find(
            (track) => languageCodesMatch(track.languageCode, asrTrack2.languageCode) && !track.kind
          );
          if (originalTrack) {
            if (currentTrack && languageCodesMatch(currentTrack.languageCode, originalTrack.languageCode) && !currentTrack.kind && !currentTrack.translationLanguage) {
              log(`Subtitles already set to original language (manual): "${originalTrack.name.simpleText}" [${originalTrack.languageCode}]`);
              return true;
            }
            log(`Setting subtitles to original language (manual): "${originalTrack.name.simpleText}" [${originalTrack.languageCode}]`);
            player.setOption("captions", "track", originalTrack);
            return true;
          }
          if (!asrEnabled) {
            log("No manual track in original language, disabling subtitles (ASR disabled)");
            player.setOption("captions", "track", {});
            return true;
          }
          if (currentTrack && languageCodesMatch(currentTrack.languageCode, asrTrack2.languageCode) && currentTrack.kind === "asr") {
            log(`Subtitles already set to ASR: "${asrTrack2.name.simpleText}"`);
            return true;
          }
          log(`No manual track, using ASR: "${asrTrack2.name.simpleText}"`);
          player.setOption("captions", "track", asrTrack2);
          return true;
        }
        const languageTrack = captionTracks.find(
          (track) => languageCodesMatch(track.languageCode, subtitlesLanguage) && !track.kind
        );
        if (languageTrack) {
          if (currentTrack && languageCodesMatch(currentTrack.languageCode, subtitlesLanguage) && !currentTrack.kind && !currentTrack.translationLanguage) {
            log(`Subtitles already set to selected language: "${languageTrack.name.simpleText}" [${languageTrack.languageCode}]`);
            return true;
          }
          log(`Setting subtitles to selected language: "${languageTrack.name.simpleText}" [${languageTrack.languageCode}]`);
          player.setOption("captions", "track", languageTrack);
          return true;
        }
        if (!asrEnabled) {
          log(`Selected language "${subtitlesLanguage}" not available, disabling subtitles (ASR disabled)`);
          player.setOption("captions", "track", {});
          return true;
        }
        const asrTrack = captionTracks.find((track) => track.kind === "asr");
        if (!asrTrack) {
          log(`Selected language "${subtitlesLanguage}" not available and no ASR track found, disabling subtitles`);
          player.setOption("captions", "track", {});
          return true;
        }
        if (languageCodesMatch(asrTrack.languageCode, subtitlesLanguage)) {
          if (currentTrack && languageCodesMatch(currentTrack.languageCode, subtitlesLanguage) && currentTrack.kind === "asr") {
            log(`Subtitles already set to ASR track in target language: "${asrTrack.name.simpleText}"`);
            return true;
          }
          log(`Using ASR track in target language: "${asrTrack.name.simpleText}"`);
          player.setOption("captions", "track", asrTrack);
          return true;
        }
        log(`Attempting ASR translation from "${asrTrack.languageCode}" to "${subtitlesLanguage}"`);
        if (currentTrack && currentTrack.kind === "asr" && currentTrack.translationLanguage && languageCodesMatch(currentTrack.translationLanguage.languageCode, subtitlesLanguage)) {
          log(`Subtitles already set to translated ASR track: "${asrTrack.name.simpleText}" translated to "${subtitlesLanguage}"`);
          return true;
        }
        const translatedTrack = {
          ...asrTrack,
          translationLanguage: {
            languageCode: subtitlesLanguage,
            languageName: subtitlesLanguage
          }
        };
        player.setOption("captions", "track", translatedTrack);
        return true;
      } catch (error) {
        if (error.message !== "Caption tracks not available") {
          errorLog(`Error in setPreferredSubtitles: ${error.name}: ${error.message}`);
        }
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          const delay = 200 * retryCount;
          setTimeout(() => {
            setPreferredSubtitles();
          }, delay);
        } else {
          errorLog(`Failed after ${MAX_RETRIES} retries`);
          retryCount = 0;
        }
        return false;
      }
    }
    setPreferredSubtitles();
  })();
})();
