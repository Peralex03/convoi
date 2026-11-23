# Convoi

Tableau de marche d’un convoi : heures de passage, haltes, groupes. Tout reste sur l’appareil.

Prototype. App web autonome, dans le style de Calque : un seul `index.html`, sans serveur, données sur l’appareil, partage par QR, lien, fichier ou PDF.

- À la racine : la version construite, prête à publier (GitHub Pages).
- `src/` : sources (`shared/` socle commun, `convoi/engine.js` calcul, `convoi/app.js` interface) et `build.mjs`.

Construire : dans `src/`, `npm install`, puis `node build.mjs convoi` (sortie dans `src/dist/convoi/`).

Les textes tirés des règlements sont des reformulations courtes ; les règlements en vigueur font foi. Outil d’instruction et de préparation : ne pas y saisir d’informations classifiées.
