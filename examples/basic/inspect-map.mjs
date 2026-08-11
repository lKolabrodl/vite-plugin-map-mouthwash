import { readFile } from 'node:fs/promises'

const mapUrl = new URL('./dist/assets/index.js.map', import.meta.url)
const map = JSON.parse(await readFile(mapUrl, 'utf8'))
const sourceContents = Array.isArray(map.sourcesContent) ? map.sourcesContent : []
const combinedSource = sourceContents.join('\n')
const expectedComment = '// **** ***** ****** ***** *****'
const preservedLiteral = "const preservedText = 'shit merde mierda блять متناك'"

if (!combinedSource.includes(expectedComment)) {
  throw new Error(`Expected the source map to contain: ${expectedComment}`)
}

if (!combinedSource.includes(preservedLiteral)) {
  throw new Error('The ordinary string literal was unexpectedly changed.')
}

console.log('Sanitized source-map comment:')
console.log(expectedComment)
console.log('Ordinary string literal remained unchanged.')
