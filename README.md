# TRINITX Extensions perso

Suite perso regroupant 11 modules + 1 action utilitaire dans une seule
extension, avec un popup pour activer/désactiver chacun.

| Module                           | Site(s)            | Ce qu'il fait                                                                                                                                |
| -------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **PiP hotkey + mute**            | YouTube, Twitch    | `Ctrl+Shift+1` ouvre/ferme le PiP du dernier onglet PiP (même Chrome en arrière-plan), `Ctrl+Shift+2` mute/démute cet onglet                 |
| **X — Tri par likes**            | x.com, twitter.com | Trie les réponses par nombre de likes                                                                                                        |
| **X — Auto-scroll**              | x.com              | Reprend ta position de lecture sur le fil                                                                                                    |
| **X — Block en 1 clic**          | x.com              | Icône discrète sur chaque tweet pour bloquer l'auteur en un clic (avec annulation)                                                           |
| **X — Masquer les partenariats** | x.com              | Cache les tweets marqués « Partenariat rémunéré » (contenus sponsorisés) et la suite du thread quand l'auteur enchaîne des réponses          |
| **X — Thème Dim**                | x.com, twitter.com | Restaure le thème bleu « Dim » par-dessus le mode sombre actuel (fond, textes, bordures, scrollbar)                                          |
| **Twitch — VOD sub-only**        | twitch.tv          | Débloque la lecture des VOD réservées aux abonnés (intègre [TwitchNoSub](https://github.com/besuper/TwitchNoSub))                            |
| **Twitch — Anti-pub (vaft)**     | twitch.tv          | Bloque les pubs des lives (variante _vaft_ de [TwitchAdSolutions](https://github.com/pixeltris/TwitchAdSolutions))                           |
| **Twitch — Preview au survol**   | twitch.tv          | Preview vidéo en direct de la chaîne au survol d'un streamer dans les listes (sidebar, accueil, catégories, recherche) ; muette, flottante   |
| **YouTube — Vitesse perso**      | youtube.com        | Boutons `−` / `+` dans le lecteur pour régler la vitesse au-delà de 2x (jusqu'à 16x) ; clic sur le chiffre = retour à 1x                     |
| **YouTube — Pas de traduction**  | youtube.com        | Garde titres, descriptions et audio en langue d'origine (intègre [YouTube-No-Translation](https://github.com/YouG-o/YouTube-No-Translation)) |
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
    ├── x-hide-sponsored/content.js  # monde ISOLATED, masque les partenariats rémunérés
    ├── x-dim-theme/content.js     # monde ISOLATED, restaure le thème Dim (CSS)
    ├── youtube-custom-speed/content.js  # monde ISOLATED, widget vitesse perso
    ├── twitch-nosub/             # vendoré depuis besuper/TwitchNoSub (Apache-2.0)
    │   ├── restriction-remover.js # ISOLATED, retire les overlays sub-only
    │   ├── twitchnosub.js         # ISOLATED, injecte app.js dans le monde MAIN
    │   ├── chrome/app.js          # MAIN, definit patch_url (CDN jsdelivr)
    │   ├── app.js                 # MAIN, surcharge window.Worker
    │   └── LICENSE                # Apache-2.0 (attribution)
    ├── twitch-ads-vaft/main.js    # MAIN, anti-pub live (pixeltris/TwitchAdSolutions, vaft)
    ├── twitch-preview/content.js  # ISOLATED, preview video live au survol (iframe player)
    └── youtube-no-translation/   # vendoré depuis YouG-o/... (AGPL-3.0)
        ├── dist/content/content.js     # ISOLATED, orchestre tout
        ├── dist/content/scripts/*.js   # MAIN (web_accessible_resources)
        ├── dist/popup/settings.html    # page de réglages (sous-titres, langues, API)
        └── LICENSE                     # AGPL-3.0 (attribution)
```

Les modules « content script » (X) sont enregistrés/retirés dynamiquement via
`chrome.scripting.registerContentScripts()` selon les toggles. Le module PiP est
piloté par les commandes clavier + `chrome.debugger`.

## Le module « Block en 1 clic »

Ajoute une petite icône grise (cercle barré) à gauche du « … » de chaque tweet.
Un clic bloque l'auteur **immédiatement** via l'API web interne de X (la même que
le bouton « Bloquer » natif appelle, avec ta session ; ce n'est **pas** l'API
développeur payante). Un toast « Bloqué @user — **Annuler** » s'affiche ~6 s pour
revenir en arrière, et le tweet est grisé en attendant.

L'icône reste discrète (gris au repos, à peine plus marquée au survol) et
apparaît sur le fil, les pages de tweet et les fils de réponses.

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
- **Modifs locales** : seuls deux changements par rapport au build amont — les
  chemins `getURL("dist/…")` re-préfixés en
  `getURL("modules/youtube-no-translation/dist/…")`, et le toast de don
  (`askForSupport`) désactivé par défaut. Pour soutenir l'auteur :
  [ko-fi.com/yougo](https://ko-fi.com/yougo).
- **Mise à jour** : re-télécharger la release Chromium, ré-appliquer ces deux
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
(**Apache-2.0**, besuper) et `modules/youtube-no-translation/` (**AGPL-3.0**,
YouG-o). L'AGPL est un copyleft fort : si cette extension venait à être
**distribuée**, la combinaison serait concernée. Pour un usage **perso non
distribué**, c'est sans incidence pratique.
