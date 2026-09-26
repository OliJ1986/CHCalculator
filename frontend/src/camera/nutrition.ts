export type NutritionBasis = '100g' | '100ml' | 'serving' | null

export type NutritionValues = {
  carbohydrates: number | null
  sugars: number | null
  fiber: number | null
  protein: number | null
  fat: number | null
}

export type NutritionDraft = {
  name: string
  /** Kept for compatibility with the existing food editor. */
  carbs100g: number | null
  sugars100g: number | null
  fiber100g: number | null
  protein100g: number | null
  fat100g: number | null
  values: NutritionValues
  basis: NutritionBasis
  servingSizeG: number | null
  tableDetected: boolean
  confidence: 'high' | 'medium' | 'low'
  rawText: string
}

const numberPattern = /-?\d+(?:[.,]\d+)?/

const emptyValues = (): NutritionValues => ({
  carbohydrates: null,
  sugars: null,
  fiber: null,
  protein: null,
  fat: null,
})

const toNumber = (value: string): number | null => {
  const number = Number(value.replace(',', '.'))
  return Number.isFinite(number) ? number : null
}

function firstNumber(value: string): number | null {
  const match = value.match(numberPattern)
  return match ? toNumber(match[0]) : null
}

function normalizedLines(rawText: string): string[] {
  return rawText
    .normalize('NFKC')
    .replace(/[|¦]/g, ' ')
    .replace(/\u00ad/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function basisOf(text: string): NutritionBasis {
  const normalized = text.normalize('NFKC')
  if (/100\s*g\b|per\s*100\s*g/i.test(normalized)) return '100g'
  if (/100\s*ml\b|per\s*100\s*ml/i.test(normalized)) return '100ml'
  if (/adag|portion|serving/i.test(normalized)) return 'serving'
  return null
}

function servingSizeOf(text: string): number | null {
  const match = text.match(/(?:adag|portion|serving)[^\d]{0,12}(\d+(?:[.,]\d+)?)\s*g/i)
  return match ? toNumber(match[1]) : null
}

function nutrientValue(lines: string[], pattern: RegExp): number | null {
  for (const line of lines) {
    const match = line.match(pattern)
    if (!match) continue
    const value = firstNumber(line.slice((match.index ?? 0) + match[0].length))
    if (value !== null) return value
  }
  return null
}

function productName(lines: string[], tableStart: number): string {
  // Use only the heading before the first nutrient row. This prevents a
  // random OCR line from becoming the product name.
  const heading = lines.slice(0, tableStart).filter((line) => !/^\d+(?:[.,]\d+)?\s*(?:g|ml)$/i.test(line))
  return heading[0] ?? ''
}

export function parseNutritionLabel(rawText: string): NutritionDraft {
  const lines = normalizedLines(rawText)
  const text = lines.join('\n')
  const basis = basisOf(text)
  const patterns = {
    carbohydrates: /(?:szénhidrát|carbohydrate|carbs?)/i,
    sugars: /(?:ebből\s+cukrok|cukrok|sugars?|of\s+which\s+sugars?)/i,
    fiber: /(?:rost|fibre|fiber)/i,
    protein: /(?:fehérje|protein)/i,
    fat: /(?:zsír|fat)/i,
  }
  const tableStart = lines.findIndex((line) => Object.values(patterns).some((pattern) => pattern.test(line)))
  const values = emptyValues()
  values.sugars = nutrientValue(lines, patterns.sugars)
  values.fiber = nutrientValue(lines, patterns.fiber)
  values.protein = nutrientValue(lines, patterns.protein)
  values.fat = nutrientValue(lines, patterns.fat)
  // A bilingual sugar row can contain “carbohydrate”, so exclude subordinate
  // sugar rows before parsing the carbohydrate row.
  values.carbohydrates = nutrientValue(
    lines.filter((line) => !patterns.sugars.test(line)),
    patterns.carbohydrates,
  )

  const recognized = Object.values(values).filter((value) => value !== null).length
  const name = productName(lines, tableStart < 0 ? lines.length : tableStart)
  const tableDetected = tableStart >= 0 && (basis !== null || recognized > 0)
  const confidence = basis === '100g' && values.carbohydrates !== null && name && recognized >= 2
    ? 'high'
    : basis !== null && recognized > 0
      ? 'medium'
      : 'low'
  const is100g = basis === '100g'

  return {
    name,
    carbs100g: is100g ? values.carbohydrates : null,
    sugars100g: is100g ? values.sugars : null,
    fiber100g: is100g ? values.fiber : null,
    protein100g: is100g ? values.protein : null,
    fat100g: is100g ? values.fat : null,
    values,
    basis,
    servingSizeG: servingSizeOf(text),
    tableDetected,
    confidence,
    rawText,
  }
}
