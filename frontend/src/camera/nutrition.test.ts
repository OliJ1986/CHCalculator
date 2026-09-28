import { describe, expect, it } from 'vitest'
import { nutritionWarnings, parseNutritionLabel } from './nutrition'
import { sourceRectForCrop } from './nutritionCrop'

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

  it('flags impossible and strongly suspicious OCR nutrient values without replacing them', () => {
    const protein = parseNutritionLabel('Ital\nper 100 ml\nProtein 159 g\nFat 2 g')
    const fat = parseNutritionLabel('Ital\nper 100 ml\nProtein 1 g\nFat 149 g')
    expect(nutritionWarnings(protein)).toEqual(expect.arrayContaining([expect.stringContaining('Fehérje')]))
    expect(nutritionWarnings(fat)).toEqual(expect.arrayContaining([expect.stringContaining('Zsír')]))
    expect(protein.values.protein).toBe(159)
    expect(fat.values.fat).toBe(149)
  })

  it('flags contradictory rows and an implausible 100 g nutrient total', () => {
    const draft = parseNutritionLabel('Teszt\n100 g\nCarbohydrate 40 g\nSugars 45 g\nProtein 40 g\nFat 35 g')
    const warnings = nutritionWarnings(draft)
    expect(warnings).toHaveLength(2)
    expect(draft.values.sugars).toBeGreaterThan(draft.values.carbohydrates ?? Number.POSITIVE_INFINITY)
  })

  it('maps the visual selection to the exact source pixel rectangle', () => {
    expect(sourceRectForCrop(1200, 800, { left: 0.1, top: 0.2, width: 0.5, height: 0.25 })).toEqual({ x: 120, y: 160, width: 600, height: 200 })
    expect(sourceRectForCrop(100, 50, { left: -1, top: 0.9, width: 3, height: 3 })).toEqual({ x: 0, y: 45, width: 100, height: 5 })
  })
})
