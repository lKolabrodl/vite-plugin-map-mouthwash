import { describe, expect, it } from 'vitest'

import { createSourceSanitizer } from '../src/sanitizer.js'
import { sanitizeSourceMapObject } from '../src/source-map.js'

describe('sanitizeSourceMapObject', () => {
  it('cleans indexed maps and respects the source filter', () => {
    const map = {
      sections: [
        {
          map: {
            sources: ['src/clean-me.ts', 'vendor/leave-me.ts'],
            sourcesContent: ['// shit', '// shit'],
          },
        },
      ],
    }

    const result = sanitizeSourceMapObject(
      map,
      createSourceSanitizer({ languages: ['en'] }),
      (sourcePath) => !sourcePath.includes('vendor'),
    )

    expect(result).toEqual({ changedComments: 1, changedSources: 1 })
    expect(map.sections[0]?.map.sourcesContent).toEqual([
      '// ****',
      '// shit',
    ])
  })

  it('cleans standard maps and tolerates missing source metadata', () => {
    const map = {
      sourcesContent: ['// shit', null, 42, '// clean'],
    }

    expect(
      sanitizeSourceMapObject(
        map,
        createSourceSanitizer({ languages: ['en'] }),
        undefined,
      ),
    ).toEqual({ changedComments: 1, changedSources: 1 })
    expect(map.sourcesContent).toEqual(['// ****', null, 42, '// clean'])
  })

  it('ignores non-map values, malformed sections, and maps without content', () => {
    const sanitizer = createSourceSanitizer({ languages: ['en'] })

    expect(sanitizeSourceMapObject(null, sanitizer, undefined)).toEqual({
      changedComments: 0,
      changedSources: 0,
    })
    expect(
      sanitizeSourceMapObject(
        { sources: ['entry.js'], sections: [null, 1, { url: 'remote.map' }] },
        sanitizer,
        undefined,
      ),
    ).toEqual({ changedComments: 0, changedSources: 0 })
  })
})
