import { Buffer } from 'node:buffer'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import { build } from 'vite'

import mapMouthwash, { mapMouthwash as namedMapMouthwash } from '../src/index.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

describe('mapMouthwash', () => {
  it('exposes matching default and named plugin factories', () => {
    expect(mapMouthwash).toBe(namedMapMouthwash)
    expect(mapMouthwash().name).toBe('vite-plugin-map-mouthwash')
  })

  it('cleans the emitted map without changing source length or literals', async () => {
    const root = await mkdtemp(join(tmpdir(), 'map-mouthwash-vite-'))
    temporaryDirectories.push(root)

    const entryPath = join(root, 'entry.js')
    const outDir = join(root, 'dist')
    const source = [
      'export const literal = "shit";',
      'export const matcher = /[/*]shit/;',
      '// shit merde mierda блять متناك',
      'export const answer = 42;',
    ].join('\n')

    await writeFile(entryPath, source, 'utf8')
    await build({
      configFile: false,
      root,
      logLevel: 'silent',
      plugins: [mapMouthwash()],
      build: {
        emptyOutDir: true,
        lib: {
          entry: entryPath,
          fileName: 'bundle',
          formats: ['es'],
        },
        minify: false,
        outDir,
        sourcemap: true,
      },
    })

    const outputFiles = await readdir(outDir)
    const mapFile = outputFiles.find((file) => file.endsWith('.map'))

    expect(mapFile).toBeDefined()

    const mapText = await readFile(join(outDir, mapFile!), 'utf8')
    const map = JSON.parse(mapText) as {
      mappings: string
      sourcesContent: string[]
    }
    const mappedSource = map.sourcesContent[0]

    expect(mappedSource).toBeDefined()
    expect(mappedSource).toHaveLength(source.length)
    expect(mappedSource).toContain('export const literal = "shit";')
    expect(mappedSource).toContain('export const matcher = /[/*]shit/;')
    expect(mappedSource).toContain('// **** ***** ****** ***** *****')
    expect(map.mappings.length).toBeGreaterThan(0)
  })

  it('cleans an inline source map', async () => {
    const root = await mkdtemp(join(tmpdir(), 'map-mouthwash-inline-'))
    temporaryDirectories.push(root)

    const entryPath = join(root, 'entry.js')
    const outDir = join(root, 'dist')
    const source = 'export const value = 1 // shit блять\n'

    await writeFile(entryPath, source, 'utf8')
    await build({
      configFile: false,
      root,
      logLevel: 'silent',
      plugins: [mapMouthwash()],
      build: {
        emptyOutDir: true,
        lib: {
          entry: entryPath,
          fileName: 'inline-bundle',
          formats: ['es'],
        },
        minify: false,
        outDir,
        sourcemap: 'inline',
      },
    })

    const outputFiles = await readdir(outDir)
    const scriptFile = outputFiles.find(
      (file) => file.endsWith('.js') || file.endsWith('.mjs'),
    )

    expect(scriptFile).toBeDefined()

    const script = await readFile(join(outDir, scriptFile!), 'utf8')
    const base64Map = script.match(
      /sourceMappingURL=data:application\/json[^,]*;base64,([A-Za-z0-9+/=]+)/u,
    )?.[1]

    expect(base64Map).toBeDefined()

    const map = JSON.parse(Buffer.from(base64Map!, 'base64').toString('utf8')) as {
      sourcesContent: string[]
    }

    expect(map.sourcesContent[0]).toBe(
      'export const value = 1 // **** *****\n',
    )
    expect(map.sourcesContent[0]).toHaveLength(source.length)
  })
})
