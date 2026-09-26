import { describe, expect, it } from 'vitest'
import { parseNutritionLabel } from './nutrition'

const hungarianMayonnaise = `Koch's Original Majonéz
Tápérték / Nutrition declaration
100 g
Szénhidrát / Carbohydrate 7,1 g
ebből cukrok / of which sugars 6,1 g
Fehérje / Protein 1,0 g
Zsír / Fat 52 g`

describe('nutrition label parser', () => {
  it('parses the Hungarian bilingual mayonnaise fixture by nutrient rows', () => {
    const result = parseNutritionLabel(hungarianMayonnaise)
    expect(result.name).toBe("Koch's Original Majonéz")
    expect(result.basis).toBe('100g')
    expect(result.values).toEqual({ carbohydrates: 7.1, sugars: 6.1, fiber: null, protein: 1, fat: 52 })
    expect(result.carbs100g).toBe(7.1)
    expect(result.fiber100g).toBeNull()
    expect(result.confidence).toBe('high')
  })

  it('supports English rows and keeps zero distinct from missing', () => {
    const result = parseNutritionLabel('Plain food\nNutrition declaration per 100 g\nCarbohydrate 0 g\nSugars 0 g\nProtein 1.5 g\nFat 0 g\nFibre 0 g')
    expect(result.values).toEqual({ carbohydrates: 0, sugars: 0, fiber: 0, protein: 1.5, fat: 0 })
    expect(result.carbs100g).toBe(0)
  })

  it('does not convert 100 ml or serving values into 100 g', () => {
    expect(parseNutritionLabel('Ital\nCarbohydrate 8.2 g\nper 100 ml').carbs100g).toBeNull()
    expect(parseNutritionLabel('Snack\nCarbs 15 g\nper serving').carbs100g).toBeNull()
  })

  it('does not invent a product name from a later nutrient row', () => {
    const result = parseNutritionLabel('100 g\nCarbohydrate —\nProtein —')
    expect(result.name).toBe('')
    expect(result.values.carbohydrates).toBeNull()
  })
})
