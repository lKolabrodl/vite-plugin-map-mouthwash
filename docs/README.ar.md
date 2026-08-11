# vite-plugin-map-mouthwash

[English](../README.md) · [Русский](README.ru.md) · [Français](README.fr.md) · [Español](README.es.md) · **العربية**

تقوم إضافة `vite-plugin-map-mouthwash` بإخفاء الألفاظ النابية داخل التعليقات المحفوظة في خرائط المصدر. لا تغيّر الإضافة كود التطبيق أو السلاسل النصية أو التعابير النمطية أو إحداثيات الخريطة.

تدعم الإضافة قواميس العربية (`ar`) والإنجليزية (`en`) والإسبانية (`es`) والفرنسية (`fr`) والروسية (`ru`). تُفعّل الإنجليزية فقط افتراضياً، ويجب اختيار القواميس الأخرى صراحةً لتقليل النتائج الإيجابية الخاطئة في المصطلحات التقنية.

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
  addWords: ['مصطلحداخلي'],
  allowWords: ['كلمةمسموحة'],
  includeDependencies: false,
  filter: (sourcePath) => !sourcePath.includes('/vendor/'),
  report: true,
})
```

- يحدد `languages` القواميس `ar` و`en` و`es` و`fr` و`ru`، والقيمة الافتراضية هي `['en']`؛
- يجب أن يحتوي `mask` على وحدة UTF-16 واحدة تماماً؛
- يضيف `addWords` كلمات خاصة بالمشروع بغض النظر عن اللغات المختارة؛
- يمنع `allowWords` النتائج الإيجابية الخاطئة؛
- يضيف `includeDependencies` فحص `node_modules` المستبعد افتراضياً؛
- يستبعد `filter` بعض ملفات المصدر بعد فحص الاعتماديات؛
- يعرض `report` ملخصاً بعد البناء.

## القواميس والقيود

تأتي القوائم المدمجة من الاعتمادية [`profanity-guard`](https://github.com/AkshayBenny/profanity-guard)، ويتم تثبيتها تلقائياً. لا يستطيع المرشح القائم على القاموس معرفة كل اللهجات والتصريفات والكتابات المتعمدة، لذلك يمكن تخصيصه بواسطة `addWords` و`allowWords`.

يُفحص التعليق كلمةً كلمة، لذلك لا تتحول علامات Markdown والعوامل مثل `**all**` و`**и**` و`x*y` إلى أحرف بدل في القاموس. يقتصر كل قاموس مدمج على نظام كتابته، بينما تعمل `addWords` مع أي نظام كتابة. تحمي قائمة سماح صغيرة المصطلحات التقنية الشائعة؛ ويمكن إضافة أي منها إلى `addWords` لفرض إخفائه.

تعالج الإضافة `sourcesContent` فقط ولا تفعّل خرائط المصدر بنفسها. يجب ضبط `build.sourcemap` في Vite.

## مثال قابل للتشغيل

يوضح المشروع [`examples/basic`](../examples/basic/README.md) تنظيف تعليقات بعدة لغات:

```bash
npm run example:build
npm run example:inspect
```

راجع [README الإنجليزي](../README.md) للحصول على المرجع الكامل.
