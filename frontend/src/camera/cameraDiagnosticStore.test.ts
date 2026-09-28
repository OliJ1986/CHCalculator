import { describe, expect, it } from 'vitest'
import { diagnosticErrorCategory } from './cameraDiagnosticStore'

describe('camera diagnostic error categories', () => {
  it('classifies camera and ZXing failures without copying error messages', () => {
    expect(diagnosticErrorCategory({ name: 'NotAllowedError', message: 'private detail' })).toBe('permission_denied')
    expect(diagnosticErrorCategory({ name: 'NotFoundException', message: 'decoded pixels' })).toBe('zxing_not_found')
    expect(diagnosticErrorCategory({ name: 'ChecksumException', message: '4006381333931' })).toBe('zxing_checksum')
  })

  it('does not copy an unknown error name or message', () => {
    const category = diagnosticErrorCategory({ name: `Custom${'x'.repeat(300)}`, message: 'secret' })
    expect(category).toBe('other_error')
    expect(category).not.toContain('Custom')
    expect(category).not.toContain('secret')
  })
})
