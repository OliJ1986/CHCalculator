import { describe, expect, it } from 'vitest'
import { parseNutritionLabel } from './nutrition'

describe('nutrition label parser', () => {
  it('keeps carbohydrate separate from sugars and parses Hungarian decimals', () => {
    const result = parseNutritionLabel('Termék neve\nSzénhidrát 12,5 g\n- ebből cukrok 4,2 g\nRost 3,1 g\n100 g')
    expect(result.name).toBe('Termék neve')
    expect(result.carbs100g).toBe(12.5)
    expect(result.fiber100g).toBe(3.1)
    expect(result.basis).toBe('100g')
    expect(result.confidence).toBe('high')
  })

  it('does not convert 100 ml or serving values into 100 g', () => {
    expect(parseNutritionLabel('Ital\nCarbohydrate 8.2 g\nper 100 ml').carbs100g).toBeNull()
    expect(parseNutritionLabel('Snack\nCarbs 15 g\nper serving').carbs100g).toBeNull()
  })
})
