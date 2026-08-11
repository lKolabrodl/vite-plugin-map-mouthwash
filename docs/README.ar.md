# vite-plugin-map-mouthwash

[English](../README.md) · [Русский](README.ru.md) · [Français](README.fr.md) · [Español](README.es.md) · **العربية**

تقوم إضافة `vite-plugin-map-mouthwash` بإخفاء الألفاظ النابية داخل التعليقات المحفوظة في خرائط المصدر. لا تغيّر الإضافة كود التطبيق أو السلاسل النصية أو التعابير النمطية أو إحداثيات الخريطة.

تُفعّل افتراضياً قواميس العربية (`ar`) والإنجليزية (`en`) والإسبانية (`es`) والفرنسية (`fr`) والروسية (`ru`). اللغة الصينية مستثناة عمداً في الوقت الحالي.

## التثبيت

```bash
npm install --save-dev vite-plugin-map-mouthwash
```

## إعداد Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import mapMouthwash from 'vite-plugin-map-mouthwash'

export default defineConfig({
  plugins: [mapMouthwash({ languages: ['ar', 'en'] })],
  build: {
    sourcemap: true,
  },
})
```

التعليق الأصلي داخل `sourcesContent`:

```ts
// هذا الكود متناك ويجب حذفه.
export const answer = 42
```

بعد المعالجة:

```ts
// هذا الكود ***** ويجب حذفه.
export const answer = 42
```

تُستبدل كل وحدة UTF-16 مطابقة بوحدة قناع واحدة، ولذلك تبقى الأسطر والأعمدة في خريطة المصدر ثابتة.

## الخيارات

```ts
mapMouthwash({
  languages: ['ar', 'en'],
  mask: '█',
  addWords: ['مصطلح-داخلي'],
  allowWords: ['كلمة-مسموحة'],
  filter: (sourcePath) => !sourcePath.includes('/vendor/'),
  report: true,
})
```

- يحدد `languages` القواميس `ar` و`en` و`es` و`fr` و`ru`؛
- يجب أن يحتوي `mask` على وحدة UTF-16 واحدة تماماً؛
- يضيف `addWords` كلمات خاصة بالمشروع؛
- يمنع `allowWords` النتائج الإيجابية الخاطئة؛
- يستبعد `filter` بعض ملفات المصدر؛
- يعرض `report` ملخصاً بعد البناء.

## القواميس والقيود

تأتي القوائم المدمجة من الاعتمادية [`profanity-guard`](https://github.com/AkshayBenny/profanity-guard)، ويتم تثبيتها تلقائياً. لا يستطيع المرشح القائم على القاموس معرفة كل اللهجات والتصريفات والكتابات المتعمدة، لذلك يمكن تخصيصه بواسطة `addWords` و`allowWords`.

تعالج الإضافة `sourcesContent` فقط ولا تفعّل خرائط المصدر بنفسها. يجب ضبط `build.sourcemap` في Vite.

## مثال قابل للتشغيل

يوضح المشروع [`examples/basic`](../examples/basic/README.md) تنظيف تعليقات بعدة لغات:

```bash
npm run example:build
npm run example:inspect
```

راجع [README الإنجليزي](../README.md) للحصول على المرجع الكامل.
