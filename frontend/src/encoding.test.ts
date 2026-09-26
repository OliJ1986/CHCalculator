import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sourceRoot = resolve(import.meta.dirname)
const sourceFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name)
  if (entry.isDirectory()) return sourceFiles(path)
  return /\.(ts|tsx|css|html)$/.test(entry.name) ? [path] : []
})

describe('frontend source encoding', () => {
  it('contains no common Windows-1250/UTF-8 mojibake sequences', () => {
    const mojibake = /(?:\u0102.|\u0139.|\u00c2.|\u00e2.{1,2})/u
    const failures = sourceFiles(sourceRoot).flatMap((path) => {
      const text = readFileSync(path, 'utf8')
      return mojibake.test(text) ? [path] : []
    })
    expect(failures).toEqual([])
  })

  it('keeps the key Hungarian labels as real Unicode text', () => {
    const app = readFileSync(join(sourceRoot, 'App.tsx'), 'utf8')
    for (const label of ['Tízórai', 'Ebéd', 'Egyéb', 'Étkezés hozzáadása', 'Következő nap']) {
      expect(app).toContain(label)
    }
  })
})
