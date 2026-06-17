# TRINITX Extensions perso

Suite perso regroupant 5 modules + 1 action utilitaire dans une seule
extension, avec un popup pour activer/désactiver chacun.

| Module                    | Site(s)            | Ce qu'il fait                                                                                                                |
| ------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **PiP hotkey + mute**     | YouTube, Twitch    | `Ctrl+Shift+1` ouvre/ferme le PiP du dernier onglet PiP (même Chrome en arrière-plan), `Ctrl+Shift+2` mute/démute cet onglet |
| **X — Tri par likes**     | x.com, twitter.com | Trie les réponses par nombre de likes                                                                                        |
| **X — Auto-scroll**       | x.com              | Reprend ta position de lecture sur le fil                                                                                    |
| **X — Block en 1 clic**   | x.com              | Icône discrète sur chaque tweet pour bloquer l'auteur en un clic (avec annulation)                                           |
| **Twitch — VOD sub-only** | twitch.tv          | Débloque la lecture des VOD réservées aux abonnés (intègre [TwitchNoSub](https://github.com/besuper/TwitchNoSub))            |
| **Recharger les onglets** | toutes             | Bouton qui recharge tous les onglets de la fenêtre active, avec filtres d'exclusion par patterns d'URL (joker `*`)           |

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
├── manifest.json          # permissions + commandes + popup
├── background.js          # orchestrateur : registration dynamique + PiP
├── popup.html / .css / .js
└── modules/
    ├── x-auto-sort/main.js        # monde MAIN, intercepte fetch/XHR
    ├── x-auto-scroll/content.js   # monde ISOLATED, scroll position
    ├── x-quick-block/content.js   # monde ISOLATED, block 1 clic (API interne X)
    └── twitch-nosub/             # vendoré depuis besuper/TwitchNoSub (Apache-2.0)
        ├── restriction-remover.js # ISOLATED, retire les overlays sub-only
        ├── twitchnosub.js         # ISOLATED, injecte app.js dans le monde MAIN
        ├── chrome/app.js          # MAIN, definit patch_url (CDN jsdelivr)
        ├── app.js                 # MAIN, surcharge window.Worker
        └── LICENSE                # Apache-2.0 (attribution)
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
