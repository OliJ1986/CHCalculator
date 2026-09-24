import { describe, expect, it } from 'vitest'
import { calculateCarbohydrate } from './carbs'
describe('calculateCarbohydrate', () => {
  it('kiszámítja a specifikáció példáját', () => expect(calculateCarbohydrate(55, 11.4)).toBeCloseTo(6.27))
  it('nulla mennyiségnél nullát ad', () => expect(calculateCarbohydrate(0, 11.4)).toBe(0))
  it('tört grammértékkel is pontos', () => expect(calculateCarbohydrate(12.5, 49)).toBeCloseTo(6.125))
  it('nagyobb mennyiséget is kezel', () => expect(calculateCarbohydrate(1000, 22.8)).toBeCloseTo(228))
})
