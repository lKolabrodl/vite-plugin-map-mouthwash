# vite-plugin-map-mouthwash

[English](../README.md) · [Русский](README.ru.md) · **Français** · [Español](README.es.md) · [العربية](README.ar.md)

`vite-plugin-map-mouthwash` masque les grossièretés présentes dans les commentaires enregistrés dans les source maps. Le code de l’application, les chaînes, les expressions régulières et les coordonnées de la carte restent inchangés.

Les dictionnaires arabe (`ar`), anglais (`en`), espagnol (`es`), français (`fr`) et russe (`ru`) sont pris en charge. Seul l’anglais est activé par défaut ; sélectionnez explicitement les autres dictionnaires afin de limiter les faux positifs dans le vocabulaire technique.

## Installation

```bash
npm install --save-dev vite-plugin-map-mouthwash
```

## Configuration Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import mapMouthwash from 'vite-plugin-map-mouthwash'

export default defineConfig({
  plugins: [mapMouthwash({ languages: ['fr', 'en'] })],
  build: {
    sourcemap: true,
  },
})
```

Commentaire original dans `sourcesContent` :

```ts
// Cette merde temporaire doit être supprimée.
export const réponse = 42
```

Après le traitement :

```ts
// Cette ***** temporaire doit être supprimée.
export const réponse = 42
```

Chaque unité UTF-16 détectée est remplacée par une unité de masque. Les lignes et les colonnes de la source map restent donc stables.

## Options

```ts
mapMouthwash({
  languages: ['fr', 'en'],
  mask: '█',
  addWords: ['termeinterne'],
  allowWords: ['motautorisé'],
  includeDependencies: false,
  filter: (sourcePath) => !sourcePath.includes('/vendor/'),
  report: true,
})
```

- `languages` sélectionne les dictionnaires `ar`, `en`, `es`, `fr`, `ru` ; la valeur par défaut est `['en']` ;
- `mask` doit contenir exactement une unité UTF-16 ;
- `addWords` ajoute le vocabulaire propre au projet indépendamment des langues ;
- `allowWords` corrige les faux positifs ;
- `includeDependencies` inclut `node_modules`, exclu par défaut ;
- `filter` ignore certaines sources après le contrôle des dépendances ;
- `report` affiche un résumé de la compilation.

## Dictionnaires et limites

Les listes intégrées proviennent de la dépendance [`profanity-guard`](https://github.com/AkshayBenny/profanity-guard), installée automatiquement. Un filtre lexical ne couvre jamais tout l’argot, toutes les flexions ni toutes les variantes régionales ; utilisez `addWords` et `allowWords` pour l’adapter.

Le commentaire est analysé mot par mot. Le Markdown et les opérateurs comme `**all**`, `**и**` et `x*y` ne deviennent donc pas des jokers du dictionnaire. Chaque dictionnaire intégré est limité à son système d’écriture, tandis que `addWords` fonctionne avec toutes les écritures. Une petite liste d’autorisation protège les termes techniques courants ; ajoutez un tel terme à `addWords` pour forcer son masquage.

Le plugin ne traite que `sourcesContent` et n’active pas les source maps. Configurez `build.sourcemap` dans Vite.

## Exemple exécutable

Le projet [`examples/basic`](../examples/basic/README.md) montre le nettoyage de commentaires multilingues :

```bash
npm run example:build
npm run example:inspect
```

Consultez le [README anglais](../README.md) pour la référence complète.
