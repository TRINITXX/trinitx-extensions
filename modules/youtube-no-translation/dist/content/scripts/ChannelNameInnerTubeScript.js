"use strict";
(() => {
  // src/content/channel/ChannelNameInnerTubeScript.js
  (function() {
    var scriptTag = document.currentScript;
    var channelId = scriptTag && scriptTag.getAttribute("data-channel-id");
    if (!channelId) {
      window.dispatchEvent(new CustomEvent("ynt-get-channel-name-inner-tube", {
        detail: { channelName: null, error: "No channelId provided" }
      }));
      return;
    }
    function getInnerTubeClientVersion() {
      return window.yt && window.yt.config_ && window.yt.config_.INNERTUBE_CLIENT_VERSION || null;
    }
    var clientVersion = getInnerTubeClientVersion();
    if (!clientVersion) {
      window.dispatchEvent(new CustomEvent("ynt-get-channel-name-inner-tube", {
        detail: { channelName: null, error: "Could not retrieve InnerTube client version." }
      }));
      return;
    }
    var body = {
      context: {
        client: {
          clientName: "WEB",
          clientVersion,
          hl: "lo"
          // Lao, extremely unlikely to be translated
        }
      },
      browseId: channelId
    };
    fetch("https://www.youtube.com/youtubei/v1/browse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function(res) {
      return res.ok ? res.json() : null;
    }).then(function(json) {
      var channelName = json && json.metadata && json.metadata.channelMetadataRenderer && json.metadata.channelMetadataRenderer.title || null;
      window.dispatchEvent(new CustomEvent("ynt-get-channel-name-inner-tube", {
        detail: { channelName }
      }));
    }).catch(function(error) {
      window.dispatchEvent(new CustomEvent("ynt-get-channel-name-inner-tube", {
        detail: { channelName: null, error: error && error.message || String(error) }
      }));
    });
  })();
})();
