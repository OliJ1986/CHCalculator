import { describe, expect, it } from 'vitest'
import { calculateChefTotals } from './calculation'

describe('chef deterministic totals', () => {
  it('calculates a complete meal from verified nutrient values', () => {
    expect(calculateChefTotals([
      { quantityG: 150, availableCarbs100g: 28 },
      { quantityG: 50, availableCarbs100g: 0 },
    ])).toEqual({ complete: true, totalCarbsG: 42, knownCarbsG: 42, knownMassG: 200, missingCount: 0 })
  })

  it('keeps missing values out of the checked total while preserving valid zero', () => {
    expect(calculateChefTotals([
      { quantityG: 100, availableCarbs100g: 0 },
      { quantityG: 30, availableCarbs100g: null },
    ])).toEqual({ complete: false, totalCarbsG: null, knownCarbsG: 0, knownMassG: 100, missingCount: 1 })
  })
})
