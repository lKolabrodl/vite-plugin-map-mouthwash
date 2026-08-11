# Basic Vite example

This project demonstrates the plugin against a real Vite application build.

The input file [`src/main.ts`](src/main.ts) contains the same five-language phrase twice:

```ts
const preservedText = 'shit merde mierda блять متناك'

// shit merde mierda блять متناك
```

Only the comment inside the emitted source map is sanitized:

```ts
const preservedText = 'shit merde mierda блять متناك'

// **** ***** ****** ***** *****
```

From the repository root, run:

```bash
npm install
npm run example:build
npm run example:inspect
```

The build writes `examples/basic/dist/assets/index.js.map`. The inspection command verifies that the comment was masked and the ordinary string literal was preserved.

The example imports the plugin directly from `src` so it always demonstrates the current checkout. In an external project, replace that import with:

```ts
import mapMouthwash from 'vite-plugin-map-mouthwash'
```
