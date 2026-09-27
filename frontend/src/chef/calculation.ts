import { calculateCarbohydrate } from '../lib/carbs'

export type ChefCalculationInput = { quantityG: number | null; availableCarbs100g: number | null }

export type ChefCalculation = {
  complete: boolean
  totalCarbsG: number | null
  knownCarbsG: number
  knownMassG: number
  missingCount: number
}

export function calculateChefTotals(rows: ChefCalculationInput[]): ChefCalculation {
  let knownCarbsG = 0
  let knownMassG = 0
  let missingCount = 0
  for (const row of rows) {
    const carbs = row.quantityG === null || row.availableCarbs100g === null
      ? null
      : calculateCarbohydrate(row.quantityG, row.availableCarbs100g)
    if (carbs === null || row.quantityG === null) {
      missingCount += 1
      continue
    }
    knownCarbsG += carbs
    knownMassG += row.quantityG
  }
  return {
    complete: rows.length > 0 && missingCount === 0,
    totalCarbsG: rows.length > 0 && missingCount === 0 ? knownCarbsG : null,
    knownCarbsG,
    knownMassG,
    missingCount,
  }
}
