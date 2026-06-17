"use strict";
(() => {
  // src/content/scripts/getChannelIdScript.js
  (() => {
    const scriptTag = document.currentScript;
    let handle = scriptTag && scriptTag.getAttribute("data-channel-handle");
    if (!handle) {
      window.dispatchEvent(new CustomEvent("ynt-get-channel-id-inner-tube", {
        detail: { channelId: null, error: "No channel handle provided" }
      }));
      return;
    }
    handle = decodeURIComponent(handle);
    const clientVersion = window?.yt?.config_?.INNERTUBE_CLIENT_VERSION || "2.20250527.00.00";
    fetch("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: { client: { clientName: "WEB", clientVersion } },
        query: "@" + handle,
        /**
         * 'params' is a base64-encoded protobuf filter.
         * 'EgIQAg==' means "filter=channels" (only return channels in search results).
         */
        params: "EgIQAg=="
      })
    }).then((res) => res.ok ? res.json() : null).then((data) => {
      const items = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
      const channels = items?.flatMap((c) => c.itemSectionRenderer?.contents || []).filter((el) => el.channelRenderer).map((el) => el.channelRenderer) || [];
      const originalEncodedHandle = scriptTag.getAttribute("data-channel-handle");
      const exactMatch = channels.find((ch) => {
        const url = ch.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl || "";
        return url === `/@${originalEncodedHandle}`;
      });
      const channelId = exactMatch?.channelId || null;
      window.dispatchEvent(new CustomEvent("ynt-get-channel-id-inner-tube", {
        detail: { channelId }
      }));
    }).catch((error) => {
      window.dispatchEvent(new CustomEvent("ynt-get-channel-id-inner-tube", {
        detail: { channelId: null, error: error?.message || String(error) }
      }));
    });
  })();
})();
