import type { ISourceSanitizer } from './sanitizer.js'

/**
 * Minimal mutable source-map shape required by the recursive sanitizer.
 */
interface IMutableSourceMap {
  sources?: unknown
  sourcesContent?: unknown
  sections?: unknown
}

/**
 * Minimal indexed-source-map section shape used during recursive traversal.
 */
interface ISourceMapSection {
  map?: unknown
}

/**
 * Summarizes mutations made while traversing one source-map object.
 */
export interface ISanitizeMapResult {
  /** Number of individual comment bodies that were changed. */
  changedComments: number
  /** Number of distinct `sourcesContent` entries that were changed. */
  changedSources: number
}

/**
 * Narrows an unknown value to a non-null string-keyed object.
 *
 * @param value - Runtime value to inspect before source-map property access.
 * @returns `true` when `value` is a non-null object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Recursively sanitizes `sourcesContent` entries in a mutable source-map object.
 *
 * Standard maps and indexed maps with nested `sections[].map` objects are both
 * supported. Missing, null, and non-string source contents are ignored. The
 * supplied filter receives each original source path before any scanning occurs.
 * The function mutates matching `sourcesContent` arrays in place and leaves all
 * mapping, name, and extension fields untouched.
 *
 * @param value - Unknown runtime value that may contain a source map.
 * @param sanitizer - Reusable source-comment sanitizer.
 * @param filter - Optional source-path predicate; return `false` to skip a source.
 * @returns Counts of changed source entries and comment bodies.
 *
 * @example
 * ```ts
 * const map = { sources: ['entry.js'], sourcesContent: ['// shit'] }
 * const result = sanitizeSourceMapObject(map, sanitizer, undefined)
 * // map.sourcesContent[0] === '// ****'
 * // result.changedSources === 1
 * ```
 */
export function sanitizeSourceMapObject(
  value: unknown,
  sanitizer: ISourceSanitizer,
  filter: ((sourcePath: string) => boolean) | undefined,
): ISanitizeMapResult {
  const result: ISanitizeMapResult = {
    changedComments: 0,
    changedSources: 0,
  }

  if (!isRecord(value)) return result

  const map = value as IMutableSourceMap
  const sources = Array.isArray(map.sources) ? map.sources : []
  const contents = Array.isArray(map.sourcesContent)
    ? map.sourcesContent
    : undefined

  if (contents) {
    for (let index = 0; index < contents.length; index += 1) {
      const content = contents[index]
      if (typeof content !== 'string') continue

      const mappedSource = sources[index]
      const sourcePath =
        typeof mappedSource === 'string' ? mappedSource : `source-${index}.js`

      if (filter && !filter(sourcePath)) continue

      const clean = sanitizer.sanitize(content, sourcePath)
      if (clean.changedComments === 0) continue

      contents[index] = clean.code
      result.changedSources += 1
      result.changedComments += clean.changedComments
    }
  }

  if (Array.isArray(map.sections)) {
    for (const sectionValue of map.sections) {
      if (!isRecord(sectionValue)) continue

      const section = sectionValue as ISourceMapSection
      const nested = sanitizeSourceMapObject(section.map, sanitizer, filter)
      result.changedSources += nested.changedSources
      result.changedComments += nested.changedComments
    }
  }

  return result
}
