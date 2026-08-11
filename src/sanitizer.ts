import { ProfanityEngine } from 'profanity-guard'

import { findCommentBodies } from './comments.js'
import type { ICommentBodyRange } from './comments.js'

export const SUPPORTED_LANGUAGES = ['ar', 'en', 'es', 'fr', 'ru'] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const DEFAULT_LANGUAGES = ['en'] as const satisfies readonly SupportedLanguage[]

const COMMENT_WORD_PATTERN =
  /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:[@$+!*][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu
const OBFUSCATION_PATTERN = /[@$+!*]/u
const ALPHANUMERIC_PATTERN = /[\p{L}\p{N}]/gu

const LANGUAGE_SCRIPT_PATTERNS: Record<SupportedLanguage, RegExp> = {
  ar: /\p{Script=Arabic}/u,
  en: /\p{Script=Latin}/u,
  es: /\p{Script=Latin}/u,
  fr: /\p{Script=Latin}/u,
  ru: /\p{Script=Cyrillic}/u,
}

const BUILT_IN_ALLOW_WORDS: Partial<
  Record<SupportedLanguage, readonly string[]>
> = {
  en: ['cipa', 'hoare', 'root', 'sex', 'sm', 'xx', 'xxx'],
  fr: ['con', 'cons', 'queue'],
}

const BUILT_IN_ADD_WORDS: Partial<
  Record<SupportedLanguage, readonly string[]>
> = {
  ru: [
    'блять',
    'ебучая',
    'пизда',
    'пиздеца',
    'пиздецкий',
    'схуяли',
    'хуйнуть',
    'хуйню',
  ],
}

/**
 * Configures the dictionaries and replacement behavior shared by every API.
 */
export interface IMouthwashDictionaryOptions {
  /**
   * Languages whose built-in dictionaries are enabled.
   *
   * The default is {@link DEFAULT_LANGUAGES}. Select additional languages
   * explicitly to avoid unrelated dictionaries matching ordinary code terms.
   */
  languages?: readonly SupportedLanguage[]
  /**
   * One UTF-16 code unit used to mask every matched code unit.
   *
   * Multi-unit characters are rejected because they would shift source-map
   * columns. The default mask is `*`.
   */
  mask?: string
  /** Project-specific words matched independently of the enabled languages. */
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
 * @param languages - Requested language codes, or `undefined` for the defaults.
 * @returns A new array containing validated, unique language codes.
 * @throws {TypeError} When a runtime caller supplies an unsupported language.
 */
function resolvedLanguages(
  languages: readonly SupportedLanguage[] | undefined,
): SupportedLanguage[] {
  const values = languages ?? DEFAULT_LANGUAGES
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
 * Associates one profanity engine with the writing system it is allowed to
 * inspect. Custom words omit the script restriction.
 */
interface IProfanityMatcher {
  engine: ProfanityEngine
  script?: RegExp
  builtIn: boolean
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
 * reused across every source in a build. Comment bodies are split into words
 * before checking so Markdown punctuation and code operators cannot become
 * wildcard profanity matches. Project-specific words use a separate matcher
 * that works even when no built-in language is enabled.
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
  const matchers: IProfanityMatcher[] = []

  for (const language of languages) {
    matchers.push({
      engine: new ProfanityEngine({
        language,
        addWords: copyWords(BUILT_IN_ADD_WORDS[language]),
        whitelist: [
          ...copyWords(BUILT_IN_ALLOW_WORDS[language]),
          ...allowWords,
        ],
      }),
      script: LANGUAGE_SCRIPT_PATTERNS[language],
      builtIn: true,
    })
  }

  if (addWords.length > 0) {
    matchers.push({
      engine: new ProfanityEngine({
        dictionary: addWords,
        whitelist: allowWords,
      }),
      builtIn: false,
    })
  }

  /**
   * Checks whether one comment token matches any applicable dictionary.
   *
   * Built-in dictionaries are constrained to their native script. Very short
   * obfuscated tokens are skipped because punctuation such as `x*y` is common
   * in code comments and otherwise acts as a wildcard in the upstream engine.
   *
   * @param token - One word-like token extracted from a comment body.
   * @returns `true` when the complete token should be masked.
   */
  function isProfaneToken(token: string): boolean {
    for (const matcher of matchers) {
      if (matcher.script && !matcher.script.test(token)) continue

      if (
        matcher.builtIn &&
        OBFUSCATION_PATTERN.test(token) &&
        (token.match(ALPHANUMERIC_PATTERN)?.length ?? 0) < 3
      ) {
        continue
      }

      if (matcher.engine.check(token)) return true
    }

    return false
  }

  /**
   * Applies every configured dictionary to one comment body token by token.
   *
   * @param comment - Comment text without syntax delimiters.
   * @returns Masked text with exactly the same UTF-16 length as the input.
   */
  function cleanComment(comment: string): string {
    return comment.replace(COMMENT_WORD_PATTERN, (token) =>
      isProfaneToken(token) ? mask.repeat(token.length) : token,
    )
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

      if (ranges.length === 0 || matchers.length === 0) {
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
