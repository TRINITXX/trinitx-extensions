# TRINITX Extensions perso

Suite perso regroupant 17 modules + 1 action utilitaire dans une seule
extension, avec un popup pour activer/désactiver chacun.

| Module                           | Site(s)            | Ce qu'il fait                                                                                                                                |
| -------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **PiP hotkey + mute**            | YouTube, Twitch    | `Ctrl+Shift+1` ouvre/ferme le PiP du dernier onglet PiP (même Chrome en arrière-plan), `Ctrl+Shift+2` mute/démute l'onglet réellement en PiP (jamais l'onglet actif) |
| **X — Tri par likes**            | x.com, twitter.com | Trie les réponses par nombre de likes                                                                                                        |
| **X — Auto-scroll**              | x.com              | Reprend ta position de lecture sur le fil                                                                                                    |
| **X — Block en 1 clic**          | x.com              | Icône discrète sur chaque tweet pour bloquer l'auteur en un clic (avec annulation)                                                           |
| **X — Masquer la sélection**     | x.com              | Clic droit sur une sélection → « Masquer sur X » : ajoute le texte aux mots masqués (de tout le monde, sans limite) via une fenêtre invisible |
| **X — Masquer les partenariats** | x.com              | Cache les tweets marqués « Partenariat rémunéré » (contenus sponsorisés) et la suite du thread quand l'auteur enchaîne des réponses          |
| **X — Masquer par pays**         | x.com              | Masque les tweets des comptes basés dans les pays de ta liste (provenance « About this account » de X) ; liste par défaut : Afrique, Inde, Pakistan ; pastille en haut à droite pour couper/remettre le filtre à la volée |
| **X — Thème Dim**                | x.com, twitter.com | Restaure le thème bleu « Dim » par-dessus le mode sombre actuel (fond, textes, bordures, scrollbar)                                          |
| **X — Fil seul**                 | x.com, twitter.com | Masque la navigation de gauche et la colonne de droite (recherche, tendances, suggestions) sans déplacer le fil ; pastille discrète en haut à droite pour tout réafficher ; la cloche reste visible quand elle a des notifications non lues |
| **X — Mise en page figée**       | x.com, twitter.com | Un onglet X ouvert en arrière-plan est rendu au zoom 100 % puis zoomé à l'affichage sans que X ne remesure (barre de gauche restée « en grand », défilement horizontal) : l'onglet est rechargé pendant qu'il est encore en arrière-plan, donc rien ne se voit (sauf `x.com/home`, jamais touché) ; bouton « Réparer maintenant » dans le popup |
| **Twitch — VOD sub-only**        | twitch.tv          | Débloque la lecture des VOD réservées aux abonnés (intègre [TwitchNoSub](https://github.com/besuper/TwitchNoSub))                            |
| **Twitch — Anti-pub (vaft)**     | twitch.tv          | Bloque les pubs des lives (variante _vaft_ de [TwitchAdSolutions](https://github.com/pixeltris/TwitchAdSolutions))                           |
| **Twitch — Preview au survol**   | twitch.tv          | Preview vidéo en direct de la chaîne au survol d'un streamer dans les listes (sidebar, accueil, catégories, recherche) ; muette, flottante   |
| **Twitch — Limiteur de volume**  | twitch.tv          | Plafonne les pics de volume (cris) sans toucher au son normal ; curseur de seuil en dB (0 = aucune limite), marche aussi en PiP              |
| **Twitch — Audio solo**          | twitch.tv          | Un seul onglet Twitch audible à la fois : l'onglet actif prend le son, les autres sont mutés ; sur un onglet non-Twitch, le dernier onglet Twitch actif garde le son |
| **YouTube — Vitesse perso**      | youtube.com        | Boutons `−` / `+` dans le lecteur pour régler la vitesse au-delà de 2x (jusqu'à 16x) ; clic sur le chiffre = retour à 1x                     |
| **YouTube — Pas de traduction**  | youtube.com        | Garde titres, descriptions et audio en langue d'origine (intègre [YouTube-No-Translation](https://github.com/YouG-o/YouTube-No-Translation)) |
| **YouTube — Meilleure qualité**  | youtube.com        | Force automatiquement la plus haute résolution disponible (1080p, 1440p, 4K…) sur chaque vidéo, au lieu de la qualité « Auto »               |
| **Drapeaux emoji**               | toutes             | Windows n'a pas les glyphes de drapeaux et Chrome n'embarque pas de police de secours : les drapeaux s'affichent en deux lettres (`FR`, `MA`). Une police Twemoji limitée aux drapeaux est appliquée uniquement sur ces caractères, sans toucher au reste de la typographie |
| **Recharger les onglets**        | toutes             | Bouton qui recharge tous les onglets de la fenêtre active, avec filtres d'exclusion par patterns d'URL (joker `*`)                           |

## Installer

1. **Retire les anciennes extensions** dans `chrome://extensions` pour éviter les
   doublons / conflits de raccourcis : _PiP hotkey + mute_ (le standalone),
   _X Auto Sort by Likes_, _X Auto-Scroll_.
2. **Charger l'extension non empaquetée** → dossier `trinitx-extensions`.
3. Accepte la permission de débogage (nécessaire pour le PiP à distance).
4. Vérifie la portée **Global** des 2 raccourcis dans `chrome://extensions/shortcuts`.

## Le popup

Clique sur l'icône de l'extension → un interrupteur par module. L'état est
mémorisé dans `chrome.storage`.

- **ON** : appliqué immédiatement (injecté dans les onglets déjà ouverts) +
  enregistré pour les pages suivantes.
- **OFF** : plus aucune injection sur les nouvelles pages ; un onglet déjà ouvert
  s'arrête au prochain rechargement (Chrome ne permet pas de « décharger » un
  script en cours).

## Architecture

```
trinitx-extensions/
├── manifest.json          # permissions + commandes + popup (+ default_locale)
├── background.js          # orchestrateur : registration dynamique + PiP
├── popup.html / .css / .js
├── _locales/              # i18n de la page de réglages YNT (chrome.i18n)
└── modules/
    ├── x-auto-sort/main.js        # monde MAIN, intercepte fetch/XHR
    ├── x-auto-scroll/content.js   # monde ISOLATED, scroll position
    ├── x-quick-block/content.js   # monde ISOLATED, block 1 clic (API interne X)
    ├── x-mute-selection/content.js  # monde ISOLATED, pilote le formulaire natif des mots masqués
    ├── x-hide-sponsored/content.js  # monde ISOLATED, masque les partenariats rémunérés
    ├── x-hide-by-country/           # monde ISOLATED, masque les tweets par pays d'origine
    │   ├── countries.js             # liste canonique + défauts (partagée popup/content)
    │   └── content.js               # scan + AboutAccountQuery (API interne X) + cache IndexedDB
    ├── x-dim-theme/content.js     # monde ISOLATED, restaure le thème Dim (CSS)
    ├── x-focus-timeline/content.js # monde ISOLATED, masque les bandes latérales (CSS, visibility)
    ├── x-layout-refresh/content.js # monde ISOLATED, force X à remesurer la fenêtre
    ├── flag-emoji/                 # ISOLATED, tous les sites : drapeaux emoji
    │   ├── content.js              # detection canvas + FontFace + wrapping des drapeaux
    │   ├── TwemojiCountryFlags.woff2 # sous-ensemble Twemoji (drapeaux seuls, 78 Ko)
    │   └── NOTICE.md               # provenance + licences (Twemoji CC-BY 4.0)
    ├── youtube-custom-speed/content.js  # monde ISOLATED, widget vitesse perso
    ├── youtube-best-quality/main.js     # monde MAIN, force la meilleure qualité (API du lecteur)
    ├── twitch-nosub/             # vendoré depuis besuper/TwitchNoSub (Apache-2.0)
    │   ├── restriction-remover.js # ISOLATED, retire les overlays sub-only
    │   ├── twitchnosub.js         # ISOLATED, injecte app.js dans le monde MAIN
    │   ├── chrome/app.js          # MAIN, definit patch_url (CDN jsdelivr)
    │   ├── app.js                 # MAIN, surcharge window.Worker
    │   └── LICENSE                # Apache-2.0 (attribution)
    ├── twitch-ads-vaft/main.js    # MAIN, anti-pub live (pixeltris/TwitchAdSolutions, vaft)
    ├── twitch-preview/content.js  # ISOLATED, preview video live au survol (iframe player)
    ├── twitch-volume-limiter/content.js  # ISOLATED, limiteur de volume (Web Audio, anti-cri)
    └── youtube-no-translation/   # vendoré depuis YouG-o/... (AGPL-3.0)
        ├── dist/content/content.js     # ISOLATED, orchestre tout
        ├── dist/content/scripts/*.js   # MAIN (web_accessible_resources)
        ├── dist/popup/settings.html    # page de réglages (sous-titres, langues, API)
        └── LICENSE                     # AGPL-3.0 (attribution)
```

Les modules « content script » (X) sont enregistrés/retirés dynamiquement via
`chrome.scripting.registerContentScripts()` selon les toggles. Le module PiP est
piloté par les commandes clavier + `chrome.debugger`.
Le module « Twitch — Audio solo » vit lui aussi dans `background.js` : il écoute
`tabs.onActivated` / `windows.onFocusChanged` / `tabs.onUpdated` et pilote
`chrome.tabs.update({ muted })`.

## Le module « Block en 1 clic »

Ajoute une petite icône grise (cercle barré) à gauche du « … » de chaque tweet.
Un clic bloque l'auteur **immédiatement** via l'API web interne de X (la même que
le bouton « Bloquer » natif appelle, avec ta session ; ce n'est **pas** l'API
développeur payante). Un toast « Bloqué @user — **Annuler** » s'affiche ~6 s pour
revenir en arrière, et le tweet est grisé en attendant.

L'icône reste discrète (gris au repos, à peine plus marquée au survol) et
apparaît sur le fil, les pages de tweet et les fils de réponses.

## Le module « X — Masquer par pays »

Masque les tweets des comptes selon leur **pays d'origine** — la provenance que X
expose désormais dans « About this account » (`account_based_in`). Cette info
**n'est pas** dans la timeline : le module fait un appel GraphQL dédié
**`AboutAccountQuery`** par auteur croisé, signé par ta session (bearer web public
+ cookie `ct0`, exactement comme « Block en 1 clic » — **pas** l'API dev payante).

- **Liste de pays** modifiable dans le popup (lien _« Réglages pays »_) : recherche
  + cases à cocher (drapeau + nom). Cocher = masquer, décocher = ré-afficher. La
  blacklist est stockée dans `chrome.storage.local` (clé `hiddenCountries`) et le
  content script la relit **en direct** via `storage.onChanged`.
- **Par défaut** : les 54 pays d'Afrique + Inde + Pakistan + les buckets régionaux
  correspondants (`Africa`, `North Africa`, `South Asia`) — un compte peut n'être
  étiqueté qu'au niveau région. La source unique de la liste et des défauts est
  `modules/x-hide-by-country/countries.js` (partagée entre popup et content script).
- **Cache IndexedDB** (base `xHideByCountry`, TTL **180 jours**) : chaque compte
  n'est interrogé qu'une fois, puis masquage instantané. Un compte **jamais croisé**
  provoque un bref _flash_ (le tweet s'affiche puis disparaît le temps de résoudre
  son pays) ; ensuite plus jamais. **Throttle** 500 ms entre appels + backoff sur
  `429` (bascule POST/GET) pour rester sous les rate-limits.
- **Pastille de pause** en haut à droite de la page (à gauche de celle de « Fil
  seul ») : un clic coupe le filtre, un autre le remet. Grise quand le filtre
  tourne, **ambre** quand il est en pause. La bascule est **instantanée** : les
  tweets restent marqués (`data-xhbc-hidden`) et c'est une classe sur `<html>`
  qui neutralise la règle CSS de masquage — aucun parcours du DOM, aucun appel
  réseau, donc rien à ré-résoudre au retour. L'état est persisté
  (`chrome.storage.local.hideByCountryPaused`), donc **partagé entre tous les
  onglets X et conservé au rechargement**. En pause, aucun appel
  `AboutAccountQuery` n'est plus émis.
- Compte sans pays / privé / erreur API → **reste visible**.
- **OFF par défaut** : contrairement aux autres modules, il génère du trafic API en
  arrière-plan (un appel par auteur non caché), donc opt-in volontaire.

⚠️ **Maintenance** : le **bearer** et le **query id** de `AboutAccountQuery` sont
codés en dur dans `content.js`. Si X les fait tourner et que les appels échouent,
re-capturer les valeurs depuis une requête live et mettre à jour les constantes
(même logique que « Block en 1 clic »).

## Recharger les onglets

Le bouton **⟳ Recharger** (première carte du popup) recharge **tous les onglets
de la fenêtre active** — épinglés inclus. Un compte s'affiche en pied de popup
(ex. _« 7 rechargés · 2 ignorés »_).

Le lien **Filtres d'exclusion →** déplie une zone de texte pour exclure des
onglets du rechargement. Les patterns sont :

- **séparés par des virgules** ;
- comparés au **host + chemin** de l'URL, **sans le protocole**
  (ex. `www.youtube.com/watch?v=…`) ;
- avec `*` comme **joker** (n'importe quoi, y compris vide), insensibles à la
  casse, et **ancrés** (le pattern doit décrire l'URL entière).

Exemple : `*.youtube.com/*, *.twitch.tv/*` ignore toutes les pages YouTube et
Twitch. Note : `*.youtube.com/*` exige un sous-domaine (à cause du point) ; pour
attraper aussi `youtube.com` nu, écrire `*youtube.com/*`. Les patterns sont
mémorisés dans `chrome.storage.local` (clé `reloadSkipPatterns`). Les onglets non
rechargeables (`chrome://`, Web Store…) sont ignorés silencieusement.

## Le module « Twitch — VOD sub-only »

Intègre [**TwitchNoSub**](https://github.com/besuper/TwitchNoSub) de **besuper**
(licence Apache-2.0, voir `modules/twitch-nosub/LICENSE`) pour lire les VOD
réservées aux abonnés.

Fonctionnement : deux content scripts s'enregistrent sur `twitch.tv` au
`document_start`. `restriction-remover.js` retire les overlays « sub-only » sur
les cartes de VOD ; `twitchnosub.js` injecte dans le monde **MAIN** un script qui
surcharge `window.Worker`, de sorte que le worker WASM du player Amazon IVS
`importScripts()` le patch **`patch_amazonworker.js`**. Ce patch intercepte
`fetch` et reconstruit la playlist `.m3u8` depuis l'API GQL publique de Twitch
quand `usher.ttvnw.net` refuse la VOD.

⚠️ **À savoir :**

- **Code distant** : le patch est chargé à l'exécution depuis le CDN
  `cdn.jsdelivr.net/gh/besuper/TwitchNoSub@master/...` (comme l'extension amont).
  Il se met donc à jour tout seul, mais dépend de jsdelivr et de la confiance
  envers le dépôt amont.
- **Activation** : comme le module s'accroche au `document_start`, **recharge
  l'onglet Twitch** après l'avoir activé pour qu'il prenne effet.
- C'est un projet **work in progress** côté amont ; certaines VOD (selon le type
  et l'ancienneté) peuvent ne pas fonctionner.

## Le module « Twitch — Anti-pub (vaft) »

Intègre [**TwitchAdSolutions**](https://github.com/pixeltris/TwitchAdSolutions)
de **pixeltris** (variante **vaft**, la plus récente et la plus complète :
mitigation du buffering, gestion HEVC…) pour bloquer les pubs des **lives**
Twitch. Vendoré tel quel (en-tête UserScript conservé pour la provenance et la
version).

Fonctionnement : le script s'enregistre comme content script monde **MAIN** sur
`twitch.tv` au `document_start` et surcharge `window.Worker` / `window.fetch`
pour réécrire la playlist `.m3u8` (segments de pub retirés, flux de secours).

⚠️ **À savoir :**

- **Activation** : comme le module s'accroche au `document_start`, **recharge
  l'onglet Twitch** après activation. Il est **ON par défaut**.
- **Coexistence avec « VOD sub-only »** : prévue par l'amont — le script détecte
  et réinsère le worker de TwitchNoSub dans la chaîne de prototypes. Les deux
  peuvent donc rester activés ensemble.
- Projet **work in progress** côté amont ; Twitch faisant évoluer ses défenses,
  l'efficacité peut varier. Mettre à jour = re-télécharger le `.user.js` amont
  (`vaft.user.js`) et remplacer `modules/twitch-ads-vaft/main.js`.

## Le module « Twitch — Limiteur de volume »

Insère un limiteur audio (`DynamicsCompressorNode` de la Web Audio API, réglé en
mode limiteur : genou dur, ratio 20:1, attaque 3 ms) entre le `<video>` du player
et la sortie, pour écrêter les pics de volume (cris, jingles) **sans toucher au
son normal**.

- **Curseur de seuil (en dB)** dans le popup, de `-40 dB` à `0 dB`. `0 dB` =
  aucune limite (son brut) ; plus tu descends, plus tôt les pics sont matés.
  Réglage **en temps réel** (le content script lit `chrome.storage.onChanged`),
  sans recharger. La valeur est mémorisée dans `chrome.storage.local` (clé
  `twitchLimiterThreshold`).
- **Genou dur** (`knee = 0`) : sous le seuil, gain inchangé → la voix normale
  passe intacte. Pas de makeup gain (le volume n'est jamais remonté).
- **Indépendant du volume Windows** : le limiteur agit sur le signal numérique,
  _avant_ le volume système. Le volume du player Twitch, lui, est _en amont_ du
  limiteur et influence donc le réglage efficace.
- **PiP** : fonctionne en Picture-in-Picture (c'est le même élément `<video>`,
  l'audio reste routé par la chaîne Web Audio).
- **S'arme au 1er geste** : l'AudioContext démarre « suspended » (autoplay
  policy) et se débloque au premier clic/touche sur la page. Avant ça, le son
  sort normalement, non filtré — donc jamais de coupure.
- **ON par défaut**, mais sans effet tant que le curseur est à `0 dB`. Comme tout
  module, le passer **OFF** ne prend effet qu'au rechargement de l'onglet.

## Le module « YouTube — Pas de traduction »

Intègre [**YouTube-No-Translation**](https://github.com/YouG-o/YouTube-No-Translation)
de **YouG-o** (licence **AGPL-3.0**, voir
`modules/youtube-no-translation/LICENSE`) pour garder le contenu YouTube dans sa
langue d'origine : titres, descriptions, **piste audio (anti-doublage)**,
miniatures et sous-titres.

Fonctionnement : le **build compilé upstream** est vendoré tel quel dans
`modules/youtube-no-translation/dist/`. Un content script ISOLATED
(`content.js`) s'enregistre au `document_start` sur `youtube.com` /
`youtube-nocookie.com` et injecte lui-même ses scripts du monde **MAIN**
(`content/scripts/*.js`, déclarés en `web_accessible_resources`) qui lisent
`ytInitialPlayerResponse` et l'**API interne InnerTube** de YouTube pour
récupérer les libellés non traduits.

⚠️ **À savoir :**

- **Activation** : comme le module s'accroche au `document_start`, **recharge
  l'onglet YouTube** après l'avoir activé.
- **Réglages** : le lien _« Réglages »_ de la carte ouvre la page de réglages
  upstream (`dist/popup/settings.html`) — c'est là qu'on active les sous-titres
  (OFF par défaut), qu'on choisit les langues audio/sous-titres, ou qu'on
  renseigne une clé **YouTube Data API v3** (optionnelle, sinon le fallback
  InnerTube same-origin suffit). Elle nécessite `_locales/` + `default_locale`
  (ajoutés au manifest) pour `chrome.i18n`.
- **Modifs locales** : trois changements par rapport au build amont — les
  chemins `getURL("dist/…")` re-préfixés en
  `getURL("modules/youtube-no-translation/dist/…")`, le toast de don
  (`askForSupport`) désactivé par défaut (pour soutenir l'auteur :
  [ko-fi.com/yougo](https://ko-fi.com/yougo)), et dans `dist/content/content.js`
  le `waitForElement` qui observe désormais `document.body || document.documentElement`
  (au `document_start` le `<body>` est encore `null` → `MutationObserver.observe`
  levait `parameter 1 is not of type 'Node'`).
- **Mise à jour** : re-télécharger la release Chromium, ré-appliquer ces trois
  patchs (le service worker `dist/background` et `dist/_locales` redondants sont
  retirés ; `_locales/` racine sert à l'i18n).

## Le bandeau jaune de débogage (module PiP)

Ouvrir un PiP à distance fait clignoter ~1 s le bandeau « ... a commencé à
déboguer ce navigateur ». Fermer un PiP et muter n'attachent **jamais** le
débogueur. Pour supprimer totalement le bandeau, lance Chrome avec
`--silent-debugger-extension-api` (voir le README de l'ancien dossier
pip-remote pour les détails).

## Notes

- **TwitchNoSub** est désormais intégré comme module (voir ci-dessus) ; il
  charge son patch depuis le CDN amont, donc il suit les mises à jour de besuper.
- Pour ajouter un site au tri/scroll X : éditer `host_permissions` et les
  `matches` dans `background.js`.

## Licence

[MIT](LICENSE) © 2026 TRINITX

Composants vendorés sous leur propre licence : `modules/twitch-nosub/`
(**Apache-2.0**, besuper), `modules/youtube-no-translation/` (**AGPL-3.0**,
YouG-o) et `modules/flag-emoji/TwemojiCountryFlags.woff2` (graphismes
**Twemoji**, **CC-BY 4.0**, via `country-flag-emoji-polyfill` de TalkJS, MIT —
voir `modules/flag-emoji/NOTICE.md`). L'AGPL est un copyleft fort : si cette extension venait à être
**distribuée**, la combinaison serait concernée. Pour un usage **perso non
distribué**, c'est sans incidence pratique.
