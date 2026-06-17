// Module : X Auto Sort by Likes
// Force le tri des reponses X.com (Twitter) par nombre de likes.
// S'execute dans le monde MAIN (au document_start) UNIQUEMENT quand le module
// est active (enregistrement dynamique gere par le service worker).
//
// 1. Requete : on force `rankingMode=Likes` sur l'appel GraphQL /TweetDetail,
//    ce qui trie les reponses par nombre de likes.
// 2. Reponse : forcer ce mode a un effet de bord cote serveur — il INVERSE
//    l'ordre chronologique des tweets ANCETRES affiches au-dessus du tweet
//    focalise (la conversation parente). On reecrit donc la reponse pour
//    restaurer l'ordre chronologique de la chaine de conversation, sans
//    toucher aux modules de reponses (qui doivent rester tries par likes).
(function () {
  "use strict";

  // --- Modification de la requete : force rankingMode=Likes ----------------
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

      return `${urlObj.origin}${urlObj.pathname}?${params.toString()}`;
    } catch (e) {
      return null;
    }
  }

  // --- Correction de la reponse : restaure l'ordre chrono des ancetres ------
  // La chaine de conversation (tweet focal + ses ancetres) est constituee des
  // entrees "tweet-<id>" de type TimelineTimelineItem. Les ids X (Snowflake)
  // sont ordonnes dans le temps : on trie donc ces entrees par id croissant
  // (= chronologique) puis on leur reattribue les sortIndex existants en ordre
  // decroissant (le plus ancien recoit le plus grand sortIndex, donc s'affiche
  // en haut). Les reponses (modules "conversationthread-<id>") ne sont pas
  // touchees : elles restent triees par likes.
  // Renvoie true si l'ordre a effectivement change (donc reponse a reecrire).
  function reorderConversationAncestors(data) {
    try {
      const conv =
        data && data.data && data.data.threaded_conversation_with_injections_v2;
      const instructions = conv && conv.instructions;
      if (!Array.isArray(instructions)) return false;

      let changed = false;
      for (const instr of instructions) {
        if (!instr || instr.type !== "TimelineAddEntries") continue;
        const entries = instr.entries;
        if (!Array.isArray(entries)) continue;

        // Repere les entrees de la chaine de conversation (ancetres + focal).
        const chain = [];
        entries.forEach((entry, idx) => {
          if (!entry || typeof entry.entryId !== "string") return;
          const match = entry.entryId.match(/^tweet-(\d+)$/);
          if (!match) return;
          const content = entry.content || {};
          if (content.entryType !== "TimelineTimelineItem") return;
          const itemContent = content.itemContent;
          if (
            !itemContent ||
            itemContent.itemType !== "TimelineTweet" ||
            itemContent.promotedMetadata
          ) {
            return;
          }
          chain.push({ idx, entry, id: BigInt(match[1]) });
        });

        if (chain.length < 2) continue;

        // Emplacements d'origine (dans l'ordre du document) et pool de sortIndex.
        const slots = chain.map((c) => c.idx);
        const sortPool = chain
          .map((c) => c.entry.sortIndex)
          .sort((a, b) =>
            BigInt(a) < BigInt(b) ? 1 : BigInt(a) > BigInt(b) ? -1 : 0,
          );
        const chronological = chain
          .slice()
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

        const orderChanged = chronological.some((c, k) => c.idx !== slots[k]);
        chronological.forEach((c, k) => {
          c.entry.sortIndex = sortPool[k];
          entries[slots[k]] = c.entry;
        });
        if (orderChanged) changed = true;
      }
      return changed;
    } catch (e) {
      return false;
    }
  }

  function isTweetDetailUrl(url) {
    return typeof url === "string" && url.includes("/TweetDetail");
  }

  // --- Interception fetch --------------------------------------------------
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const [resource] = args;
    const url =
      typeof resource === "string" ? resource : resource && resource.url;
    if (!isTweetDetailUrl(url)) {
      return originalFetch.apply(this, arguments);
    }
    const newUrl = forceLikesRanking(url);
    if (newUrl) {
      arguments[0] =
        typeof resource === "string" ? newUrl : new Request(newUrl, resource);
    }
    return originalFetch.apply(this, arguments).then(rewriteFetchResponse);
  };

  function rewriteFetchResponse(response) {
    if (!response || !response.ok) return response;
    return response
      .clone()
      .text()
      .then((text) => {
        try {
          const data = JSON.parse(text);
          if (reorderConversationAncestors(data)) {
            const headers = new Headers(response.headers);
            headers.delete("content-length");
            headers.delete("content-encoding");
            return new Response(JSON.stringify(data), {
              status: response.status,
              statusText: response.statusText,
              headers,
            });
          }
        } catch (e) {
          /* reponse non-JSON ou inattendue : on laisse passer tel quel */
        }
        return response;
      })
      .catch(() => response);
  }

  // --- Interception XHR ----------------------------------------------------
  // X.com utilise XHR (et non fetch) pour /TweetDetail. On modifie l'URL a
  // l'ouverture, puis on reecrit la reponse via des getters "shadow" poses sur
  // l'instance : ils transforment le corps paresseusement au premier acces, ce
  // qui evite tout probleme d'ordre des handlers (notre code s'execute quand la
  // page lit responseText/response, donc apres reception complete).
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  const textDescriptor = Object.getOwnPropertyDescriptor(
    XMLHttpRequest.prototype,
    "responseText",
  );
  const responseDescriptor = Object.getOwnPropertyDescriptor(
    XMLHttpRequest.prototype,
    "response",
  );

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (isTweetDetailUrl(url)) {
      const newUrl = forceLikesRanking(url);
      if (newUrl) url = newUrl;
      this.__xSortTweetDetail = true;
    }
    return originalXHROpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    if (this.__xSortTweetDetail) installXHRResponseRewrite(this);
    return originalXHRSend.apply(this, args);
  };

  function installXHRResponseRewrite(xhr) {
    if (!textDescriptor || !textDescriptor.get) return;
    let cache;

    function rawText() {
      try {
        return textDescriptor.get.call(xhr);
      } catch (e) {
        return null;
      }
    }

    function modifiedText() {
      if (cache !== undefined) return cache;
      const raw = rawText();
      if (typeof raw !== "string" || raw.length === 0) return raw;
      let out = raw;
      try {
        const data = JSON.parse(raw);
        if (reorderConversationAncestors(data)) out = JSON.stringify(data);
      } catch (e) {
        /* reponse non-JSON : on laisse passer tel quel */
      }
      cache = out;
      return out;
    }

    Object.defineProperty(xhr, "responseText", {
      configurable: true,
      get() {
        return xhr.readyState !== 4 ? rawText() : modifiedText();
      },
    });

    if (responseDescriptor && responseDescriptor.get) {
      Object.defineProperty(xhr, "response", {
        configurable: true,
        get() {
          const type = xhr.responseType;
          // Seul le type texte ("" ou "text") expose le corps via responseText.
          if (type && type !== "text") return responseDescriptor.get.call(xhr);
          return xhr.readyState !== 4
            ? responseDescriptor.get.call(xhr)
            : modifiedText();
        },
      });
    }
  }
})();
