import { Buffer } from 'node:buffer'

import type { Plugin } from 'vite'

import {
  createSourceSanitizer,
  sanitizeSourceComments,
  SUPPORTED_LANGUAGES,
} from './sanitizer.js'
import type {
  IMouthwashDictionaryOptions,
  ISanitizeSourceOptions,
  SupportedLanguage,
} from './sanitizer.js'
import { sanitizeSourceMapObject } from './source-map.js'

export { sanitizeSourceComments, SUPPORTED_LANGUAGES }
export type {
  IMouthwashDictionaryOptions,
  ISanitizeSourceOptions,
  SupportedLanguage,
}

/**
 * Configures the Vite source-map mouthwash plugin.
 */
export interface IMapMouthwashOptions extends IMouthwashDictionaryOptions {
  /**
   * Selects source-map inputs that may be sanitized.
   *
   * Return `false` for generated, vendored, or otherwise exempt source paths.
   */
  filter?: (sourcePath: string) => boolean
  /**
   * Prints a concise Vite build summary when at least one comment was changed.
   * The default is `false`.
   */
  report?: boolean
}

/**
 * Converts a Rollup/Vite asset source into UTF-8 text.
 *
 * @param source - Text or binary asset content supplied by the bundler.
 * @returns The original string or a UTF-8 decoding of the byte array.
 */
function sourceText(source: string | Uint8Array): string {
  return typeof source === 'string' ? source : new TextDecoder().decode(source)
}

const inlineSourceMapPattern =
  /^([ \t]*\/\/[#@][ \t]*sourceMappingURL[ \t]*=[ \t]*)data:application\/json((?:;[^,\r\n]*)?),([^\r\n]+?)[ \t]*$/gmu

/**
 * Contains rewritten chunk code and statistics for embedded source maps.
 */
interface IInlineMapResult {
  code: string
  changedComments: number
  changedMaps: number
  changedSources: number
}

/**
 * Sanitizes source maps embedded in JavaScript source-map directives.
 *
 * Both Base64 and percent-encoded `data:application/json` payloads are decoded,
 * traversed, and encoded back into their original representation. Invalid data
 * URLs are retained byte-for-byte. Only standalone line-comment directives are
 * recognized, avoiding accidental changes to ordinary application strings.
 *
 * @param code - Rendered output-chunk code that may contain inline source maps.
 * @param sanitizer - Reusable source-comment sanitizer for `sourcesContent`.
 * @param filter - Optional source-path predicate shared with external maps.
 * @returns Rewritten code and aggregate mutation counts.
 */
function sanitizeInlineSourceMaps(
  code: string,
  sanitizer: ReturnType<typeof createSourceSanitizer>,
  filter: ((sourcePath: string) => boolean) | undefined,
): IInlineMapResult {
  const result: IInlineMapResult = {
    code,
    changedComments: 0,
    changedMaps: 0,
    changedSources: 0,
  }

  /**
   * Rewrites one inline source-map directive matched by the surrounding scan.
   *
   * @param directive - Complete original directive, returned on any parse failure.
   * @param prefix - Directive text before the `data:` URL.
   * @param parameters - MIME parameters, including an optional `base64` marker.
   * @param payload - Encoded JSON source-map payload.
   * @returns The original directive or its sanitized equivalent.
   */
  function replaceInlineSourceMap(
    directive: string,
    prefix: string,
    parameters: string,
    payload: string,
  ): string {
    const isBase64 = /(?:^|;)base64(?:;|$)/u.test(parameters)
    let parsed: unknown

    try {
      const json = isBase64
        ? Buffer.from(payload, 'base64').toString('utf8')
        : decodeURIComponent(payload)
      parsed = JSON.parse(json)
    } catch {
      return directive
    }

    const clean = sanitizeSourceMapObject(parsed, sanitizer, filter)
    if (clean.changedComments === 0) return directive

    const json = JSON.stringify(parsed)
    const encoded = isBase64
      ? Buffer.from(json, 'utf8').toString('base64')
      : encodeURIComponent(json)

    result.changedComments += clean.changedComments
    result.changedMaps += 1
    result.changedSources += clean.changedSources

    return `${prefix}data:application/json${parameters},${encoded}`
  }

  result.code = code.replace(inlineSourceMapPattern, replaceInlineSourceMap)

  return result
}

/**
 * Creates a post-enforced Vite build plugin that sanitizes emitted source maps.
 *
 * The plugin changes only comment text stored in `sourcesContent`. It processes
 * mutable chunk maps, `.map` assets, and inline Base64/percent-encoded maps while
 * leaving generated JavaScript and mapping coordinates intact. Source maps are
 * not enabled automatically; configure Vite's `build.sourcemap` separately.
 *
 * @param options - Dictionary, filtering, masking, and reporting configuration.
 * @returns A Vite plugin restricted to build mode.
 * @throws {TypeError} When dictionary languages or the mask are invalid.
 *
 * @example
 * ```ts
 * import { defineConfig } from 'vite'
 * import mapMouthwash from 'vite-plugin-map-mouthwash'
 *
 * export default defineConfig({
 *   plugins: [mapMouthwash({ languages: ['en', 'ru'] })],
 *   build: { sourcemap: true },
 * })
 * ```
 */
export function mapMouthwash(options: IMapMouthwashOptions = {}): Plugin {
  const sanitizer = createSourceSanitizer(options)

  return {
    name: 'vite-plugin-map-mouthwash',
    apply: 'build',
    enforce: 'post',

    /**
     * Traverses final chunks and assets immediately before Vite writes them.
     *
     * @param _outputOptions - Bundler output options; intentionally unused.
     * @param bundle - Mutable output bundle containing chunks and assets.
     * @returns Nothing; matching source-map structures are mutated in place.
     */
    generateBundle(_outputOptions, bundle) {
      let changedComments = 0
      let changedMaps = 0
      let changedSources = 0

      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk') {
          if (output.map) {
            const clean = sanitizeSourceMapObject(
              output.map,
              sanitizer,
              options.filter,
            )

            if (clean.changedComments > 0) {
              changedMaps += 1
              changedComments += clean.changedComments
              changedSources += clean.changedSources
            }
          }

          const inline = sanitizeInlineSourceMaps(
            output.code,
            sanitizer,
            options.filter,
          )
          output.code = inline.code
          changedMaps += inline.changedMaps
          changedComments += inline.changedComments
          changedSources += inline.changedSources

          continue
        }

        if (
          output.type !== 'asset' ||
          !output.fileName.toLowerCase().endsWith('.map')
        ) {
          continue
        }

        const originalSource = output.source
        let parsed: unknown

        try {
          parsed = JSON.parse(sourceText(originalSource))
        } catch {
          continue
        }

        const clean = sanitizeSourceMapObject(
          parsed,
          sanitizer,
          options.filter,
        )

        if (clean.changedComments === 0) continue

        const serialized = JSON.stringify(parsed)
        output.source =
          typeof originalSource === 'string'
            ? serialized
            : new TextEncoder().encode(serialized)
        changedMaps += 1
        changedComments += clean.changedComments
        changedSources += clean.changedSources
      }

      if (options.report && changedComments > 0) {
        this.info(
          `map-mouthwash: masked profanity in ${changedComments} comment(s), ${changedSources} source(s), ${changedMaps} source map(s).`,
        )
      }
    },
  }
}

export default mapMouthwash
