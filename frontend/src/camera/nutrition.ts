export type NutritionDraft = {
  name: string
  carbs100g: number | null
  fiber100g: number | null
  basis: '100g' | '100ml' | 'serving' | null
  confidence: 'high' | 'medium' | 'low'
  rawText: string
}

const numberPattern = '(\\d+(?:[.,]\\d+)?)'
const toNumber = (value: string): number | null => {
  const number = Number(value.replace(',', '.'))
  return Number.isFinite(number) ? number : null
}

function firstNumber(value: string): number | null {
  const match = value.match(new RegExp(numberPattern))
  return match ? toNumber(match[1]) : null
}

function basisOf(text: string): NutritionDraft['basis'] {
  if (/100\s*g\b|per\s*100\s*g/i.test(text)) return '100g'
  if (/100\s*ml\b|per\s*100\s*ml/i.test(text)) return '100ml'
  if (/adag|portion|serving/i.test(text)) return 'serving'
  return null
}

export function parseNutritionLabel(rawText: string): NutritionDraft {
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const carbsLine = lines.find((line) => /(sz[ée]nhidr[áa]t|carbohydrate|carbs?)/i.test(line) && !/(cukor|sugar)/i.test(line))
  const fiberLine = lines.find((line) => /(rost|fibre|fiber)/i.test(line))
  const basis = basisOf(rawText)
  const name = lines.find((line) => !/(sz[ée]nhidr[áa]t|carbohydrate|carbs?|rost|fibre|fiber|cukor|sugar|100\s*[gml])/i.test(line)) ?? ''
  const carbs100g = carbsLine ? firstNumber(carbsLine) : null
  const fiber100g = fiberLine ? firstNumber(fiberLine) : null
  const confidence = carbs100g !== null && basis === '100g' && name ? 'high' : carbs100g !== null && basis ? 'medium' : 'low'
  return { name, carbs100g: basis === '100g' ? carbs100g : null, fiber100g: basis === '100g' ? fiber100g : null, basis, confidence, rawText }
}
