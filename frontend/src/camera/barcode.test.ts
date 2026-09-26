import { describe, expect, it } from 'vitest'
import { isValidEan } from './barcode'

describe('EAN barcode validation', () => {
  it('accepts known EAN-13 and EAN-8 values', () => {
    expect(isValidEan('4006381333931')).toBe(true)
    expect(isValidEan('96385074')).toBe(true)
  })

  it('rejects invalid checksums, lengths and non-numeric values', () => {
    expect(isValidEan('4006381333932')).toBe(false)
    expect(isValidEan('1234567')).toBe(false)
    expect(isValidEan('4006381333931x')).toBe(false)
  })
})
