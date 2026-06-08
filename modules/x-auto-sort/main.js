// Module : X Auto Sort by Likes
// Force le tri des reponses X.com (Twitter) par nombre de likes.
// S'execute dans le monde MAIN (au document_start) UNIQUEMENT quand le module
// est active (enregistrement dynamique gere par le service worker).
(function () {
  "use strict";

  const interceptedTweets = new Set();

  function forceLikesRanking(url) {
    // Renvoie l'URL modifiee (rankingMode=Likes) ou null si rien a changer.
    try {
      const urlObj = new URL(url, window.location.origin);
      const params = new URLSearchParams(urlObj.search);
      if (!params.has("variables")) return null;

      let variablesStr = params.get("variables");
      let variables;
      try {
        variables = JSON.parse(variablesStr);
      } catch (e) {
        variablesStr = decodeURIComponent(variablesStr);
        variables = JSON.parse(variablesStr);
      }

      if (variables.rankingMode === "Likes") return null;

      variables.rankingMode = "Likes";
      params.set("variables", JSON.stringify(variables));
      if (variables.focalTweetId) interceptedTweets.add(variables.focalTweetId);

      return `${urlObj.origin}${urlObj.pathname}?${params.toString()}`;
    } catch (e) {
      return null;
    }
  }

  // Intercepte fetch
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const [resource] = args;
    const url =
      typeof resource === "string" ? resource : resource && resource.url;
    if (url && url.includes("/TweetDetail")) {
      const newUrl = forceLikesRanking(url);
      if (newUrl) {
        arguments[0] =
          typeof resource === "string" ? newUrl : new Request(newUrl, resource);
      }
    }
    return originalFetch.apply(this, arguments);
  };

  // Intercepte XHR
  const originalXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (url && url.includes("/TweetDetail")) {
      const newUrl = forceLikesRanking(url);
      if (newUrl) url = newUrl;
    }
    return originalXHROpen.call(this, method, url, ...rest);
  };
})();
