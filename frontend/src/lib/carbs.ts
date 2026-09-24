export const MAX_AMOUNT_GRAMS = 100_000

export function parseAmountInput(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return null
  const amount = Number(normalized)
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT_GRAMS) return null
  return amount
}

export function calculateCarbohydrate(amountGrams: number, carbohydratePer100g: number | null): number | null {
  if (!Number.isFinite(amountGrams) || amountGrams <= 0 || amountGrams > MAX_AMOUNT_GRAMS) return null
  if (carbohydratePer100g === null || !Number.isFinite(carbohydratePer100g) || carbohydratePer100g < 0 || carbohydratePer100g > 100) return null
  return (amountGrams * carbohydratePer100g) / 100
}

export function formatCarbohydrate(value: number): string {
  return new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 }).format(value)
}
