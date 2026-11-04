// Chat Twitch en lecture seule pour la fenetre PiP : emotes Twitch, 7TV, BTTV
// et FFZ, badges, pseudos tagues dans leur couleur, pseudos surlignes dans 7TV.
// - Direct : IRC anonyme (justinfan).
// - Rediffusion : messages de la video par l'API GraphQL du site (sans
//   compte), affiches au rythme de la lecture.
// Aucun DOM de la page Twitch n'est lu : l'onglet peut etre cache (rendu gele,
// cf. memoire hidden-tab-rendering-freeze), les messages arrivent quand meme.
// Injecte a la demande par background.js, avant doc-pip.js (frame du haut).
(() => {
  // Extension rechargee : l'ancienne version reste dans la page. Une version
  // plus recente prend sa place (doc-pip.js appelle createVod).
  const VERSION = 2;
  const prev = window.__trinitxTwitchChat;
  if (prev && prev.version >= VERSION) return;

  const IRC_URL = "wss://irc-ws.chat.twitch.tv:443";
  const MAX_LINES = 150;
  const RETRY_MS = 3000; // double a chaque echec, plafonne a RETRY_MAX_MS
  const RETRY_MAX_MS = 60000;
  const JOIN_TIMEOUT_MS = 15000; // sans ROOMSTATE : chaine introuvable
  // API GraphQL du site Twitch, avec l'identifiant public de son client web :
  // badges, couleurs des pseudos et chat des rediffusions, sans compte.
  const GQL_URL = "https://gql.twitch.tv/gql";
  const GQL_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
  const COLOR_BATCH_MS = 300; // pseudos tagues regroupes en une requete
  const HIGHLIGHT_REFRESH_MS = 30000; // liste 7TV relue (pseudo ajoute pendant le PiP)
  // Rediffusion. Une requete donne ~60 messages autour d'un moment de la
  // video (la pagination par curseur exige un jeton d'integrite, mesure le
  // 04/11/2026) : la suivante part du dernier moment recu.
  const VOD_PREFETCH_S = 20; // messages demandes ~20 s avant leur moment
  const VOD_BACKLOG = 40; // messages deja passes montres a l'ouverture ou apres un saut
  const VOD_RETRY_MS = 10000;
  const VOD_JUMP_BACK_S = 1; // retour en arriere dans la video : le chat repart
  const VOD_JUMP_AHEAD_S = 30; // saut en avant : le chat repart au lieu de tout deverser
  const VOD_QUERY = `query($id: ID!, $offset: Int) { video(id: $id) {
    owner { id login }
    comments(contentOffsetSeconds: $offset) {
      edges { node { id contentOffsetSeconds commenter { login displayName }
        message { userColor userBadges { setID version } fragments { text emote { emoteID } } } } }
      pageInfo { hasNextPage } } } }`;
  // Couleurs attribuees par Twitch aux comptes qui n'en ont pas choisi.
  const DEFAULT_COLORS = [
    "#FF0000", "#0000FF", "#008000", "#B22222", "#FF7F50",
    "#9ACD32", "#FF4500", "#2E8B57", "#DAA520", "#D2691E",
    "#5F9EA0", "#1E90FF", "#FF69B4", "#8A2BE2", "#00FF7F",
  ];

  async function gql(query, variables) {
    const r = await fetch(GQL_URL, {
      method: "POST",
      headers: { "Client-Id": GQL_CLIENT_ID, "Content-Type": "application/json" },
      body: JSON.stringify(variables ? { query, variables } : { query }),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    if (j.errors && j.errors.length) throw new Error(j.errors.map((e) => e.message).join(", "));
    return j.data || {};
  }

  async function getJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

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

  // Message decoupe en morceaux : { text } ou { emote: { id, name } } (Twitch).
  function partsFromIrc(text, emotesTag) {
    const parts = [];
    const chars = Array.from(text);
    let pos = 0;
    for (const r of twitchEmoteRanges(emotesTag)) {
      if (r.s < pos || r.e >= chars.length) continue;
      if (r.s > pos) parts.push({ text: chars.slice(pos, r.s).join("") });
      parts.push({ emote: { id: r.id, name: chars.slice(r.s, r.e + 1).join("") } });
      pos = r.e + 1;
    }
    if (pos < chars.length) parts.push({ text: chars.slice(pos).join("") });
    return parts;
  }

  // Message normalise : { id, login, name, color, badges: ["set/version"],
  // parts, action, reply: { name, body, msgId } | null }.
  function fromIrc(m) {
    const login = (m.prefix.split("!")[0] || "").toLowerCase();
    let text = m.trailing;
    const action = /^\u0001ACTION (.*)\u0001$/.exec(text);
    if (action) text = action[1];
    const parent = m.tags["reply-parent-display-name"] || m.tags["reply-parent-user-login"];
    return {
      id: m.tags.id || "",
      login,
      name: m.tags["display-name"] || login,
      color: m.tags.color,
      badges: (m.tags.badges || "").split(",").filter(Boolean),
      parts: partsFromIrc(text, m.tags.emotes),
      action: !!action,
      reply: parent
        ? { name: parent, body: m.tags["reply-parent-msg-body"] || "", msgId: m.tags["reply-parent-msg-id"] || "" }
        : null,
    };
  }

  // Message de rediffusion (null : compte supprime).
  function fromComment(node) {
    const who = node.commenter;
    if (!who || !who.login) return null;
    const message = node.message || {};
    return {
      id: node.id,
      at: node.contentOffsetSeconds,
      login: who.login.toLowerCase(),
      name: who.displayName || who.login,
      color: message.userColor,
      badges: (message.userBadges || []).map((b) => `${b.setID}/${b.version}`),
      parts: (message.fragments || []).map((f) =>
        f.emote && f.emote.emoteID ? { emote: { id: f.emote.emoteID, name: f.text } } : { text: f.text || "" },
      ),
      action: false,
      reply: null,
    };
  }

  // --- Emotes et badges --------------------------------------------------------
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
    const data = await gql(`{ badges { ${fields} } user(id: "${roomId}") { broadcastBadges { ${fields} } } }`);
    const map = new Map();
    const user = data.user || {};
    // Badges de la chaine en dernier : ils remplacent les globaux du meme nom.
    for (const b of [...(data.badges || []), ...(user.broadcastBadges || [])]) {
      if (b && b.setID && b.imageURL) map.set(`${b.setID}/${b.version}`, b);
    }
    return map;
  }

  // Emotes et badges d'une chaine, dans ctx ({ extra, badges }) une fois charges.
  function loadChannelAssets(ctx, roomId, isCurrent) {
    loadThirdPartyEmotes(roomId).then((map) => {
      if (isCurrent()) ctx.extra = map;
    });
    loadBadges(roomId)
      .then((map) => {
        if (isCurrent()) ctx.badges = map;
      })
      .catch((e) => console.warn("[TwitchChat] badges indisponibles:", e.message));
  }

  // --- Couleurs des pseudos ----------------------------------------------------
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

  // Couleur de chat brute par compte ("" : jamais choisie, null : compte
  // introuvable), apprise de ses messages ou demandee a Twitch quand il est
  // tague sans avoir parle. Un pseudo tague prend la couleur de ses messages.
  const userColors = new Map();
  const MAX_COLORS = 5000; // gros chat pendant des heures : les plus anciens partent
  const colorWaiters = new Map(); // login -> elements @pseudo a colorer
  let colorTimer = 0;

  function rememberColor(login, raw) {
    userColors.delete(login); // remis en dernier : l'ordre suit l'activite
    userColors.set(login, raw);
    if (userColors.size <= MAX_COLORS) return;
    for (const old of Array.from(userColors.keys()).slice(0, 1000)) userColors.delete(old);
  }

  function learnColor(login, color) {
    if (login) rememberColor(login, color || "");
  }

  function paintMention(el, login) {
    const raw = userColors.get(login);
    if (raw === null) return;
    if (raw !== undefined) {
      el.style.color = nameColor(raw, login);
      return;
    }
    let waiting = colorWaiters.get(login);
    if (!waiting) colorWaiters.set(login, (waiting = []));
    waiting.push(el);
    if (!colorTimer) colorTimer = setTimeout(fetchColors, COLOR_BATCH_MS);
  }

  async function fetchColors() {
    colorTimer = 0;
    const batch = Array.from(colorWaiters).slice(0, 100); // plafond de l'API
    for (const [login] of batch) colorWaiters.delete(login);
    if (colorWaiters.size) colorTimer = setTimeout(fetchColors, COLOR_BATCH_MS);
    const found = new Map();
    try {
      const logins = JSON.stringify(batch.map(([login]) => login)); // [a-z0-9_] : sans risque
      const data = await gql(`{ users(logins: ${logins}) { login chatColor } }`);
      for (const u of data.users || []) {
        if (u && u.login) found.set(u.login.toLowerCase(), u.chatColor || "");
      }
    } catch (e) {
      console.warn("[TwitchChat] couleurs des pseudos tagues indisponibles:", e.message);
      return; // pseudos laisses en blanc, redemandes au prochain tag
    }
    for (const [login, els] of batch) {
      if (!userColors.has(login)) rememberColor(login, found.has(login) ? found.get(login) : null);
      const raw = userColors.get(login);
      if (raw === null) continue;
      for (const el of els) el.style.color = nameColor(raw, login);
    }
  }

  // --- Pseudos surlignes dans 7TV ---------------------------------------------
  // Bouton « surligner » de la fiche utilisateur de 7TV (ou ses reglages) : 7TV
  // range la liste dans sa base IndexedDB "seventv" du site twitch.tv, que ce
  // script partage (reglage highlights.custom, entrees username: true). Lue
  // seulement, jamais creee ni modifiee. Meme rendu que 7TV : couleur de
  // l'entree, opacite et style de ses reglages (defauts : 10 %, standard).
  const NO_HIGHLIGHTS = { users: new Map(), opacity: 10, style: 0 };
  let highlights = NO_HIGHLIGHTS;
  let highlightsReading = null;

  function parseHighlights(v) {
    const users = new Map();
    const custom = v["highlights.custom"];
    const entries = custom instanceof Map ? custom.values() : Object.values(custom || {});
    for (const h of entries) {
      if (h && h.username === true && typeof h.pattern === "string" && h.pattern && typeof h.color === "string") {
        users.set(h.pattern.toLowerCase(), h.color);
      }
    }
    const opacity = v["highlights.opacity"];
    const style = v["highlights.display_style"];
    return {
      users,
      opacity: typeof opacity === "number" ? Math.min(100, Math.max(0, opacity)) : 10,
      style: style === 1 || style === 2 ? style : 0,
    };
  }

  function readSevenTv() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("seventv");
      // Base absente : l'ouvrir la creerait vide sous le nez de 7TV.
      req.onupgradeneeded = () => req.transaction.abort();
      req.onerror = () => reject(req.error || new Error("ouverture refusee"));
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close(); // 7TV met sa base a jour : on la lui laisse
        if (!db.objectStoreNames.contains("settings")) {
          db.close();
          resolve(NO_HIGHLIGHTS);
          return;
        }
        const tx = db.transaction("settings");
        const store = tx.objectStore("settings");
        const values = {};
        for (const key of ["highlights.custom", "highlights.opacity", "highlights.display_style"]) {
          const r = store.get(key);
          r.onsuccess = () => {
            values[key] = r.result && r.result.value;
          };
        }
        tx.oncomplete = () => {
          db.close();
          resolve(parseHighlights(values));
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error || new Error("lecture refusee"));
        };
        // Abandon sans erreur (connexion fermee de force) : sinon la lecture
        // reste en attente et la liste n'est plus jamais relue.
        tx.onabort = () => {
          db.close();
          reject(tx.error || new Error("lecture annulee"));
        };
      };
    });
  }

  function refreshHighlights() {
    if (highlightsReading) return highlightsReading;
    highlightsReading = (async () => {
      try {
        const dbs = indexedDB.databases ? await indexedDB.databases() : [];
        highlights = dbs.some((d) => d.name === "seventv") ? await readSevenTv() : NO_HIGHLIGHTS;
      } catch (e) {
        console.warn("[TwitchChat] surlignages 7TV illisibles:", e.message);
      } finally {
        highlightsReading = null;
      }
      return highlights;
    })();
    return highlightsReading;
  }

  // Comme 7TV : par login, ou par pseudo affiche (son test).
  function highlightLine(line) {
    const color =
      highlights.style === 2
        ? null
        : highlights.users.get(line.dataset.user) || highlights.users.get(line.dataset.name);
    line.classList.toggle("hl", !!color);
    line.classList.toggle("hl-flat", !!color && highlights.style === 1);
    if (color) {
      line.style.setProperty("--hl", color);
      line.style.setProperty("--hl-dim", `color-mix(in srgb, ${color} ${highlights.opacity}%, transparent)`);
    } else {
      line.style.removeProperty("--hl");
      line.style.removeProperty("--hl-dim");
    }
  }

  // --- Rendu -------------------------------------------------------------------
  function emoteImg(doc, url, name) {
    const img = doc.createElement("img");
    img.className = "emote";
    img.src = url;
    img.alt = name;
    img.title = name;
    return img;
  }

  function mention(doc, name) {
    const b = doc.createElement("b");
    b.className = "mention";
    b.textContent = "@" + name;
    b.dataset.login = name.toLowerCase();
    paintMention(b, b.dataset.login);
    return b;
  }

  // Texte libre : emotes 7TV/BTTV/FFZ (mot exact) et pseudos tagues.
  function appendWords(frag, doc, text, extra) {
    let buf = "";
    const flush = () => {
      if (buf) frag.append(buf);
      buf = "";
    };
    for (const w of text.split(/(\s+)/)) {
      const url = extra.get(w);
      if (url) {
        flush();
        frag.append(emoteImg(doc, url, w));
        continue;
      }
      const tag = /^@([A-Za-z0-9_]{1,25})(.*)$/.exec(w); // "@pseudo," : la virgule reste du texte
      if (tag) {
        flush();
        frag.append(mention(doc, tag[1]));
        buf = tag[2];
        continue;
      }
      buf += w;
    }
    flush();
  }

  function buildBody(doc, parts, extra) {
    const frag = doc.createDocumentFragment();
    for (const p of parts) {
      if (p.emote) {
        const url = `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(p.emote.id)}/default/dark/3.0`;
        frag.append(emoteImg(doc, url, p.emote.name));
      } else {
        appendWords(frag, doc, p.text, extra);
      }
    }
    return frag;
  }

  function svgIcon(doc, shapes) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = doc.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    for (const [tag, attrs] of shapes) {
      const node = doc.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
      svg.append(node);
    }
    return svg;
  }

  // Reponse a un autre message : comme le chat officiel, une ligne grise
  // au-dessus avec l'auteur et le message d'origine, ici en entier (Alexis,
  // 04/11/2026). Avec ses emotes : copie de sa ligne s'il est encore dans le
  // chat, sinon son texte (tags reply-parent-* de l'IRC, sans les positions
  // de ses emotes Twitch). Le texte de la reponse reste tel quel : les
  // positions de ses emotes Twitch en dependent.
  function replyHeader(view, ctx, reply) {
    const { doc, list } = view;
    const header = doc.createElement("div");
    header.className = "reply";
    const label = doc.createElement("span");
    label.append(`Réponse à @${reply.name} : `);
    const sel = reply.msgId && `.line[data-id="${CSS.escape(reply.msgId)}"] > .body`;
    const parent = sel && list.querySelector(sel);
    if (parent) {
      label.append(...Array.from(parent.childNodes, (n) => n.cloneNode(true)));
      // @pseudo copie avant que sa couleur arrive : la copie l'attend aussi.
      for (const m of label.querySelectorAll(".mention")) {
        if (!m.style.color) paintMention(m, m.dataset.login);
      }
    } else {
      label.append(buildBody(doc, [{ text: reply.body }], ctx.extra));
    }
    header.append(
      svgIcon(doc, [["polyline", { points: "9 17 4 12 9 7" }], ["path", { d: "M20 18v-2a4 4 0 0 0-4-4H4" }]]),
      label,
    );
    return header;
  }

  function renderMessage(view, ctx, msg) {
    const { doc } = view;
    learnColor(msg.login, msg.color);
    const color = nameColor(msg.color, msg.login);
    const line = doc.createElement("div");
    line.className = msg.action ? "line action" : "line";
    if (msg.id) line.dataset.id = msg.id;
    line.dataset.user = msg.login;
    line.dataset.name = msg.name.toLowerCase();
    if (msg.reply) line.append(replyHeader(view, ctx, msg.reply));
    for (const id of msg.badges) {
      const b = ctx.badges.get(id);
      if (!b) continue;
      const img = doc.createElement("img");
      img.className = "badge";
      img.src = b.imageURL;
      img.alt = img.title = b.title || id;
      line.append(img);
    }
    const name = doc.createElement("b");
    name.textContent = msg.name;
    name.style.color = color;
    const body = doc.createElement("span");
    body.className = "body";
    if (msg.action) body.style.color = color;
    body.append(buildBody(doc, msg.parts, ctx.extra));
    line.append(name, msg.action ? " " : ": ", body);
    highlightLine(line);
    return line;
  }

  // --- Liste des lignes ----------------------------------------------------------
  // list : element (dans le document PiP) qui recoit une ligne par message.
  function makeView(list) {
    const doc = list.ownerDocument;
    const win = doc.defaultView; // fenetre PiP : ses minuteurs tournent, onglet cache ou non
    let destroyed = false;
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
    const resizeObserver = new win.ResizeObserver(keepAtEnd);
    resizeObserver.observe(list);
    // Emote ou badge charge apres coup : la ligne grandit. `load` ne remonte
    // pas, on l'ecoute en phase de capture.
    list.addEventListener("load", keepAtEnd, true);

    // Pseudo surligne ou retire dans 7TV pendant le PiP : les lignes suivent.
    const rehighlight = () =>
      refreshHighlights().then(() => {
        if (!destroyed) list.querySelectorAll(".line[data-user]").forEach(highlightLine);
      });
    rehighlight();
    const timer = win.setInterval(rehighlight, HIGHLIGHT_REFRESH_MS);

    return {
      doc,
      list,
      scrollToEnd,
      push(line) {
        list.append(line);
        while (list.childElementCount > MAX_LINES) list.firstElementChild.remove();
        keepAtEnd();
      },
      system(text) {
        const line = doc.createElement("div");
        line.className = "line sys";
        line.textContent = text;
        this.push(line);
      },
      clear() {
        list.textContent = "";
        stuck = true;
      },
      destroy() {
        destroyed = true;
        list.removeEventListener("scroll", onScroll);
        list.removeEventListener("load", keepAtEnd, true);
        resizeObserver.disconnect();
        win.clearInterval(timer);
      },
    };
  }

  // --- Direct : IRC ----------------------------------------------------------------
  function create(list, channel) {
    const view = makeView(list);
    const ctx = { extra: new Map(), badges: new Map() };
    const nick = "justinfan" + Math.floor(10000 + Math.random() * 80000);
    let ws = null;
    let stopped = false;
    let retry = null;
    let retryMs = RETRY_MS;
    let failures = 0; // coupures de suite sans connexion reussie entre deux
    let joinTimer = null;
    let roomId = null;

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
          failures = 0;
          if (!id || id === roomId) break;
          if (!roomId) view.system(`Chat de ${channel}`);
          roomId = id;
          loadChannelAssets(ctx, id, () => !stopped && roomId === id);
          break;
        }
        case "PRIVMSG":
          view.push(renderMessage(view, ctx, fromIrc(m)));
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
            view.clear();
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
        // Une coupure isolee (code 1006 : reseau, reveil du PC, serveur
        // Twitch) se repare seule : console.info, absent de la page Erreurs
        // de chrome://extensions (Alexis, 04/11/2026). Avertissement
        // seulement quand la reconnexion echoue 3 fois de suite.
        failures++;
        const log = failures >= 3 ? console.warn : console.info;
        log(`[TwitchChat] IRC ferme (code ${e.code}), reconnexion dans ${retryMs / 1000} s`);
        retry = setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
      };
    }

    connect();
    joinTimer = setTimeout(() => {
      if (roomId || stopped) return;
      console.warn("[TwitchChat] pas de reponse au JOIN de", channel);
      view.system(`Chat de ${channel} introuvable.`);
    }, JOIN_TIMEOUT_MS);
    return {
      scrollToEnd: view.scrollToEnd,
      stop() {
        stopped = true;
        clearTimeout(retry);
        clearTimeout(joinTimer);
        if (ws) ws.close();
        view.destroy();
      },
    };
  }

  // --- Rediffusion -------------------------------------------------------------------
  // Messages affiches quand la lecture atteint leur moment (evenements de la
  // <video>, qui tournent meme onglet cache). Un saut dans la video vide le
  // chat et le reprend a la nouvelle position, avec les derniers messages
  // d'avant, comme le chat des rediffusions de Twitch.
  function createVod(list, videoId, video) {
    const view = makeView(list);
    const ctx = { extra: new Map(), badges: new Map() };
    const events = new AbortController();
    let stopped = false;
    let owner = null; // { id, login }, emotes et badges charges une fois
    let pending = []; // messages a venir, tries par moment
    const seen = new Map(); // id -> moment, deja recus : les pages se chevauchent
    let next = 0; // prochain moment a demander
    let hasNext = true;
    let loading = false;
    let gen = 0; // change a chaque saut : les reponses d'avant sont ignorees
    let pages = 0; // pages recues depuis le dernier saut
    let lastT = -1;
    let failUntil = 0;
    let failShown = false;

    async function load(offset) {
      loading = true;
      const g = gen;
      const at = Math.max(0, Math.floor(offset));
      try {
        const data = await gql(VOD_QUERY, { id: videoId, offset: at });
        if (stopped || g !== gen) return;
        const v = data.video;
        if (!v) {
          hasNext = false;
          view.system("Rediffusion introuvable : pas de chat.");
          return;
        }
        if (!owner && v.owner && v.owner.id) {
          owner = { id: v.owner.id, login: v.owner.login };
          loadChannelAssets(ctx, owner.id, () => !stopped);
        }
        if (!pages && owner) view.system(`Chat de ${owner.login} (rediffusion)`);
        pages++;
        const comments = v.comments || {};
        let last = -1; // moment du dernier message nouveau
        for (const edge of comments.edges || []) {
          const node = edge && edge.node;
          if (!node || seen.has(node.id)) continue;
          seen.set(node.id, node.contentOffsetSeconds || 0);
          last = Math.max(last, node.contentOffsetSeconds || 0);
          const msg = fromComment(node);
          if (msg) pending.push(msg);
        }
        pending.sort((a, b) => a.at - b.at); // tri stable : l'ordre de Twitch reste a moment egal
        // Une page remonte jusqu'a ~2 min avant le moment demande (mesure) :
        // les ids de plus de 10 min ne reviendront plus (memoire bornee).
        if (seen.size > 3000) {
          for (const [id, t] of seen) if (t < at - 600) seen.delete(id);
        }
        // Rien de neuf apres ce moment (chat silencieux) : on saute plus loin
        // au lieu de redemander seconde par seconde.
        next = last >= at ? Math.max(at + 1, last) : at + VOD_PREFETCH_S;
        hasNext = !!(comments.pageInfo && comments.pageInfo.hasNextPage);
        failShown = false;
      } catch (e) {
        if (stopped || g !== gen) return;
        console.warn("[TwitchChat] chat de la rediffusion indisponible:", e.message);
        failUntil = Date.now() + VOD_RETRY_MS;
        if (!failShown) view.system("Chat de la rediffusion indisponible pour l'instant.");
        failShown = true;
      } finally {
        if (g === gen) loading = false;
      }
      tick();
    }

    function restart(t) {
      gen++;
      loading = false;
      pending = [];
      seen.clear();
      hasNext = true;
      pages = 0;
      failUntil = 0;
      lastT = t;
      view.clear();
      load(t);
    }

    function tick() {
      if (stopped) return;
      const t = video.currentTime;
      if (!Number.isFinite(t)) return;
      if (lastT >= 0 && (t < lastT - VOD_JUMP_BACK_S || t > lastT + VOD_JUMP_AHEAD_S)) {
        restart(t);
        return;
      }
      lastT = t;
      let due = 0;
      while (due < pending.length && pending[due].at <= t) due++;
      if (due) {
        // Apres un saut, les messages deja passes de la premiere page : les
        // derniers seulement. Ensuite, tous (rattrapage d'un petit saut).
        const from = pages === 1 ? Math.max(0, due - VOD_BACKLOG) : 0;
        for (const msg of pending.slice(from, due)) view.push(renderMessage(view, ctx, msg));
        pending = pending.slice(due);
      }
      if (pages === 1) pages = 2; // le tri des deja-passes ne vaut qu'une fois
      if (!loading && hasNext && Date.now() >= failUntil && next < t + VOD_PREFETCH_S) load(next);
    }

    const opts = { signal: events.signal };
    video.addEventListener("timeupdate", tick, opts);
    video.addEventListener("seeked", tick, opts);
    restart(video.currentTime || 0);
    return {
      scrollToEnd: view.scrollToEnd,
      stop() {
        stopped = true;
        events.abort();
        view.destroy();
      },
    };
  }

  window.__trinitxTwitchChat = { version: VERSION, create, createVod };
})();
