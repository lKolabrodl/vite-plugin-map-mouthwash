# vite-plugin-map-mouthwash

[English](../README.md) · **Русский** · [Français](README.fr.md) · [Español](README.es.md) · [العربية](README.ar.md)

`vite-plugin-map-mouthwash` маскирует мат в комментариях, сохранённых внутри source map. Код приложения, строки, регулярные выражения и координаты карты не изменяются.

По умолчанию включены арабский (`ar`), английский (`en`), испанский (`es`), французский (`fr`) и русский (`ru`). Китайский пока намеренно исключён.

## Установка

```bash
npm install --save-dev vite-plugin-map-mouthwash
```

## Подключение к Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import mapMouthwash from 'vite-plugin-map-mouthwash'

export default defineConfig({
  plugins: [mapMouthwash({ languages: ['ru', 'en'] })],
  build: {
    sourcemap: true,
  },
})
```

Исходный комментарий в `sourcesContent`:

```ts
// Этот блять костыль нужно удалить.
export const answer = 42
```

После обработки:

```ts
// Этот ***** костыль нужно удалить.
export const answer = 42
```

Слово заменяется маской такой же длины, поэтому строки и колонки source map не сдвигаются.

## Настройки

```ts
mapMouthwash({
  languages: ['ru', 'en'],
  mask: '█',
  addWords: ['внутренний-термин'],
  allowWords: ['разрешённое-слово'],
  filter: (sourcePath) => !sourcePath.includes('/vendor/'),
  report: true,
})
```

- `languages` выбирает словари `ar`, `en`, `es`, `fr`, `ru`;
- `mask` должен состоять ровно из одного UTF-16 code unit;
- `addWords` добавляет слова проекта;
- `allowWords` устраняет ложные срабатывания;
- `filter` исключает отдельные исходники;
- `report` выводит статистику сборки.

## Словари и ограничения

Встроенные списки приходят из зависимости [`profanity-guard`](https://github.com/AkshayBenny/profanity-guard) и устанавливаются автоматически. Словарная фильтрация не может знать весь сленг и все формы слов, поэтому для проекта предусмотрены `addWords` и `allowWords`.

Плагин очищает только `sourcesContent` и не включает source map самостоятельно. В конфигурации Vite необходимо задать `build.sourcemap`.

## Запускаемый пример

Рабочий проект находится в [`examples/basic`](../examples/basic/README.md):

```bash
npm run example:build
npm run example:inspect
```

Полное описание API и поддерживаемых форматов находится в [английском README](../README.md).
