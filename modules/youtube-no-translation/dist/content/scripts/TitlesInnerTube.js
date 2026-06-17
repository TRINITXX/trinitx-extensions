"use strict";
(() => {
  // src/content/titles/TitlesInnerTube.js
  (() => {
    const scriptTag = document.currentScript;
    const videoId = scriptTag?.getAttribute("data-video-id");
    if (!videoId) {
      window.dispatchEvent(new CustomEvent("ynt-browsing-title-inner-tube-data", {
        detail: { videoId: null, title: null, error: "No videoId provided" }
      }));
      return;
    }
    const clientVersion = window.yt?.config_?.INNERTUBE_CLIENT_VERSION;
    if (!clientVersion) {
      window.dispatchEvent(new CustomEvent("ynt-browsing-title-inner-tube-data", {
        detail: { videoId, title: null, error: "INNERTUBE_CLIENT_VERSION not found" }
      }));
      return;
    }
    fetch("https://www.youtube.com/youtubei/v1/player", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            clientName: "WEB",
            clientVersion
          }
        }
      })
    }).then((response) => response.ok ? response.json() : null).then((data) => {
      const title = data?.videoDetails?.title || null;
      window.dispatchEvent(new CustomEvent("ynt-browsing-title-inner-tube-data", {
        detail: { videoId, title }
      }));
    }).catch((error) => {
      window.dispatchEvent(new CustomEvent("ynt-browsing-title-inner-tube-data", {
        detail: { videoId, title: null, error: error?.message || String(error) }
      }));
    });
  })();
})();
