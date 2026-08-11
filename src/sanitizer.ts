import { ProfanityEngine } from 'profanity-guard'

import { findCommentBodies } from './comments.js'
import type { ICommentBodyRange } from './comments.js'

export const SUPPORTED_LANGUAGES = ['ar', 'en', 'es', 'fr', 'ru'] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

/**
 * Configures the dictionaries and replacement behavior shared by every API.
 */
export interface IMouthwashDictionaryOptions {
  /**
   * Languages whose built-in dictionaries are enabled.
   *
   * The default is all values from {@link SUPPORTED_LANGUAGES}.
   */
  languages?: readonly SupportedLanguage[]
  /**
   * One UTF-16 code unit used to mask every matched code unit.
   *
   * Multi-unit characters are rejected because they would shift source-map
   * columns. The default mask is `*`.
   */
  mask?: string
  /** Project-specific words added to every enabled dictionary. */
  addWords?: readonly string[]
  /** Words that must never be masked, even if a dictionary contains them. */
  allowWords?: readonly string[]
}

/**
 * Configures one direct call to {@link sanitizeSourceComments}.
 */
export interface ISanitizeSourceOptions extends IMouthwashDictionaryOptions {
  /**
   * Filename used to select JavaScript, stylesheet, or HTML comment syntax.
   * Defaults to `source.js`.
   */
  filename?: string
}

/**
 * Contains the sanitized source and the number of comment bodies that changed.
 */
export interface ISanitizedSource {
  /** Source text with matched profanity replaced by a length-preserving mask. */
  code: string
  /** Number of individual comment bodies changed by the sanitizer. */
  changedComments: number
}

const supportedLanguageSet = new Set<string>(SUPPORTED_LANGUAGES)

/**
 * Validates, deduplicates, and resolves the configured language sequence.
 *
 * Preserving the caller's order makes sequential dictionary application
 * deterministic while removing duplicate engine work.
 *
 * @param languages - Requested language codes, or `undefined` for all defaults.
 * @returns A new array containing validated, unique language codes.
 * @throws {TypeError} When a runtime caller supplies an unsupported language.
 */
function resolvedLanguages(
  languages: readonly SupportedLanguage[] | undefined,
): SupportedLanguage[] {
  const values = languages ?? SUPPORTED_LANGUAGES
  const unique: SupportedLanguage[] = []

  for (const language of values) {
    if (!supportedLanguageSet.has(language)) {
      throw new TypeError(
        `Unsupported language "${String(language)}". Expected one of: ${SUPPORTED_LANGUAGES.join(', ')}.`,
      )
    }
    if (!unique.includes(language)) unique.push(language)
  }

  return unique
}

/**
 * Resolves and validates the code unit used to mask matched profanity.
 *
 * @param mask - Caller-supplied mask, or `undefined` to use `*`.
 * @returns A single non-line-ending UTF-16 code unit.
 * @throws {TypeError} When the mask would change columns or introduce a newline.
 */
function resolvedMask(mask: string | undefined): string {
  const value = mask ?? '*'

  if (value.length !== 1 || value === '\n' || value === '\r') {
    throw new TypeError(
      'The mouthwash mask must be exactly one UTF-16 code unit so source-map columns stay unchanged.',
    )
  }

  return value
}

/**
 * Converts an optional readonly word list into an isolated mutable array.
 *
 * @param words - Optional user-provided dictionary entries.
 * @returns A shallow copy, or an empty array when no entries were supplied.
 */
function copyWords(words: readonly string[] | undefined): string[] {
  return words ? [...words] : []
}

/**
 * Represents a reusable sanitizer with prebuilt profanity engines.
 */
export interface ISourceSanitizer {
  /**
   * Masks profanity found inside comments for one source-map input.
   *
   * @param source - Exact source text from `sourcesContent`.
   * @param filename - Source-map path used to select comment syntax.
   * @returns Sanitized text plus a count of changed comment bodies.
   */
  sanitize(source: string, filename: string): ISanitizedSource
}

/**
 * Orders comment ranges by their opening UTF-16 position.
 *
 * @param left - First range being compared.
 * @param right - Second range being compared.
 * @returns A negative, zero, or positive number for `Array.prototype.sort`.
 */
function compareCommentRanges(
  left: ICommentBodyRange,
  right: ICommentBodyRange,
): number {
  return left.start - right.start
}

/**
 * Creates a reusable, length-preserving source-comment sanitizer.
 *
 * Profanity engines are initialized once per configured language and then
 * reused across every source in a build. When no built-in languages are enabled,
 * a custom dictionary engine is still created if `addWords` contains entries.
 *
 * @param options - Language, mask, custom-word, and allow-list configuration.
 * @returns A sanitizer suitable for direct use or source-map traversal.
 * @throws {TypeError} When a language or mask fails runtime validation.
 *
 * @example
 * ```ts
 * const sanitizer = createSourceSanitizer({ languages: ['en', 'ru'] })
 * sanitizer.sanitize('// shit блять', 'entry.ts')
 * // => { code: '// **** *****', changedComments: 1 }
 * ```
 */
export function createSourceSanitizer(
  options: IMouthwashDictionaryOptions = {},
): ISourceSanitizer {
  const languages = resolvedLanguages(options.languages)
  const mask = resolvedMask(options.mask)
  const addWords = copyWords(options.addWords)
  const allowWords = copyWords(options.allowWords)
  const engines: ProfanityEngine[] = []

  for (const language of languages) {
    engines.push(
      new ProfanityEngine({
        language,
        addWords,
        whitelist: allowWords,
      }),
    )
  }

  if (engines.length === 0 && addWords.length > 0) {
    engines.push(
      new ProfanityEngine({
        dictionary: addWords,
        whitelist: allowWords,
      }),
    )
  }

  /**
   * Applies every configured dictionary to one comment body in sequence.
   *
   * @param comment - Comment text without syntax delimiters.
   * @returns Masked text with exactly the same UTF-16 length as the input.
   * @throws {Error} If the underlying engine unexpectedly changes text length.
   */
  function cleanComment(comment: string): string {
    let result = comment

    for (const engine of engines) {
      const next = engine.censor(result, mask)

      if (next.length !== result.length) {
        throw new Error(
          'The profanity engine changed a comment length; refusing to corrupt source-map columns.',
        )
      }

      result = next
    }

    return result
  }

  return {
    /**
     * Sanitizes all recognized comment bodies while copying other source text.
     *
     * @param source - Exact source-map content to sanitize.
     * @param filename - Path used to choose the correct comment scanner.
     * @returns Sanitized source and the number of changed comments.
     */
    sanitize(source, filename) {
      const ranges = findCommentBodies(source, filename).sort(compareCommentRanges)

      if (ranges.length === 0 || engines.length === 0) {
        return { code: source, changedComments: 0 }
      }

      let code = ''
      let cursor = 0
      let changedComments = 0

      for (const range of ranges) {
        if (range.start < cursor || range.end < range.start) continue

        const comment = source.slice(range.start, range.end)
        const clean = cleanComment(comment)

        code += source.slice(cursor, range.start)
        code += clean
        cursor = range.end

        if (clean !== comment) changedComments += 1
      }

      code += source.slice(cursor)
      return { code, changedComments }
    },
  }
}

/**
 * Masks supported profanity found exclusively inside source-code comments.
 *
 * This convenience API builds a sanitizer for one call. Use
 * {@link createSourceSanitizer} when processing many sources so dictionary
 * engines can be reused. Strings, template text, regular expressions, and other
 * executable code are returned unchanged, and output length always matches input
 * length to preserve source-map line and column coordinates.
 *
 * @param source - Source text whose comments should be sanitized.
 * @param options - Dictionary options and an optional syntax-selecting filename.
 * @returns Sanitized source text with identical UTF-16 length.
 * @throws {TypeError} When an unsupported language or unsafe mask is supplied.
 *
 * @example
 * ```ts
 * sanitizeSourceComments('// shit', { filename: 'entry.js' })
 * // => '// ****'
 * ```
 */
export function sanitizeSourceComments(
  source: string,
  options: ISanitizeSourceOptions = {},
): string {
  const sanitizer = createSourceSanitizer(options)
  return sanitizer.sanitize(source, options.filename ?? 'source.js').code
}
