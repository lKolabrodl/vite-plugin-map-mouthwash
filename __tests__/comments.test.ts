import { describe, expect, it } from 'vitest'

import { findCommentBodies } from '../src/comments.js'

/**
 * Resolves scanner ranges into their exact source substrings for assertions.
 *
 * @param source - Complete source fixture passed to the comment scanner.
 * @param filename - Virtual filename used to select the scanner mode.
 * @returns Comment bodies in the order in which they appear in the fixture.
 */
function commentTexts(source: string, filename: string): string[] {
  return findCommentBodies(source, filename).map((range) =>
    source.slice(range.start, range.end),
  )
}

describe('findCommentBodies', () => {
  it('finds JavaScript comments without confusing strings or regex literals', () => {
    const source = [
      '#!/usr/bin/env node',
      'const text = "// not a comment";',
      "const escaped = '/* not a comment \\' */';",
      'const expression = /[/*]not-a-comment/giu;',
      'if (ready) /[/*]/.test(value);',
      'let count = 1; count++; count /= 2;',
      '// line comment',
      '/* block comment */',
      'const template = `raw // text ${value /* nested comment */}`;',
    ].join('\n')

    expect(commentTexts(source, 'entry.ts')).toEqual([
      '/usr/bin/env node',
      ' line comment',
      ' block comment ',
      ' nested comment ',
    ])
  })

  it('supports component files and embedded style preprocessors', () => {
    const source = [
      '<!-- html comment -->',
      '<div>{/* expression comment */}</div>',
      '<script>const text = "// literal"; // script comment\n</script>',
      '<style lang="scss">$url: https://example.test; // style comment\n</style>',
    ].join('\n')

    expect(commentTexts(source, 'Component.vue')).toEqual([
      ' html comment ',
      ' expression comment ',
      ' script comment',
      ' style comment',
    ])
  })

  it('selects syntax from Vite virtual-module queries', () => {
    expect(
      commentTexts(
        '$url: https://example.test; // query style',
        'Component.vue?vue&type=style&lang.scss',
      ),
    ).toEqual([' query style'])

    expect(
      commentTexts(
        'const value = "// literal"; // query script',
        'Component.vue?vue&type=script&lang.ts',
      ),
    ).toEqual([' query script'])
  })

  it('distinguishes standard CSS, preprocessors, and commentless formats', () => {
    expect(commentTexts('/* css */ // text', 'theme.css')).toEqual([' css '])
    expect(commentTexts('// less', 'theme.less')).toEqual([' less'])
    expect(commentTexts('// sass', 'theme.sass')).toEqual([' sass'])
    expect(commentTexts('// stylus', 'theme.stylus')).toEqual([' stylus'])
    expect(commentTexts('// ignored', 'data.json')).toEqual([])
    expect(commentTexts('// ignored', 'data.json5')).toEqual([])
    expect(commentTexts('// ignored', 'bundle.map')).toEqual([])
  })

  it('handles unterminated comments, strings, regexes, tags, and templates', () => {
    expect(commentTexts('/* open block', 'entry.js')).toEqual([' open block'])
    expect(commentTexts('// open line', 'entry.js')).toEqual([' open line'])
    expect(commentTexts('const value = "// string', 'entry.js')).toEqual([])
    expect(commentTexts('const value = /unterminated\n// line', 'entry.js')).toEqual([
      ' line',
    ])
    expect(commentTexts('const value = `raw ${1 /* nested', 'entry.js')).toEqual([
      ' nested',
    ])
    expect(commentTexts('<script>// open', 'page.html')).toEqual([' open'])
    expect(commentTexts('<!-- open', 'page.html')).toEqual([' open'])
  })
})
