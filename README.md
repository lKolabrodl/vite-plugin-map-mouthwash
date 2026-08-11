# vite-plugin-map-mouthwash

**English** · [Русский](docs/README.ru.md) · [Français](docs/README.fr.md) · [Español](docs/README.es.md) · [العربية](docs/README.ar.md)

`vite-plugin-map-mouthwash` masks profanity found in comments stored inside source maps. It does not modify application code, string literals, regular expressions, or source-map coordinates.

Five official UN languages are enabled by default. Chinese is deliberately excluded for now.

| Language | Code | Enabled by default |
| --- | --- | --- |
| Arabic | `ar` | Yes |
| English | `en` | Yes |
| French | `fr` | Yes |
| Russian | `ru` | Yes |
| Spanish | `es` | Yes |

## Installation

```bash
npm install --save-dev vite-plugin-map-mouthwash
```

## Vite configuration

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import mapMouthwash from 'vite-plugin-map-mouthwash'

export default defineConfig({
  plugins: [mapMouthwash()],
  build: {
    sourcemap: true,
  },
})
```

Before the plugin runs, `sourcesContent` may contain:

```js
// This shit workaround should be removed.
export const answer = 42
```

After the plugin runs:

```js
// This **** workaround should be removed.
export const answer = 42
```

The plugin replaces every matched UTF-16 code unit with one mask code unit. Source length, lines, and columns therefore remain stable. Deleting words outright would shift later source-map coordinates, so masking is intentional.

## Options

```ts
mapMouthwash({
  languages: ['en', 'ru'],
  mask: '█',
  addWords: ['project-specific-term'],
  allowWords: ['allowed-term'],
  filter: (sourcePath) => !sourcePath.includes('/vendor/'),
  report: true,
})
```

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `languages` | `('ar' \| 'en' \| 'es' \| 'fr' \| 'ru')[]` | all five | Select built-in dictionaries. |
| `mask` | `string` | `'*'` | Use exactly one UTF-16 code unit as the mask. |
| `addWords` | `string[]` | `[]` | Add project-specific blocked words. |
| `allowWords` | `string[]` | `[]` | Exempt known false positives. |
| `filter` | `(sourcePath) => boolean` | all sources | Skip selected source-map inputs. |
| `report` | `boolean` | `false` | Print a build summary when comments change. |

## Standalone sanitizer

The comment sanitizer can also be used without Vite:

```ts
import { sanitizeSourceComments } from 'vite-plugin-map-mouthwash'

const clean = sanitizeSourceComments('// This is shit.', {
  filename: 'src/main.ts',
  languages: ['en'],
})

console.log(clean) // // This is ****.
```

## Dictionaries

The built-in dictionaries currently come from the runtime dependency [`profanity-guard`](https://github.com/AkshayBenny/profanity-guard). They are installed automatically with this package and are not duplicated under `src/`. Use `addWords` and `allowWords` to adapt the dictionaries to a project.

Dictionary filters are imperfect by nature. New slang, inflected forms, regional usage, and intentional obfuscation may need custom entries. Legitimate words may need allow-list entries.

## Supported source forms

- `//`, `/* ... */`, and hashbang comments in JavaScript and TypeScript;
- JSX and TSX block comments;
- comments inside `${...}` template expressions, but not raw template text;
- CSS block comments and `//` comments in Sass, SCSS, Less, and Stylus;
- HTML comments plus embedded `<script>` and `<style>` blocks in HTML, Vue, Svelte, and Astro;
- standard, indexed, external, hidden, Base64-inline, and percent-encoded inline source maps.

The plugin only sanitizes `sourcesContent`. It does not create source maps, so `build.sourcemap` must be enabled. Maps emitted without source content have nothing to sanitize.

## Runnable example

See [`examples/basic`](examples/basic/README.md) for a small Vite project containing multilingual comments and an unchanged string literal.

```bash
npm run example:build
npm run example:inspect
```

## Development

```bash
npm install
npm test
npm run test:coverage
npm run check
```

Tests live in [`__tests__`](__tests__) and enforce 100% function coverage across `src`.

## Security note

Source maps can expose complete source code, not only comments. This plugin is not a secret scanner and does not remove credentials, personal data, or other sensitive content.

## License

MIT
