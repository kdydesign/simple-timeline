export type NodeCatalogColumn = 'version' | 'category' | 'npm' | 'status'
export type NodeCatalogSort = { column: NodeCatalogColumn; direction: 'ascending' | 'descending' }
export type NodeCatalogRow = {
  version: string
  npm: string | null
  // undefined is unknown; null is a known non-LTS release.
  lts: string | null | undefined
  status: 'active' | 'installed' | 'missing' | null
}

const statusRank = { active: 0, installed: 1, missing: 2 }
function compareVersion(left: string, right: string) {
  const a = left.split('.').map(Number)
  const b = right.split('.').map(Number)
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)
    if (difference) return difference
  }
  return 0
}

export function sortNodeCatalog<T extends NodeCatalogRow>(rows: readonly T[], sort: NodeCatalogSort): T[] {
  const direction = sort.direction === 'ascending' ? 1 : -1
  return [...rows].sort((a, b) => {
    let difference = 0
    if (sort.column === 'version') difference = compareVersion(a.version, b.version)
    else {
      const left = sort.column === 'category' ? a.lts : a[sort.column]
      const right = sort.column === 'category' ? b.lts : b[sort.column]
      const unknownLeft = sort.column === 'category' ? left === undefined : left == null
      const unknownRight = sort.column === 'category' ? right === undefined : right == null
      if (unknownLeft !== unknownRight) return unknownLeft ? 1 : -1
      if (!unknownLeft) {
        if (sort.column === 'npm') difference = compareVersion(a.npm!, b.npm!)
        if (sort.column === 'category') difference = Number(a.lts === null) - Number(b.lts === null)
          || (a.lts ?? '').localeCompare(b.lts ?? '', 'en')
        if (sort.column === 'status') difference = statusRank[a.status!] - statusRank[b.status!]
      }
    }
    return difference * direction || compareVersion(b.version, a.version)
  })
}
