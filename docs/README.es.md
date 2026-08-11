# vite-plugin-map-mouthwash

[English](../README.md) · [Русский](README.ru.md) · [Français](README.fr.md) · **Español** · [العربية](README.ar.md)

`vite-plugin-map-mouthwash` enmascara palabras malsonantes dentro de los comentarios guardados en los mapas de código fuente. No modifica el código de la aplicación, las cadenas, las expresiones regulares ni las coordenadas del mapa.

Se admiten los diccionarios de árabe (`ar`), inglés (`en`), español (`es`), francés (`fr`) y ruso (`ru`). Solo el inglés está activado por defecto; selecciona los demás explícitamente para reducir falsos positivos en términos técnicos.

## Instalación

```bash
npm install --save-dev vite-plugin-map-mouthwash
```

## Configuración de Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import mapMouthwash from 'vite-plugin-map-mouthwash'

export default defineConfig({
  plugins: [mapMouthwash({ languages: ['es', 'en'] })],
  build: {
    sourcemap: true,
  },
})
```

Comentario original en `sourcesContent`:

```ts
// Esta mierda temporal debe eliminarse.
export const respuesta = 42
```

Después del procesamiento:

```ts
// Esta ****** temporal debe eliminarse.
export const respuesta = 42
```

Cada unidad UTF-16 detectada se sustituye por una unidad de máscara. Por eso las líneas y columnas del mapa no cambian.

## Opciones

```ts
mapMouthwash({
  languages: ['es', 'en'],
  mask: '█',
  addWords: ['términointerno'],
  allowWords: ['palabrapermitida'],
  includeDependencies: false,
  filter: (sourcePath) => !sourcePath.includes('/vendor/'),
  report: true,
})
```

- `languages` selecciona los diccionarios `ar`, `en`, `es`, `fr`, `ru`; el valor predeterminado es `['en']`;
- `mask` debe contener exactamente una unidad UTF-16;
- `addWords` incorpora vocabulario específico del proyecto independientemente de los idiomas;
- `allowWords` evita falsos positivos;
- `includeDependencies` incluye `node_modules`, que se omite por defecto;
- `filter` omite fuentes concretas después de comprobar las dependencias;
- `report` muestra un resumen de la compilación.

## Diccionarios y limitaciones

Las listas integradas proceden de la dependencia [`profanity-guard`](https://github.com/AkshayBenny/profanity-guard), que se instala automáticamente. Ningún filtro léxico conoce toda la jerga, todas las flexiones o todas las variantes regionales; usa `addWords` y `allowWords` para adaptarlo.

Los comentarios se comprueban palabra por palabra. Así, Markdown y operadores como `**all**`, `**и**` y `x*y` no se convierten en comodines del diccionario. Cada diccionario integrado se limita a su sistema de escritura, mientras que `addWords` funciona con cualquier escritura. Una pequeña lista de permitidos protege términos técnicos comunes; añade uno de ellos a `addWords` para forzar su enmascaramiento.

El plugin solo procesa `sourcesContent` y no activa los mapas automáticamente. Configura `build.sourcemap` en Vite.

## Ejemplo ejecutable

El proyecto [`examples/basic`](../examples/basic/README.md) muestra la limpieza de comentarios multilingües:

```bash
npm run example:build
npm run example:inspect
```

Consulta el [README en inglés](../README.md) para ver la referencia completa.
