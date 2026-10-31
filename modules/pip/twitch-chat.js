// Chat Twitch en lecture seule pour la fenetre PiP : IRC anonyme (justinfan)
// + emotes Twitch, 7TV, BTTV et FFZ.
// Aucun DOM de la page Twitch n'est lu : l'onglet peut etre cache (rendu gele,
// cf. memoire hidden-tab-rendering-freeze), les messages arrivent quand meme.
// Injecte a la demande par background.js, avant doc-pip.js (frame du haut).
(() => {
  if (window.__trinitxTwitchChat) return;

  const IRC_URL = "wss://irc-ws.chat.twitch.tv:443";
  const MAX_LINES = 150;
  const RETRY_MS = 3000; // double a chaque echec, plafonne a RETRY_MAX_MS
  const RETRY_MAX_MS = 60000;
  const JOIN_TIMEOUT_MS = 15000; // sans ROOMSTATE : chaine introuvable
  // API GraphQL du site Twitch, avec l'identifiant public de son client web :
  // les badges (moderateur, abonne...) n'ont plus d'URL publique sans compte.
  const GQL_URL = "https://gql.twitch.tv/gql";
  const GQL_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
  // Couleurs attribuees par Twitch aux comptes qui n'en ont pas choisi.
  const DEFAULT_COLORS = [
    "#FF0000", "#0000FF", "#008000", "#B22222", "#FF7F50",
    "#9ACD32", "#FF4500", "#2E8B57", "#DAA520", "#D2691E",
    "#5F9EA0", "#1E90FF", "#FF69B4", "#8A2BE2", "#00FF7F",
  ];

  // --- Parsing IRC -----------------------------------------------------------
  function unescapeTag(v) {
    return v.replace(/\\(.)/g, (_, c) =>
      c === "s" ? " " : c === ":" ? ";" : c === "r" ? "\r" : c === "n" ? "\n" : c,
    );
  }

  function parseLine(line) {
    const msg = { tags: {}, prefix: "", command: "", params: [], trailing: "" };
    let rest = line;
    if (rest.startsWith("@")) {
      const i = rest.indexOf(" ");
      for (const pair of rest.slice(1, i).split(";")) {
        const eq = pair.indexOf("=");
        if (eq === -1) msg.tags[pair] = "";
        else msg.tags[pair.slice(0, eq)] = unescapeTag(pair.slice(eq + 1));
      }
      rest = rest.slice(i + 1);
    }
    if (rest.startsWith(":")) {
      const i = rest.indexOf(" ");
      msg.prefix = rest.slice(1, i);
      rest = rest.slice(i + 1);
    }
    const t = rest.indexOf(" :");
    if (t !== -1) {
      msg.trailing = rest.slice(t + 2);
      rest = rest.slice(0, t);
    }
    const parts = rest.split(" ").filter(Boolean);
    msg.command = parts.shift() || "";
    msg.params = parts;
    return msg;
  }

  // --- Emotes ------------------------------------------------------------------
  // Emotes Twitch : positions en points de code (pas en unites UTF-16).
  function twitchEmoteRanges(tag) {
    const out = [];
    if (!tag) return out;
    for (const part of tag.split("/")) {
      const [id, spots] = part.split(":");
      if (!id || !spots) continue;
      for (const spot of spots.split(",")) {
        const [s, e] = spot.split("-").map(Number);
        if (Number.isInteger(s) && Number.isInteger(e)) out.push({ s, e, id });
      }
    }
    return out.sort((a, b) => a.s - b.s);
  }

  async function getJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  // Emotes tierces de la chaine + globales, nom -> URL. Ordre = priorite en cas
  // de doublon : 7TV, puis BTTV, puis FFZ.
  async function loadThirdPartyEmotes(roomId) {
    const map = new Map();
    const add = (name, url) => {
      if (name && url && !map.has(name)) map.set(name, url);
    };
    const list = (j) => (Array.isArray(j) ? j : []);
    // Images en 3x/4x : nettes sur un ecran a 300 %.
    const seventv = (emotes) =>
      list(emotes).forEach((e) => add(e.name, `https://cdn.7tv.app/emote/${e.id}/3x.webp`));
    const bttv = (emotes) =>
      list(emotes).forEach((e) => add(e.code, `https://cdn.betterttv.net/emote/${e.id}/3x.webp`));
    const ffz = (emotes) =>
      list(emotes).forEach((e) => {
        const img = e.images || {};
        add(e.code, img["4x"] || img["2x"] || img["1x"]);
      });
    const sources = [
      [`https://7tv.io/v3/users/twitch/${roomId}`, (j) => seventv(j.emote_set && j.emote_set.emotes)],
      ["https://7tv.io/v3/emote-sets/global", (j) => seventv(j.emotes)],
      [`https://api.betterttv.net/3/cached/users/twitch/${roomId}`,
        (j) => bttv([...list(j.channelEmotes), ...list(j.sharedEmotes)])],
      ["https://api.betterttv.net/3/cached/emotes/global", bttv],
      [`https://api.betterttv.net/3/cached/frankerfacez/users/twitch/${roomId}`, ffz],
      ["https://api.betterttv.net/3/cached/frankerfacez/emotes/global", ffz],
    ];
    const results = await Promise.allSettled(sources.map(([url]) => getJson(url)));
    results.forEach((r, i) => {
      if (r.status !== "fulfilled") return; // chaine sans 7TV/BTTV : 404 normal
      try {
        sources[i][1](r.value);
      } catch {
        /* format inattendu -> source ignoree */
      }
    });
    if (!map.size) console.warn("[TwitchChat] aucune emote 7TV/BTTV/FFZ chargee (API changee ?)");
    return map;
  }

  // Badges globaux + badges de la chaine (abonne, bits), "set/version" -> image.
  async function loadBadges(roomId) {
    if (!/^\d+$/.test(roomId)) return new Map();
    const fields = "setID version title imageURL(size: QUADRUPLE)";
    const query = `{ badges { ${fields} } user(id: "${roomId}") { broadcastBadges { ${fields} } } }`;
    const r = await fetch(GQL_URL, {
      method: "POST",
      headers: { "Client-Id": GQL_CLIENT_ID, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = (await r.json()).data || {};
    const map = new Map();
    const user = data.user || {};
    // Badges de la chaine en dernier : ils remplacent les globaux du meme nom.
    for (const b of [...(data.badges || []), ...(user.broadcastBadges || [])]) {
      if (b && b.setID && b.imageURL) map.set(`${b.setID}/${b.version}`, b);
    }
    return map;
  }

  // --- Rendu -------------------------------------------------------------------
  // Pseudo lisible sur fond sombre : les couleurs trop foncees sont eclaircies.
  function nameColor(hex, login) {
    let c = hex;
    if (!/^#[0-9a-f]{6}$/i.test(c || "")) {
      let h = 0;
      for (const ch of login) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      c = DEFAULT_COLORS[h % DEFAULT_COLORS.length];
    }
    const n = parseInt(c.slice(1), 16);
    const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    if (lum >= 0.4) return c;
    const mix = rgb.map((v) => Math.round(v + (255 - v) * 0.5));
    return `rgb(${mix.join(",")})`;
  }

  function emoteImg(doc, url, name) {
    const img = doc.createElement("img");
    img.className = "emote";
    img.src = url;
    img.alt = name;
    img.title = name;
    return img;
  }

  function appendWords(frag, doc, text, extra) {
    let buf = "";
    for (const w of text.split(/(\s+)/)) {
      const url = extra.get(w);
      if (!url) {
        buf += w;
        continue;
      }
      if (buf) frag.append(buf);
      buf = "";
      frag.append(emoteImg(doc, url, w));
    }
    if (buf) frag.append(buf);
  }

  function buildBody(doc, text, emotesTag, extra) {
    const frag = doc.createDocumentFragment();
    const chars = Array.from(text);
    let pos = 0;
    for (const r of twitchEmoteRanges(emotesTag)) {
      if (r.s < pos || r.e >= chars.length) continue;
      appendWords(frag, doc, chars.slice(pos, r.s).join(""), extra);
      const name = chars.slice(r.s, r.e + 1).join("");
      const url = `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(r.id)}/default/dark/3.0`;
      frag.append(emoteImg(doc, url, name));
      pos = r.e + 1;
    }
    appendWords(frag, doc, chars.slice(pos).join(""), extra);
    return frag;
  }

  // --- Connexion -----------------------------------------------------------------
  // list : element (dans le document PiP) qui recoit une ligne par message.
  function create(list, channel) {
    const doc = list.ownerDocument;
    const nick = "justinfan" + Math.floor(10000 + Math.random() * 80000);
    let ws = null;
    let stopped = false;
    let retry = null;
    let retryMs = RETRY_MS;
    let joinTimer = null;
    let extra = new Map();
    let badges = new Map();
    let roomId = null;

    const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    const scrollToEnd = () => {
      list.scrollTop = list.scrollHeight;
    };

    // Colle en bas tant que l'utilisateur n'a pas remonte lui-meme : seul son
    // defilement change `stuck`. Mesurer au moment d'un message ne suffit
    // pas : un redimensionnement de la fenetre ou une emote qui finit de
    // charger laissait la liste a mi-hauteur, et le chat « remontait »
    // (Alexis, 31/10/2026).
    let stuck = true;
    const onScroll = () => {
      stuck = nearBottom();
    };
    list.addEventListener("scroll", onScroll);
    const keepAtEnd = () => {
      if (stuck) scrollToEnd();
    };
    // Observateur de la fenetre PiP : celui de l'onglet ouvreur ne tourne plus
    // quand l'onglet est cache (pas de rendu).
    const resizeObserver = new doc.defaultView.ResizeObserver(keepAtEnd);
    resizeObserver.observe(list);
    // Emote ou badge charge apres coup : la ligne grandit. `load` ne remonte
    // pas, on l'ecoute en phase de capture.
    list.addEventListener("load", keepAtEnd, true);

    function push(line) {
      list.append(line);
      while (list.childElementCount > MAX_LINES) list.firstElementChild.remove();
      keepAtEnd();
    }

    function system(text) {
      const line = doc.createElement("div");
      line.className = "line sys";
      line.textContent = text;
      push(line);
    }

    // Reponse a un autre message : comme le chat officiel, une ligne grise
    // au-dessus avec l'auteur et le texte d'origine (tags reply-parent-* de
    // l'IRC). Le texte de la reponse reste tel quel : les positions de ses
    // emotes Twitch en dependent.
    function replyHeader(tags) {
      const parent = tags["reply-parent-display-name"] || tags["reply-parent-user-login"];
      if (!parent) return null;
      const header = doc.createElement("div");
      header.className = "reply";
      const NS = "http://www.w3.org/2000/svg";
      const svg = doc.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      for (const [tag, attrs] of [
        ["polyline", { points: "9 17 4 12 9 7" }],
        ["path", { d: "M20 18v-2a4 4 0 0 0-4-4H4" }],
      ]) {
        const node = doc.createElementNS(NS, tag);
        for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
        svg.append(node);
      }
      const label = doc.createElement("span");
      label.textContent = `Réponse à @${parent} : ${tags["reply-parent-msg-body"] || ""}`;
      header.append(svg, label);
      return header;
    }

    function addMessage(m) {
      const login = (m.prefix.split("!")[0] || "").toLowerCase();
      let text = m.trailing;
      const action = /^\u0001ACTION (.*)\u0001$/.exec(text);
      if (action) text = action[1];
      const color = nameColor(m.tags.color, login);
      const line = doc.createElement("div");
      line.className = action ? "line action" : "line";
      if (m.tags.id) line.dataset.id = m.tags.id;
      line.dataset.user = login;
      const name = doc.createElement("b");
      name.textContent = m.tags["display-name"] || login;
      name.style.color = color;
      const body = doc.createElement("span");
      if (action) body.style.color = color;
      body.append(buildBody(doc, text, m.tags.emotes, extra));
      const reply = replyHeader(m.tags);
      if (reply) line.append(reply);
      for (const id of (m.tags.badges || "").split(",")) {
        const b = id && badges.get(id);
        if (!b) continue;
        const img = doc.createElement("img");
        img.className = "badge";
        img.src = b.imageURL;
        img.alt = img.title = b.title || id;
        line.append(img);
      }
      line.append(name, action ? " " : ": ", body);
      push(line);
    }

    function handle(m) {
      switch (m.command) {
        case "PING":
          ws.send("PONG :" + m.trailing);
          break;
        case "RECONNECT":
          ws.close();
          break;
        case "ROOMSTATE": {
          const id = m.tags["room-id"];
          clearTimeout(joinTimer);
          retryMs = RETRY_MS; // connexion reussie : delai de reconnexion remis a zero
          if (!id || id === roomId) break;
          if (!roomId) system(`Chat de ${channel}`);
          roomId = id;
          loadThirdPartyEmotes(id).then((map) => {
            if (!stopped && roomId === id) extra = map;
          });
          loadBadges(id)
            .then((map) => {
              if (!stopped && roomId === id) badges = map;
            })
            .catch((e) => console.warn("[TwitchChat] badges indisponibles:", e.message));
          break;
        }
        case "PRIVMSG":
          addMessage(m);
          break;
        case "CLEARMSG": {
          const id = m.tags["target-msg-id"];
          if (id) list.querySelectorAll(`[data-id="${CSS.escape(id)}"]`).forEach((n) => n.remove());
          break;
        }
        case "CLEARCHAT":
          if (m.trailing) {
            const sel = `[data-user="${CSS.escape(m.trailing.toLowerCase())}"]`;
            list.querySelectorAll(sel).forEach((n) => n.remove());
          } else {
            list.textContent = "";
          }
          break;
      }
    }

    function connect() {
      if (stopped) return;
      ws = new WebSocket(IRC_URL);
      ws.onopen = () => {
        ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
        ws.send("PASS SCHMOOPIIE");
        ws.send("NICK " + nick);
        ws.send("JOIN #" + channel);
      };
      ws.onmessage = (e) => {
        for (const raw of String(e.data).split("\r\n")) {
          if (raw) handle(parseLine(raw));
        }
      };
      ws.onclose = (e) => {
        ws = null;
        if (stopped) return;
        console.warn(`[TwitchChat] IRC ferme (code ${e.code}), reconnexion dans ${retryMs / 1000} s`);
        retry = setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
      };
    }

    connect();
    joinTimer = setTimeout(() => {
      if (roomId || stopped) return;
      console.warn("[TwitchChat] pas de reponse au JOIN de", channel);
      system(`Chat de ${channel} introuvable.`);
    }, JOIN_TIMEOUT_MS);
    return {
      scrollToEnd,
      stop() {
        stopped = true;
        clearTimeout(retry);
        clearTimeout(joinTimer);
        if (ws) ws.close();
        list.removeEventListener("scroll", onScroll);
        list.removeEventListener("load", keepAtEnd, true);
        resizeObserver.disconnect();
      },
    };
  }

  window.__trinitxTwitchChat = { create };
})();
