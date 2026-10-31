// Fenetre PiP « Document » pour Twitch : la <video> de la page y est deplacee,
// avec une barre (pause, son, volume, chat) et le chat sous la video. Choix
// d'Alexis du 31/10/2026 : afficher le chat ne
// touche jamais a la taille de la fenetre (la video retrecit, bandes noires),
// et le chat n'est jamais par-dessus la video.
// Le PiP video natif de Chrome n'accepte ni bouton ni texte : d'ou ce mode.
// Injecte a la demande par background.js (frame du haut), apres twitch-chat.js.
// background.js appelle open() avec un faux geste (chrome.debugger) ; fermer
// passe par documentPictureInPicture.window.close() -> pagehide -> unmount().
//
// Aussi enregistre comme content script du module PiP sur twitch.tv : le
// bouton PiP de BTTV ouvre la fenetre maison sans PiP natif (player.js, monde
// MAIN, detourne son appel : evenement trinitx-pip-request), et un PiP natif
// ouvert autrement est remplace (enterpictureinpicture, en bas).
//
// Taille et position : la page ne peut pas deplacer sa fenetre PiP (moveBy y
// est ignore). background.js le fait par chrome.windows (message
// doc-pip-bounds), qui voit la fenetre PiP. Regles de Chrome (verifiees dans
// son code et mesurees, Chrome 156) :
// - a la main, la fenetre va jusqu'a 80 % de la largeur et de la hauteur de
//   l'ecran ;
// - par programme, elle peut toujours retrecir ou bouger, mais ne grandit
//   que jusqu'a 25 % de la surface de l'ecran (au-dela, Chrome la reduit) :
//   l'epingle ne ramene une place plus grande que depuis une fenetre plus
//   grande. Aucun recalage automatique : la taille est celle qu'Alexis donne.
(() => {
  // Extension rechargee : l'ancien script reste dans la page, sans acces a
  // chrome.* ; le nouveau prend sa place au lieu de s'effacer devant lui.
  if (window.__trinitxDocPip && window.__trinitxDocPip.isAlive && window.__trinitxDocPip.isAlive()) return;

  const CHAT_KEY = "pipChatVisible"; // chrome.storage.local : chat affiche ?
  // chrome.storage.local : place retenue { left, top, width, height }. Cle
  // renouvelee le 31/10/2026 au soir pour que la nouvelle place par defaut
  // passe devant une ancienne retenue au clic droit ("pipLayout", ignoree).
  const LAYOUT_KEY = "pipLayout2";
  // Place de la fenetre d'Alexis le 31/10/2026 au soir (ecran 4K a 300 %), en
  // unites de chrome.windows : son rectangle Windows (2385, 321, 1458 x 1731
  // px) moins le decalage du cadre (24 px en haut). Valable tant qu'il n'en a
  // pas retenu une autre (clic droit sur le bouton).
  const DEFAULT_LAYOUT = { left: 795, top: 99, width: 486, height: 577 };
  const CHAT_SHARE = 0.35; // part de la hauteur de la fenetre prise par le chat
  // Taille maximale d'une fenetre PiP : 80 % de l'ecran en largeur et en
  // hauteur (code de Chrome). Au plafond en largeur, le chat se cache s'il
  // prive la video de hauteur, et revient quand la fenetre retrecit (Alexis, 31/10).
  const MAX_WINDOW_RATIO = 0.8;
  const MAX_TOLERANCE = 8; // px
  const OPEN_W = 480; // largeur a l'ouverture (px)
  const RATIO = 16 / 9;
  const DRAG_THRESHOLD = 4; // px avant qu'un appui sur la video devienne un deplacement
  const POLL_MS = 5000; // suivi de la chaine (raid, navigation)
  const OPEN_ATTR = "data-trinitx-doc-pip"; // sur <html> : lu par player.js (monde MAIN)
  const NATIVE_ATTR = "data-trinitx-native-pip"; // sur <html> : repli natif voulu par background.js
  const READY_ATTR = "data-trinitx-pip-ready"; // sur <html> : player.js peut detourner le PiP natif

  // Premiers segments d'URL qui ne sont pas une chaine.
  const NOT_CHANNEL = new Set([
    "directory", "settings", "subscriptions", "inventory", "wallet", "drops",
    "search", "downloads", "jobs", "p", "turbo", "friends", "following",
    "messages", "payments", "prime", "store", "team", "u", "user", "login",
    "signup", "event", "collections",
  ]);

  const STYLE = `
    html, body { margin: 0; height: 100%; overflow: hidden; background: #000; color: #efeff1;
      font-family: Inter, "Segoe UI", system-ui, sans-serif; }
    body { display: flex; flex-direction: column; }
    .stage { position: relative; flex: 1 1 auto; min-height: 0; background: #000; overflow: hidden;
      cursor: grab; touch-action: none; user-select: none; }
    .stage.dragging { cursor: grabbing; }
    /* contain : jamais d'image rognee, des bandes noires si la place n'est pas en 16/9. */
    .stage video { position: absolute !important; inset: 0 !important; width: 100% !important;
      height: 100% !important; object-fit: contain !important; }
    .bar { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; display: flex; align-items: center;
      gap: 6px; padding: 28px 10px 8px; background: linear-gradient(transparent, rgba(0,0,0,.75));
      opacity: 0; transition: opacity .15s; cursor: default; }
    .stage:hover .bar, .stage.paused .bar { opacity: 1; }
    .stage.dragging .bar { opacity: 0; }
    .bar .sp { flex: 1; }
    .bar button { display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 8px;
      border: 0; border-radius: 6px; background: transparent; color: #fff; cursor: pointer;
      font-family: inherit; font-size: 12px; font-weight: 600; }
    .bar button:hover { background: rgba(255,255,255,.15); }
    .bar button.on, .bar button.on:hover { background: #9147ff; }
    .bar button.saved, .bar button.saved:hover { background: #00a86b; }
    .bar button[hidden] { display: none; }
    .bar svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2;
      stroke-linecap: round; stroke-linejoin: round; }
    .bar input[type=range] { width: 80px; margin: 0; accent-color: #9147ff; cursor: pointer; }
    .bar input[hidden] { display: none; }
    /* Chat sous la video, sa hauteur suit la fenetre. */
    /* Chat affiche : la video prend toute la largeur en 16/9, au plus
       65 % de la hauteur, et le chat tout le reste. Une fenetre plus
       haute que la video agrandit le chat, jamais de bandes en haut et en bas
       (Alexis, 31/10/2026) ; trop basse, des bandes sur les cotes seulement. */
    body.chat-on .stage { flex: 0 0 auto; width: 100%; aspect-ratio: 16 / 9;
      max-height: ${Math.round((1 - CHAT_SHARE) * 100)}%; }
    .band { flex: 1 1 0; min-height: 0; border-top: 1px solid #2f2f35;
      background: #18181b; }
    .band[hidden] { display: none; }
    .list { height: 100%; box-sizing: border-box; overflow-y: auto; padding: 6px 10px;
      font-size: 13px; line-height: 1.45; overflow-wrap: anywhere;
      text-shadow: 0 1px 2px rgba(0,0,0,.9), 0 0 4px rgba(0,0,0,.6);
      scrollbar-width: thin; scrollbar-color: #3a3a3d transparent; }
    .line { padding: 1px 0; }
    .line b { font-weight: 700; }
    .line.sys { color: #adadb8; font-style: italic; }
    .line .reply { display: flex; align-items: center; gap: 4px; min-width: 0;
      font-size: 11.5px; color: #adadb8; text-shadow: none; }
    .line .reply span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .line .reply svg { flex: none; width: 13px; height: 13px; fill: none; stroke: currentColor;
      stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .badge { width: 18px; height: 18px; vertical-align: middle; margin: -3px 3px 0 0; }
    .emote { height: 1.9em; vertical-align: middle; margin: -0.35em 0; }
  `;

  // Icones (traces Lucide), construites sans innerHTML.
  const ICONS = {
    pause: [["rect", { x: 6, y: 4, width: 4, height: 16, rx: 1 }], ["rect", { x: 14, y: 4, width: 4, height: 16, rx: 1 }]],
    play: [["polygon", { points: "6 3 20 12 6 21 6 3" }]],
    chat: [["path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" }]],
    pin: [
      ["path", { d: "M12 17v5" }],
      ["path", { d: "M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" }],
    ],
    volume: [
      ["polygon", { points: "11 5 6 9 2 9 2 15 6 15 11 19 11 5" }],
      ["path", { d: "M15.54 8.46a5 5 0 0 1 0 7.07" }],
      ["path", { d: "M19.07 4.93a10 10 0 0 1 0 14.14" }],
    ],
    muted: [
      ["polygon", { points: "11 5 6 9 2 9 2 15 6 15 11 19 11 5" }],
      ["line", { x1: 22, y1: 9, x2: 16, y2: 15 }],
      ["line", { x1: 16, y1: 9, x2: 22, y2: 15 }],
    ],
  };

  let state = null;

  function icon(doc, name) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = doc.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    for (const [tag, attrs] of ICONS[name]) {
      const node = doc.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      svg.append(node);
    }
    return svg;
  }

  function button(doc, cls, iconName, label) {
    const b = doc.createElement("button");
    b.type = "button";
    b.className = cls;
    b.append(icon(doc, iconName));
    if (label) b.append(label);
    return b;
  }

  // Ce que joue la page : une chaine en direct, une rediffusion, ou autre
  // chose (repertoire : le mini-lecteur garde la chaine precedente).
  function readPage() {
    if (!/^(www\.|m\.)?twitch\.tv$/.test(location.hostname)) return { channel: null, vod: false };
    const parts = location.pathname.split("/").filter(Boolean);
    let name = (parts[0] || "").toLowerCase();
    if (name === "videos") return { channel: null, vod: true };
    if ((name === "popout" || name === "moderator") && parts[1]) name = parts[1].toLowerCase();
    if (NOT_CHANNEL.has(name) || !/^[a-z0-9_]{2,25}$/.test(name)) return { channel: null, vod: false };
    return { channel: name, vod: false };
  }

  function pickVideo() {
    const vids = Array.from(document.querySelectorAll("video")).filter(
      (v) => !v.disablePictureInPicture && v.readyState > 0,
    );
    vids.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight);
    return vids[0] || null;
  }

  // Deplace / redimensionne la fenetre PiP par background.js (chrome.windows).
  // hint : bornes actuelles, pour reconnaitre la fenetre parmi celles de Chrome.
  // native : passer par le programme Windows (native-host/), seul capable
  // d'agrandir la fenetre au-dela du plafond de Chrome (epingle).
  function setBounds(win, bounds, native = false) {
    const hint = { left: win.screenX, top: win.screenY, width: win.outerWidth, height: win.outerHeight };
    const msg = { type: "doc-pip-bounds", bounds, hint, native, dpr: win.devicePixelRatio };
    chrome.runtime.sendMessage(msg).catch((e) => {
      console.warn("[DocPiP] fenetre non deplacee:", e.message);
    });
  }

  // Rend le clavier a la fenetre du dessous (onglet Chrome ou autre appli).
  // Sinon Ctrl+W, que Chrome reserve et qu'aucune page ne peut bloquer,
  // fermerait la fenetre PiP au lieu de l'onglet (Alexis, 31/10/2026).
  function releaseFocus(win) {
    const hint = { left: win.screenX, top: win.screenY, width: win.outerWidth, height: win.outerHeight };
    chrome.runtime.sendMessage({ type: "doc-pip-blur", hint }).catch(() => {});
  }

  function startChat(s) {
    if (s.chat) s.chat.stop(); // raid : sinon l'ancien chat tourne encore
    s.list.textContent = "";
    s.chat = window.__trinitxTwitchChat.create(s.list, s.channel);
  }

  function stopChat(s, message) {
    if (s.chat) s.chat.stop();
    s.chat = null;
    s.list.textContent = "";
    if (message) {
      const line = s.win.document.createElement("div");
      line.className = "line sys";
      line.textContent = message;
      s.list.append(line);
    }
  }

  // Afficher le chat ne change jamais la taille de la fenetre : la video
  // retrecit au-dessus du chat (bandes noires).
  function setChat(on) {
    const s = state;
    if (!s || on === s.chatOn) return;
    s.chatOn = on;
    s.chatBtn.classList.toggle("on", on);
    if (on && !s.chat && s.channel) startChat(s);
    showChatIfRoom(s);
  }

  // Le chat (toujours connecte) se cache seulement quand la fenetre est au
  // plafond de Chrome en largeur (la video ne peut plus s'elargir) et qu'il
  // prive la video de hauteur. Agrandir la fenetre en hauteur seule ne le
  // cache jamais : c'est lui qui grandit (Alexis, 31/10/2026).
  function chatSqueezesVideo(win) {
    const atMaxWidth = win.outerWidth >= win.screen.width * MAX_WINDOW_RATIO - MAX_TOLERANCE;
    const videoRoom = win.innerHeight * (1 - CHAT_SHARE);
    return atMaxWidth && videoRoom < win.innerWidth / RATIO - 2;
  }

  function showChatIfRoom(s) {
    const show = s.chatOn && !chatSqueezesVideo(s.win);
    if (show === !s.band.hidden) return;
    s.band.hidden = !show;
    s.win.document.body.classList.toggle("chat-on", show);
    if (show && s.chat) s.chat.scrollToEnd();
  }

  // La taille de la fenetre est celle qu'Alexis lui donne : aucun recalage
  // automatique apres un redimensionnement (il changeait sa taille, 31/10/2026).
  // La mise en page (chat qui prend le surplus, bandes sur les cotes) suffit.
  function onResize() {
    const s = state;
    if (s) showChatIfRoom(s);
  }

  // Appui sur la video puis glisser : la fenetre suit la souris (une demande
  // par image). Les boutons de la barre gardent leur clic.
  function enableDrag(s) {
    const { win, stage } = s;
    let drag = null;
    const send = () => {
      drag.raf = 0;
      if (drag.next) setBounds(win, drag.next);
    };
    const end = () => {
      if (!drag) return;
      if (drag.raf) win.cancelAnimationFrame(drag.raf);
      if (drag.moved && drag.next) setBounds(win, drag.next);
      drag = null;
      stage.classList.remove("dragging");
    };
    const opts = { signal: s.events.signal };
    stage.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest(".bar")) return;
      drag = { x: e.screenX, y: e.screenY, left: win.screenX, top: win.screenY, moved: false, next: null, raf: 0 };
      stage.setPointerCapture(e.pointerId);
    }, opts);
    stage.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.screenX - drag.x;
      const dy = e.screenY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      drag.moved = true;
      stage.classList.add("dragging");
      drag.next = { left: Math.round(drag.left + dx), top: Math.round(drag.top + dy) };
      if (!drag.raf) drag.raf = win.requestAnimationFrame(send);
    }, opts);
    stage.addEventListener("pointerup", end, opts);
    stage.addEventListener("pointercancel", end, opts);
    stage.addEventListener("lostpointercapture", end, opts);
  }

  // Muet = son de l'onglet (comme Ctrl+Shift+2 et l'audio solo Twitch), tenu
  // par background.js, qui previent aussi des changements (doc-pip-muted).
  // Volume = celui du lecteur Twitch, regle par player.js (monde MAIN).
  function enableSound(s, muteBtn, volume) {
    const doc = s.win.document;
    s.showMuted = (muted) => {
      s.muted = muted;
      muteBtn.replaceChildren(icon(doc, muted ? "muted" : "volume"));
    };
    const setPlayerVolume = (v) =>
      document.dispatchEvent(new CustomEvent("trinitx-pip-volume", { detail: v }));
    // Demande l'etat voulu, jamais « inverser » : deux demandes rapprochees
    // (double clic, rafale du curseur) donnent le meme resultat.
    const setMuted = async (muted) => {
      s.muted = muted; // les demandes suivantes partent deja du nouvel etat
      const r = await chrome.runtime.sendMessage({ type: "doc-pip-mute", muted });
      if (state !== s) return;
      if (!r) {
        s.muted = !muted; // refuse : l'onglet n'a pas change
        return;
      }
      s.showMuted(r.muted);
      if (r.muted) return;
      if (Number(volume.value) === 0) volume.value = "0.5";
      setPlayerVolume(Number(volume.value)); // leve aussi le muet du lecteur
    };
    muteBtn.addEventListener("click", () => {
      setMuted(!s.muted).catch((e) => console.warn("[DocPiP] muet impossible:", e.message));
    });
    volume.addEventListener("input", () => {
      const v = Number(volume.value);
      setPlayerVolume(v);
      if (v > 0 && s.muted) {
        setMuted(false).catch((e) => console.warn("[DocPiP] son non remis:", e.message));
      }
    });
    s.video.addEventListener("volumechange", () => {
      if (doc.activeElement !== volume) volume.value = String(s.video.volume);
    }, { signal: s.events.signal });
    chrome.runtime
      .sendMessage({ type: "doc-pip-mute-state" })
      .then((r) => r && state === s && s.showMuted(r.muted))
      .catch(() => {});
  }

  // Place retenue : clic = la fenetre y retourne (position et taille), clic
  // droit = retenir la place actuelle. Grandir reste plafonne par Chrome a
  // 25 % de la surface de l'ecran ; la place par defaut est en dessous.
  function enableLayout(s, pinBtn) {
    const { win } = s;
    const valid = (b) =>
      b && ["left", "top", "width", "height"].every((k) => Number.isFinite(b[k])) && b.width >= 100 && b.height >= 100;
    pinBtn.addEventListener("click", async () => {
      const { [LAYOUT_KEY]: saved } = await chrome.storage.local.get(LAYOUT_KEY);
      if (state !== s) return;
      const b = valid(saved) ? saved : DEFAULT_LAYOUT;
      setBounds(win, { left: b.left, top: b.top, width: b.width, height: b.height }, true);
    });
    pinBtn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const b = { left: win.screenX, top: win.screenY, width: win.outerWidth, height: win.outerHeight };
      chrome.storage.local.set({ [LAYOUT_KEY]: b });
      pinBtn.classList.add("saved");
      win.setTimeout(() => pinBtn.classList.remove("saved"), 700);
    });
  }

  // Chaine changee sous la fenetre (raid, navigation) : le chat suit.
  function followChannel() {
    const s = state;
    if (!s) return;
    const page = readPage();
    if (page.vod) {
      if (s.channel) {
        s.channel = null;
        stopChat(s, "Rediffusion : pas de chat en direct.");
      }
      return;
    }
    if (!page.channel || page.channel === s.channel) return;
    s.channel = page.channel;
    s.chatBtn.hidden = false;
    if (s.chatOn) startChat(s);
    else stopChat(s);
  }

  function mount(win, video, page, chatOn) {
    const doc = win.document;
    const style = doc.createElement("style");
    style.textContent = STYLE;
    doc.head.append(style);

    const stage = doc.createElement("div");
    stage.className = "stage";
    const bar = doc.createElement("div");
    bar.className = "bar";
    const playBtn = button(doc, "play", "pause");
    const muteBtn = button(doc, "mute", "volume");
    const volume = doc.createElement("input");
    volume.type = "range";
    volume.min = "0";
    volume.max = "1";
    volume.step = "0.01";
    volume.value = String(video.volume);
    volume.title = "Volume";
    const spacer = doc.createElement("span");
    spacer.className = "sp";
    const pinBtn = button(doc, "pin", "pin");
    pinBtn.title = "Remettre la fenêtre à sa place (clic droit : retenir la place actuelle)";
    const chatBtn = button(doc, "chat", "chat", "Chat");
    chatBtn.hidden = !page.channel; // rediffusion, page sans chaine : pas de chat
    bar.append(playBtn, muteBtn, volume, spacer, pinBtn, chatBtn);
    const band = doc.createElement("div");
    band.className = "band";
    band.hidden = true;
    const list = doc.createElement("div");
    list.className = "list";
    band.append(list);

    // La video ne quitte la page qu'une fois le retour garanti (pagehide).
    const wasPlaying = !video.paused;
    const home = { parent: video.parentNode, next: video.nextSibling };
    const events = new AbortController();
    const s = {
      win, video, home, events, stage, band, list, chatBtn,
      channel: page.channel, chat: null, chatOn: false, muted: false, showMuted: null,
      poll: 0,
    };
    state = s;
    win.addEventListener("pagehide", unmount, { once: true });
    stage.append(video, bar);
    doc.body.append(stage, band);
    if (wasPlaying && video.paused) video.play().catch(() => {});
    document.documentElement.setAttribute(OPEN_ATTR, "");

    try {
      const syncPlay = () => {
        playBtn.replaceChildren(icon(doc, video.paused ? "play" : "pause"));
        stage.classList.toggle("paused", video.paused);
      };
      video.addEventListener("play", syncPlay, { signal: events.signal });
      video.addEventListener("pause", syncPlay, { signal: events.signal });
      syncPlay();
      playBtn.addEventListener("click", () => {
        if (video.paused) video.play().catch(() => {});
        else video.pause();
      });
      chatBtn.addEventListener("click", () => {
        if (state !== s) return;
        setChat(!s.chatOn);
        chrome.storage.local.set({ [CHAT_KEY]: s.chatOn });
      });
      enableSound(s, muteBtn, volume);
      enableLayout(s, pinBtn);
      enableDrag(s);
      // Apres chaque clic ou glisser dans la fenetre, le clavier repart.
      doc.addEventListener("pointerup", () => win.setTimeout(() => releaseFocus(win), 0), {
        capture: true,
        signal: events.signal,
      });
      win.addEventListener("resize", onResize, { signal: events.signal });
      setChat(chatOn);
      s.poll = setInterval(followChannel, POLL_MS);
    } catch (e) {
      win.close(); // pagehide remet la video en place
      throw e;
    }
  }

  // Remet la video dans le lecteur Twitch, a sa place, toujours en lecture.
  function restoreVideo({ video, home, win }) {
    if (video.ownerDocument !== win.document) return; // deja reprise par Twitch
    if (!home.parent.isConnected) {
      console.warn("[DocPiP] lecteur Twitch reconstruit pendant le PiP : video non remise");
      return;
    }
    const wasPlaying = !video.paused;
    const next = home.next && home.next.parentNode === home.parent ? home.next : null;
    home.parent.insertBefore(video, next);
    if (wasPlaying && video.paused) video.play().catch(() => {});
  }

  // Fenetre fermee (croix, raccourci, retour a l'onglet) : la video d'abord.
  function unmount() {
    const s = state;
    if (!s) return;
    state = null;
    restoreVideo(s);
    document.documentElement.removeAttribute(OPEN_ATTR);
    clearInterval(s.poll);
    s.events.abort();
    if (s.chat) s.chat.stop();
  }

  // video : celle qu'un bouton de la page vient de mettre en PiP natif, sinon
  // la plus grande de la frame du haut (l'apercu au survol de twitch-preview
  // vit dans une iframe et ne doit pas partir en PiP). Qualite max et volume :
  // player.js (monde MAIN), content script et injecte avant chaque raccourci.
  let opening = false; // double clic : une seule fenetre
  async function open(video = document.pictureInPictureElement || pickVideo()) {
    if (!window.documentPictureInPicture) return { status: "unsupported" };
    if (documentPictureInPicture.window || opening) return { status: "opened" };
    if (!video) return { status: "no-video" };
    opening = true;
    try {
      const page = readPage();
      const stored = await chrome.storage.local.get(CHAT_KEY);
      const chatOn = !!stored[CHAT_KEY] && !!page.channel;
      // PiP natif encore ouvert (bouton de la page) : requestWindow ne repond
      // jamais tant qu'il est la (mesure), on le ferme d'abord.
      if (document.pictureInPictureElement) await document.exitPictureInPicture().catch(() => {});
      // Chrome reprend d'habitude la taille de la fenetre precedente.
      const win = await documentPictureInPicture.requestWindow({
        width: OPEN_W,
        height: Math.round(OPEN_W / RATIO),
      });
      mount(win, video, page, chatOn);
      releaseFocus(win); // Chrome donne le clavier a la fenetre PiP en l'ouvrant
      return { status: "opened" };
    } finally {
      opening = false;
    }
  }

  // Son de l'onglet coupe ou remis ailleurs (raccourci, audio solo) : l'icone suit.
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "doc-pip-muted" && state && state.showMuted) state.showMuted(!!msg.muted);
  });

  const isAlive = () => {
    try {
      return !!chrome.runtime.id;
    } catch {
      return false;
    }
  };

  // Module PiP coupe (popup, interrupteur maitre) : on laisse le PiP natif.
  let moduleOn = true;
  const readModule = ({ modules, masterEnabled }) => {
    moduleOn = masterEnabled !== false && (!modules || modules.pip !== false);
  };
  chrome.storage.local.get(["modules", "masterEnabled"]).then(readModule, () => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.modules || changes.masterEnabled)) {
      chrome.storage.local.get(["modules", "masterEnabled"]).then(readModule, () => {});
    }
  });

  // Repli quand la fenetre maison n'a pas pu s'ouvrir : le PiP natif que
  // BTTV voulait, encore porte par son clic.
  function nativeFallback(video) {
    if (!video || !video.isConnected || video.ownerDocument !== document) return;
    document.documentElement.setAttribute(NATIVE_ATTR, "");
    video.requestPictureInPicture().catch((err) => {
      document.documentElement.removeAttribute(NATIVE_ATTR);
      console.warn("[DocPiP] PiP natif impossible aussi:", err.message);
    });
  }

  // Bouton PiP de BTTV : player.js (monde MAIN) a detourne son appel au PiP
  // natif et attend notre accord (preventDefault). Le clic compte encore comme
  // geste : la fenetre maison s'ouvre tout de suite, sans PiP natif. Sans
  // accord (extension rechargee, module coupe), BTTV ouvre son PiP natif.
  document.addEventListener("trinitx-pip-request", (e) => {
    if (!isAlive() || !moduleOn) return;
    e.preventDefault();
    if (state) {
      state.win.close(); // pagehide remet la video en place
      return;
    }
    const video = e.target instanceof HTMLVideoElement ? e.target : pickVideo();
    open(video)
      .then((r) => {
        if (r.status === "opened") return;
        console.warn("[DocPiP] fenetre maison non ouverte:", r.status);
        nativeFallback(video);
      })
      .catch((err) => {
        console.warn("[DocPiP] fenetre maison impossible:", err.message);
        nativeFallback(video);
      });
  }, true);

  // Fenetre ouverte : la video n'est plus dans le lecteur, BTTV ne trouve plus
  // rien a mettre en PiP et son bouton ne ferait rien. Son clic la referme.
  document.addEventListener("click", (e) => {
    if (!state || !isAlive()) return;
    const btn = e.target instanceof Element && e.target.closest("#bttv-picture-in-picture, #bttv-picture-in-picture-wrapper");
    if (!btn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    state.win.close();
  }, true);

  // Autre PiP natif (menu de Chrome, script d'un autre monde) : remplace par
  // la fenetre maison. Le PiP natif a consomme le clic (requestWindow
  // refuserait, mesure) : background.js rouvre avec le faux geste du
  // debugger, comme pour le raccourci. S'il echoue, le PiP natif reste.
  // L'evenement ne remonte pas : on l'ecoute en phase de capture.
  document.addEventListener("enterpictureinpicture", (e) => {
    const root = document.documentElement;
    if (root.hasAttribute(NATIVE_ATTR)) {
      root.removeAttribute(NATIVE_ATTR); // repli natif voulu
      return;
    }
    if (!(e.target instanceof HTMLVideoElement) || state || !isAlive() || !moduleOn) return;
    chrome.runtime.sendMessage({ type: "doc-pip-from-native" }).catch((err) => {
      console.warn("[DocPiP] PiP maison impossible, PiP natif garde:", err.message);
    });
  }, true);

  window.__trinitxDocPip = { open, isAlive };
  document.documentElement.setAttribute(READY_ATTR, "");
})();
