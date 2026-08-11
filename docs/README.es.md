# vite-plugin-map-mouthwash

[English](../README.md) · [Русский](README.ru.md) · [Français](README.fr.md) · **Español** · [العربية](README.ar.md)

`vite-plugin-map-mouthwash` enmascara palabras malsonantes dentro de los comentarios guardados en los mapas de código fuente. No modifica el código de la aplicación, las cadenas, las expresiones regulares ni las coordenadas del mapa.

Los diccionarios de árabe (`ar`), inglés (`en`), español (`es`), francés (`fr`) y ruso (`ru`) están activados por defecto. El chino se excluye intencionadamente por ahora.

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
  addWords: ['término-interno'],
  allowWords: ['palabra-permitida'],
  filter: (sourcePath) => !sourcePath.includes('/vendor/'),
  report: true,
})
```

- `languages` selecciona los diccionarios `ar`, `en`, `es`, `fr`, `ru`;
- `mask` debe contener exactamente una unidad UTF-16;
- `addWords` incorpora vocabulario específico del proyecto;
- `allowWords` evita falsos positivos;
- `filter` omite fuentes concretas;
- `report` muestra un resumen de la compilación.

## Diccionarios y limitaciones

Las listas integradas proceden de la dependencia [`profanity-guard`](https://github.com/AkshayBenny/profanity-guard), que se instala automáticamente. Ningún filtro léxico conoce toda la jerga, todas las flexiones o todas las variantes regionales; usa `addWords` y `allowWords` para adaptarlo.

El plugin solo procesa `sourcesContent` y no activa los mapas automáticamente. Configura `build.sourcemap` en Vite.

## Ejemplo ejecutable

El proyecto [`examples/basic`](../examples/basic/README.md) muestra la limpieza de comentarios multilingües:

```bash
npm run example:build
npm run example:inspect
```

Consulta el [README en inglés](../README.md) para ver la referencia completa.
