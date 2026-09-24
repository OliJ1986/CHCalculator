import { describe, expect, it } from 'vitest'
import { calculateCarbohydrate, parseAmountInput } from './carbs'

describe('calculateCarbohydrate', () => {
  it('kiszámítja a specifikáció példáját', () => expect(calculateCarbohydrate(55, 11.4)).toBeCloseTo(6.27))
  it('a nulla CH érvényes, a nulla mennyiség viszont hibás', () => {
    expect(calculateCarbohydrate(55, 0)).toBe(0)
    expect(calculateCarbohydrate(0, 11.4)).toBeNull()
  })
  it('tört grammértékkel is pontos', () => expect(calculateCarbohydrate(12.5, 49)).toBeCloseTo(6.125))
  it('nagyobb mennyiséget is kezel', () => expect(calculateCarbohydrate(1000, 22.8)).toBeCloseTo(228))
  it('a hiányzó vagy hibás CH-adat nem számolható', () => {
    expect(calculateCarbohydrate(55, null)).toBeNull()
    expect(calculateCarbohydrate(55, 101)).toBeNull()
  })
})

describe('parseAmountInput', () => {
  it('elfogadja a magyar tizedesvesszőt és a pontot', () => {
    expect(parseAmountInput('12,5')).toBe(12.5)
    expect(parseAmountInput('12.5')).toBe(12.5)
  })
  it('elutasítja az üres, nem véges, nulla és negatív értékeket', () => {
    expect(parseAmountInput('')).toBeNull()
    expect(parseAmountInput('abc')).toBeNull()
    expect(parseAmountInput('0')).toBeNull()
    expect(parseAmountInput('-1')).toBeNull()
    expect(parseAmountInput('Infinity')).toBeNull()
  })
})
