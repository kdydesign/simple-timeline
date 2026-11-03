export function viewportWindow(v: {
  logicalOffset: number;
  viewportSize: number;
  unitSize: number;
  overscan: number;
}): { first: number; lastExclusive: number; origin: number } {
  const first = Math.max(
    0,
    Math.floor(v.logicalOffset / v.unitSize) - v.overscan,
  );
  return {
    first,
    lastExclusive:
      Math.ceil((v.logicalOffset + v.viewportSize) / v.unitSize) + v.overscan,
    origin: first * v.unitSize,
  };
}
// Prefix includes zero and the bottom boundary of every row. Lower-bound searches avoid scanning the dataset on scroll.
export function visibleRows(
  prefix: readonly number[],
  offset: number,
  height: number,
  overscanRows: number,
): { first: number; lastExclusive: number } {
  const n = prefix.length - 1;
  const lower = (value: number) => {
    let lo = 0,
      hi = prefix.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (prefix[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  let lo = 0,
    hi = prefix.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (prefix[mid] <= offset) lo = mid + 1;
    else hi = mid;
  }
  const first = Math.min(n, Math.max(0, lo - 1));
  return {
    first: Math.max(0, first - overscanRows),
    lastExclusive: Math.min(n, lower(offset + height) + overscanRows),
  };
}
