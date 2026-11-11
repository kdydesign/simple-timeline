// Gregorian ordinal 1 is Monday. Business dates never pass through local time.
export function isWeekend(ordinal: number): boolean {
  return (ordinal - 1) % 7 >= 5
}
