/**
 * Describes the half-open character range occupied by a comment body.
 *
 * Delimiter characters such as `//`, `/*`, and `-->` are intentionally
 * excluded so callers can replace only human-readable comment text.
 */
export interface ICommentBodyRange {
  start: number
  end: number
}

const CONTROL_PAREN_KEYWORDS = new Set([
  'catch',
  'for',
  'if',
  'switch',
  'while',
  'with',
])

const REGEX_PREFIX_KEYWORDS = new Set([
  'await',
  'case',
  'delete',
  'do',
  'else',
  'in',
  'instanceof',
  'new',
  'of',
  'return',
  'throw',
  'typeof',
  'void',
  'yield',
])

const HTML_EXTENSIONS = new Set([
  'astro',
  'htm',
  'html',
  'svelte',
  'svg',
  'vue',
  'xml',
])
const CSS_EXTENSIONS = new Set(['css'])
const CSS_WITH_LINE_COMMENTS_EXTENSIONS = new Set([
  'less',
  'sass',
  'scss',
  'styl',
  'stylus',
])
const COMMENTLESS_EXTENSIONS = new Set([
  'avif',
  'bmp',
  'eot',
  'gif',
  'ico',
  'jpeg',
  'jpg',
  'json',
  'json5',
  'map',
  'otf',
  'pdf',
  'png',
  'tif',
  'tiff',
  'ttf',
  'webp',
  'woff',
  'woff2',
])

/**
 * Determines whether a UTF-16 code unit is JavaScript whitespace.
 *
 * @param character - The code unit to inspect. An empty string is accepted.
 * @returns `true` when the supplied value matches Unicode whitespace.
 */
function isWhitespace(character: string): boolean {
  return /\s/u.test(character)
}

/**
 * Performs the lightweight identifier-start check used by the comment lexer.
 *
 * Non-ASCII code units are treated as identifier characters. This permissive
 * rule lets the lexer safely skip identifiers written in supported languages
 * without attempting to reimplement the complete ECMAScript identifier spec.
 *
 * @param character - The code unit at the current lexer position.
 * @returns `true` when the code unit can begin an identifier token.
 */
function isIdentifierStart(character: string): boolean {
  if (character === '$' || character === '_') return true

  const code = character.charCodeAt(0)
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code >= 0x80
  )
}

/**
 * Determines whether a code unit may continue a lightweight identifier token.
 *
 * @param character - The code unit at the current lexer position.
 * @returns `true` for identifier starts and ASCII decimal digits.
 */
function isIdentifierPart(character: string): boolean {
  if (isIdentifierStart(character)) return true

  const code = character.charCodeAt(0)
  return code >= 48 && code <= 57
}

/**
 * Checks whether a code unit is an ASCII decimal digit.
 *
 * @param character - The code unit to inspect.
 * @returns `true` for characters from `0` through `9`.
 */
function isDigit(character: string): boolean {
  const code = character.charCodeAt(0)
  return code >= 48 && code <= 57
}

/**
 * Locates the end of the current physical source line.
 *
 * Both LF and CR line endings are recognized, and the returned position points
 * at the line-ending code unit rather than after it.
 *
 * @param source - Complete source text being scanned.
 * @param start - Position from which to search for a line ending.
 * @returns The first CR/LF position, or `source.length` when none exists.
 */
function lineEnd(source: string, start: number): number {
  let index = start

  while (index < source.length) {
    const character = source.charAt(index)
    if (character === '\n' || character === '\r') break
    index += 1
  }

  return index
}

/**
 * Skips a single- or double-quoted string without interpreting its contents.
 *
 * Escaped code units are skipped as a pair so comment-like text inside a string
 * is never reported as a source comment.
 *
 * @param source - Complete source text being scanned.
 * @param start - Position of the opening quote.
 * @param quote - Quote character that terminates the string.
 * @returns The position immediately after the closing quote, or the source end.
 */
function skipQuotedString(
  source: string,
  start: number,
  quote: '"' | "'",
): number {
  let index = start + 1

  while (index < source.length) {
    const character = source.charAt(index)

    if (character === '\\') {
      index += 2
      continue
    }

    index += 1
    if (character === quote) break
  }

  return index
}

/**
 * Skips an ECMAScript-style regular-expression literal.
 *
 * Character classes, escaped characters, and trailing regular-expression
 * flags are handled so `/` and `*` characters in a pattern are not mistaken
 * for comment delimiters.
 *
 * @param source - Complete source text being scanned.
 * @param start - Position of the regular expression's opening slash.
 * @returns The position after the literal and its flags, or the stopping point.
 */
function skipRegexLiteral(source: string, start: number): number {
  let index = start + 1
  let inCharacterClass = false

  while (index < source.length) {
    const character = source.charAt(index)

    if (character === '\\') {
      index += 2
      continue
    }

    if (character === '[') {
      inCharacterClass = true
      index += 1
      continue
    }

    if (character === ']' && inCharacterClass) {
      inCharacterClass = false
      index += 1
      continue
    }

    if (character === '/' && !inCharacterClass) {
      index += 1
      while (isIdentifierPart(source.charAt(index))) index += 1
      return index
    }

    if (character === '\n' || character === '\r') return index
    index += 1
  }

  return index
}

/**
 * Finds comment bodies in JavaScript-family source text.
 *
 * The purpose-built lexer distinguishes comments from quoted strings, template
 * text, template expressions, regular expressions, numeric tokens, and division
 * operators. It supports line, block, and hashbang comments while keeping all
 * returned offsets in the original UTF-16 coordinate space.
 *
 * @param source - JavaScript, TypeScript, JSX, or TSX source text.
 * @returns Ordered comment-body ranges with delimiters excluded.
 */
function javascriptCommentBodies(source: string): ICommentBodyRange[] {
  const ranges: ICommentBodyRange[] = []

  /**
   * Skips raw template-literal text and recursively scans `${...}` expressions.
   *
   * @param start - Position of the opening backtick.
   * @returns The position after the closing backtick, or the source end.
   */
  function scanTemplate(start: number): number {
    let index = start + 1

    while (index < source.length) {
      const character = source.charAt(index)

      if (character === '\\') {
        index += 2
        continue
      }

      if (character === '`') return index + 1

      if (character === '$' && source.charAt(index + 1) === '{') {
        index = scanCode(index + 2, true)
        continue
      }

      index += 1
    }

    return index
  }

  /**
   * Scans executable JavaScript text and records every comment body encountered.
   *
   * @param start - Position at which code scanning begins.
   * @param stopOnClosingBrace - Whether an unmatched `}` ends this recursive scan.
   * @returns The position at which scanning stopped.
   */
  function scanCode(start: number, stopOnClosingBrace: boolean): number {
    let index = start
    let braceDepth = 0
    let canStartRegex = true
    let pendingControlParen = false
    const controlParens: boolean[] = []

    while (index < source.length) {
      const character = source.charAt(index)
      const next = source.charAt(index + 1)

      if (isWhitespace(character)) {
        index += 1
        continue
      }

      if (index === 0 && character === '#' && next === '!') {
        const end = lineEnd(source, index + 2)
        ranges.push({ start: index + 2, end })
        index = end
        continue
      }

      if (character === '/' && next === '/') {
        const end = lineEnd(source, index + 2)
        ranges.push({ start: index + 2, end })
        index = end
        continue
      }

      if (character === '/' && next === '*') {
        const close = source.indexOf('*/', index + 2)
        const end = close === -1 ? source.length : close
        ranges.push({ start: index + 2, end })
        index = close === -1 ? source.length : close + 2
        continue
      }

      if (character === '"' || character === "'") {
        index = skipQuotedString(source, index, character)
        canStartRegex = false
        pendingControlParen = false
        continue
      }

      if (character === '`') {
        index = scanTemplate(index)
        canStartRegex = false
        pendingControlParen = false
        continue
      }

      if (character === '/' && canStartRegex) {
        index = skipRegexLiteral(source, index)
        canStartRegex = false
        pendingControlParen = false
        continue
      }

      if (isIdentifierStart(character)) {
        const wordStart = index
        index += 1
        while (isIdentifierPart(source.charAt(index))) index += 1

        const word = source.slice(wordStart, index)
        pendingControlParen = CONTROL_PAREN_KEYWORDS.has(word)
        canStartRegex = REGEX_PREFIX_KEYWORDS.has(word)
        continue
      }

      if (isDigit(character)) {
        index += 1
        while (/[_\p{L}\p{N}.]/u.test(source.charAt(index))) index += 1
        canStartRegex = false
        pendingControlParen = false
        continue
      }

      if (character === '(') {
        controlParens.push(pendingControlParen)
        pendingControlParen = false
        canStartRegex = true
        index += 1
        continue
      }

      if (character === ')') {
        canStartRegex = controlParens.pop() ?? false
        pendingControlParen = false
        index += 1
        continue
      }

      if (character === '{') {
        braceDepth += 1
        canStartRegex = true
        pendingControlParen = false
        index += 1
        continue
      }

      if (character === '}') {
        if (stopOnClosingBrace && braceDepth === 0) return index + 1
        braceDepth = Math.max(0, braceDepth - 1)
        canStartRegex = false
        pendingControlParen = false
        index += 1
        continue
      }

      if (
        (character === '+' || character === '-') &&
        next === character
      ) {
        index += 2
        canStartRegex = false
        pendingControlParen = false
        continue
      }

      if (character === ']' || character === '.') {
        canStartRegex = false
        pendingControlParen = false
        index += 1
        continue
      }

      if (character === '/') {
        canStartRegex = true
        pendingControlParen = false
        index += next === '=' ? 2 : 1
        continue
      }

      canStartRegex = '([,;:=!?~%^&|*+<>-'.includes(character)
      pendingControlParen = false
      index += 1
    }

    return index
  }

  scanCode(0, false)
  return ranges
}

/**
 * Applies the conservative start rule for Sass/Less/Stylus line comments.
 *
 * Requiring a structural or whitespace predecessor avoids treating the second
 * slash in unquoted URLs such as `https://example.test` as a comment.
 *
 * @param source - Stylesheet source text.
 * @param index - Position of the first slash in a possible `//` delimiter.
 * @returns `true` when a line comment may safely begin at the supplied position.
 */
function cssLineCommentCanStart(source: string, index: number): boolean {
  if (index === 0) return true
  return /[\s{};,)]/u.test(source.charAt(index - 1))
}

/**
 * Finds comment bodies in CSS and CSS-preprocessor source text.
 *
 * Quoted strings are skipped before comment delimiters are considered. Standard
 * CSS block comments are always recognized; preprocessor line comments can be
 * enabled independently for Sass, Less, and Stylus-family inputs.
 *
 * @param source - Stylesheet source text to inspect.
 * @param allowLineComments - Whether conservative `//` comments are recognized.
 * @returns Ordered comment-body ranges with their delimiters excluded.
 */
function cssCommentBodies(
  source: string,
  allowLineComments: boolean,
): ICommentBodyRange[] {
  const ranges: ICommentBodyRange[] = []
  let index = 0

  while (index < source.length) {
    const character = source.charAt(index)
    const next = source.charAt(index + 1)

    if (character === '"' || character === "'") {
      index = skipQuotedString(source, index, character)
      continue
    }

    if (character === '/' && next === '*') {
      const close = source.indexOf('*/', index + 2)
      const end = close === -1 ? source.length : close
      ranges.push({ start: index + 2, end })
      index = close === -1 ? source.length : close + 2
      continue
    }

    if (
      allowLineComments &&
      character === '/' &&
      next === '/' &&
      cssLineCommentCanStart(source, index)
    ) {
      const end = lineEnd(source, index + 2)
      ranges.push({ start: index + 2, end })
      index = end
      continue
    }

    index += 1
  }

  return ranges
}

/**
 * Finds the end of an HTML opening tag while respecting quoted attributes.
 *
 * @param source - Complete HTML-family source text.
 * @param start - Position of the opening `<` character.
 * @returns The position after `>`, or `source.length` for an unterminated tag.
 */
function tagEnd(source: string, start: number): number {
  let index = start
  let quote: '"' | "'" | undefined

  while (index < source.length) {
    const character = source.charAt(index)

    if (quote) {
      if (character === '\\') {
        index += 2
        continue
      }
      if (character === quote) quote = undefined
      index += 1
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
      index += 1
      continue
    }

    if (character === '>') return index + 1
    index += 1
  }

  return index
}

/**
 * Locates a matching HTML `script` or `style` closing tag.
 *
 * Candidate substrings are accepted only when followed by whitespace, `>`, or
 * the end of input, preventing names such as `</scripted>` from ending a block.
 *
 * @param lowerSource - Lower-cased copy of the complete source text.
 * @param tagName - Embedded-language element whose closing tag is required.
 * @param start - Position at which the search begins.
 * @returns The closing tag's `<` position, or `lowerSource.length` if absent.
 */
function closingTagStart(
  lowerSource: string,
  tagName: 'script' | 'style',
  start: number,
): number {
  const needle = `</${tagName}`
  let index = lowerSource.indexOf(needle, start)

  while (index !== -1) {
    const boundary = lowerSource.charAt(index + needle.length)
    if (!boundary || /[\s>]/u.test(boundary)) return index
    index = lowerSource.indexOf(needle, index + needle.length)
  }

  return lowerSource.length
}

/**
 * Moves ranges found in an embedded source fragment into document coordinates.
 *
 * @param ranges - Fragment-relative comment-body ranges.
 * @param offset - Absolute document position at which the fragment starts.
 * @returns New ranges expressed relative to the containing document.
 */
function offsetRanges(
  ranges: ICommentBodyRange[],
  offset: number,
): ICommentBodyRange[] {
  const shifted: ICommentBodyRange[] = []

  for (const range of ranges) {
    shifted.push({
      start: range.start + offset,
      end: range.end + offset,
    })
  }

  return shifted
}

/**
 * Finds comments in HTML-family component files and their embedded languages.
 *
 * Native HTML comments and JSX/Svelte-style `{/* ... *\/}` comments are
 * recognized directly. Contents of `<script>` and `<style>` elements are then
 * delegated to the JavaScript or stylesheet scanners, including preprocessor
 * line comments selected through a `lang` attribute.
 *
 * @param source - HTML, Vue, Svelte, or Astro source text.
 * @returns Ordered comment-body ranges in document coordinates.
 */
function htmlCommentBodies(source: string): ICommentBodyRange[] {
  const ranges: ICommentBodyRange[] = []
  const lowerSource = source.toLowerCase()
  let index = 0

  while (index < source.length) {
    if (source.startsWith('<!--', index)) {
      const close = source.indexOf('-->', index + 4)
      const end = close === -1 ? source.length : close
      ranges.push({ start: index + 4, end })
      index = close === -1 ? source.length : close + 3
      continue
    }

    if (source.startsWith('{/*', index)) {
      const close = source.indexOf('*/}', index + 3)
      const end = close === -1 ? source.length : close
      ranges.push({ start: index + 3, end })
      index = close === -1 ? source.length : close + 3
      continue
    }

    if (source.charAt(index) === '<') {
      const match = source.slice(index).match(/^<\s*(script|style)\b/iu)

      if (match?.[1]) {
        const tagName = match[1].toLowerCase() as 'script' | 'style'
        const bodyStart = tagEnd(source, index)
        const bodyEnd = closingTagStart(lowerSource, tagName, bodyStart)
        const body = source.slice(bodyStart, bodyEnd)

        if (tagName === 'script') {
          ranges.push(...offsetRanges(javascriptCommentBodies(body), bodyStart))
        } else {
          const openingTag = source.slice(index, bodyStart).toLowerCase()
          const allowsLineComments =
            /\blang\s*=\s*["']?(?:less|sass|scss|styl|stylus)\b/u.test(
              openingTag,
            )
          ranges.push(
            ...offsetRanges(
              cssCommentBodies(body, allowsLineComments),
              bodyStart,
            ),
          )
        }

        index = bodyEnd
        continue
      }
    }

    index += 1
  }

  return ranges
}

/**
 * Extracts a normalized filename extension while ignoring query and hash data.
 *
 * @param sourceName - Source-map path, optionally containing plugin query data.
 * @returns A lower-case extension without `.`, or an empty string when absent.
 */
function extensionOf(sourceName: string): string {
  const withoutQuery = sourceName.split(/[?#]/u, 1)[0] ?? sourceName
  const match = withoutQuery.toLowerCase().match(/\.([a-z0-9]+)$/u)
  return match?.[1] ?? ''
}

/**
 * Selects the appropriate syntax scanner and returns every comment body.
 *
 * Vite virtual module queries such as `?type=script` and `?type=style` take
 * precedence over the physical extension. Unknown source types deliberately use
 * the JavaScript scanner because most Vite source-map inputs are JS-family text.
 * Structured data and common binary asset formats are treated as commentless.
 *
 * @param source - Exact `sourcesContent` text to inspect.
 * @param sourceName - Associated source-map path used for syntax selection.
 * @returns Ordered half-open ranges containing comment text only.
 */
export function findCommentBodies(
  source: string,
  sourceName: string,
): ICommentBodyRange[] {
  const lowerName = sourceName.toLowerCase()

  if (/[?&]type=style(?:&|$)/u.test(lowerName)) {
    return cssCommentBodies(
      source,
      /(?:lang[.=](?:less|sass|scss|styl|stylus))/u.test(lowerName),
    )
  }

  if (/[?&]type=script(?:&|$)/u.test(lowerName)) {
    return javascriptCommentBodies(source)
  }

  const extension = extensionOf(sourceName)

  if (HTML_EXTENSIONS.has(extension)) return htmlCommentBodies(source)
  if (CSS_EXTENSIONS.has(extension)) return cssCommentBodies(source, false)
  if (CSS_WITH_LINE_COMMENTS_EXTENSIONS.has(extension)) {
    return cssCommentBodies(source, true)
  }
  if (COMMENTLESS_EXTENSIONS.has(extension)) return []

  return javascriptCommentBodies(source)
}
