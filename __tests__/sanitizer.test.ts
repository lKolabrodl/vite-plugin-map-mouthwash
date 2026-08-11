import { describe, expect, it } from 'vitest'

import {
  createSourceSanitizer,
  sanitizeSourceComments,
  SUPPORTED_LANGUAGES,
} from '../src/sanitizer.js'
import type { SupportedLanguage } from '../src/sanitizer.js'

describe('sanitizeSourceComments', () => {
  it('masks five UN languages only inside JavaScript comments', () => {
    const source = [
      'const literal = "shit // merde";',
      'const matcher = /[/*]shit/;',
      'const division = total / count;',
      '// shit, merde, mierda, блять, متناك',
      '/* shit */',
      'const template = `shit ${value /* merde */}`;',
      '// 操你妈',
    ].join('\n')

    const clean = sanitizeSourceComments(source, { filename: 'entry.ts' })

    expect(clean).toHaveLength(source.length)
    expect(clean).toContain('const literal = "shit // merde";')
    expect(clean).toContain('const matcher = /[/*]shit/;')
    expect(clean).toContain('const division = total / count;')
    expect(clean).toContain('// ****, *****, ******, *****, *****')
    expect(clean).toContain('/* **** */')
    expect(clean).toContain('const template = `shit ${value /* ***** */}`;')
    expect(clean).toContain('// 操你妈')
  })

  it('handles CSS strings, block comments, and preprocessor line comments', () => {
    const source = [
      '.label::after { content: "shit /* merde */"; }',
      '/* mierda */',
      '$endpoint: https://example.test/path;',
      '// блять',
    ].join('\n')

    const clean = sanitizeSourceComments(source, { filename: 'theme.scss' })

    expect(clean).toHaveLength(source.length)
    expect(clean).toContain('content: "shit /* merde */"')
    expect(clean).toContain('/* ****** */')
    expect(clean).toContain('https://example.test/path')
    expect(clean).toContain('// *****')
  })

  it('handles HTML and comments inside script and style elements', () => {
    const source = [
      '<!-- mierda -->',
      '<p>shit</p>',
      '<script>const label = "merde"; // merde\n</script>',
      '<style>.x::after { content: "mierda" } /* mierda */</style>',
    ].join('\n')

    const clean = sanitizeSourceComments(source, { filename: 'View.vue' })

    expect(clean).toHaveLength(source.length)
    expect(clean).toContain('<!-- ****** -->')
    expect(clean).toContain('<p>shit</p>')
    expect(clean).toContain('const label = "merde"; // *****')
    expect(clean).toContain('content: "mierda" } /* ****** */')
  })

  it('supports language selection, additions, an allow-list, and custom masks', () => {
    expect(
      sanitizeSourceComments('// shit merde', {
        filename: 'entry.js',
        languages: ['en'],
      }),
    ).toBe('// **** merde')

    expect(
      sanitizeSourceComments('// shit bananas', {
        filename: 'entry.js',
        languages: ['en'],
        addWords: ['bananas'],
        allowWords: ['shit'],
        mask: '#',
      }),
    ).toBe('// shit #######')

    expect(
      sanitizeSourceComments('// bananas', {
        filename: 'entry.js',
        languages: [],
        addWords: ['bananas'],
      }),
    ).toBe('// *******')
  })

  it('returns unchanged text when no engine or recognized comment is available', () => {
    const sanitizer = createSourceSanitizer({ languages: [] })

    expect(sanitizer.sanitize('// shit', 'entry.js')).toEqual({
      code: '// shit',
      changedComments: 0,
    })
    expect(
      createSourceSanitizer({ languages: ['en'] }).sanitize(
        '{"comment":"shit"}',
        'data.json',
      ),
    ).toEqual({ code: '{"comment":"shit"}', changedComments: 0 })
  })

  it('uses source.js when no filename is provided', () => {
    expect(sanitizeSourceComments('// shit', { languages: ['en'] })).toBe(
      '// ****',
    )
  })

  it('rejects unsupported languages and masks that shift columns', () => {
    expect(() =>
      createSourceSanitizer({
        languages: ['de' as SupportedLanguage],
      }),
    ).toThrow(/Unsupported language/u)

    for (const mask of ['', '\n', '\r', '🙂', '**']) {
      expect(() =>
        sanitizeSourceComments('// shit', {
          filename: 'entry.js',
          mask,
        }),
      ).toThrow(/one UTF-16 code unit/u)
    }
  })

  it('publishes exactly the requested default language set', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['ar', 'en', 'es', 'fr', 'ru'])
  })
})
