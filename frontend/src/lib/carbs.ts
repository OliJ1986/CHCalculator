export function calculateCarbohydrate(amountGrams: number, carbohydratePer100g: number): number {
  if (!Number.isFinite(amountGrams) || !Number.isFinite(carbohydratePer100g)) return 0
  return (Math.max(0, amountGrams) * Math.max(0, carbohydratePer100g)) / 100
}
export function formatCarbohydrate(value: number): string { return new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 }).format(value) }
