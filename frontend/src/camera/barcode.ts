export function isValidEan(value: string): boolean {
  const digits = value.trim()
  if (!/^\d+$/.test(digits) || (digits.length !== 8 && digits.length !== 13)) return false
  const checkDigit = Number(digits.at(-1))
  const payload = digits.slice(0, -1).split('').reverse().map(Number)
  const weightedSum = payload.reduce((sum, digit, index) => sum + digit * (index % 2 === 0 ? 3 : 1), 0)
  return (10 - (weightedSum % 10)) % 10 === checkDigit
}
