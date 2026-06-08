# TRINITX Extensions perso

Suite perso regroupant 3 modules dans une seule extension, avec un popup pour
activer/désactiver chacun.

| Module                | Site(s)            | Ce qu'il fait                                                                                                                |
| --------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **PiP hotkey + mute** | YouTube, Twitch    | `Ctrl+Shift+1` ouvre/ferme le PiP du dernier onglet PiP (même Chrome en arrière-plan), `Ctrl+Shift+2` mute/démute cet onglet |
| **X — Tri par likes** | x.com, twitter.com | Trie les réponses par nombre de likes                                                                                        |
| **X — Auto-scroll**   | x.com              | Reprend ta position de lecture sur le fil                                                                                    |

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
    └── x-auto-scroll/content.js   # monde ISOLATED, scroll position
```

Les modules « content script » (X) sont enregistrés/retirés dynamiquement via
`chrome.scripting.registerContentScripts()` selon les toggles. Le module PiP est
piloté par les commandes clavier + `chrome.debugger`.

## Le bandeau jaune de débogage (module PiP)

Ouvrir un PiP à distance fait clignoter ~1 s le bandeau « ... a commencé à
déboguer ce navigateur ». Fermer un PiP et muter n'attachent **jamais** le
débogueur. Pour supprimer totalement le bandeau, lance Chrome avec
`--silent-debugger-extension-api` (voir le README de l'ancien dossier
pip-remote pour les détails).

## Notes

- **TwitchNoSub** n'est volontairement **pas** inclus (extension tierce, qui
  bénéficie de ses propres mises à jour).
- Pour ajouter un site au tri/scroll X : éditer `host_permissions` et les
  `matches` dans `background.js`.

## Licence

[MIT](LICENSE) © 2026 TRINITX
