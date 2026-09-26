import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('service worker update policy', () => {
  it('uses a current cache version and never caches API responses', () => {
    const worker = readFileSync(resolve(import.meta.dirname, '../public/sw.js'), 'utf8')
    expect(worker).toContain("const CACHE_NAME = 'chill-m14-v1'")
    expect(worker).toContain("if (requestUrl.pathname.startsWith('/api/')) return")
    expect(worker).toContain('caches.delete(key)')
  })
})
