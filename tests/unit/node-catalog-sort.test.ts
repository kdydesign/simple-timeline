import { describe, expect, it } from 'vitest'
import { sortNodeCatalog, type NodeCatalogRow } from '../../src/renderer/workrail/nodeCatalogSort'

const row = (version: string, npm: string | null, lts: string | null | undefined, status: NodeCatalogRow['status']): NodeCatalogRow => ({ version, npm, lts, status })
const rows = [
  row('22.9.0', '10.9.0', 'Jod', 'installed'),
  row('24.0.0', null, undefined, null),
  row('22.10.0', '10.10.0', 'Jod', 'active'),
  row('25.0.0', '10.10.0', null, 'missing'),
  row('20.0.0', '9.0.0', 'Iron', 'missing'),
]
const versions = (result: NodeCatalogRow[]) => result.map(item => item.version)

describe('Node catalog sorting', () => {
  it('compares Node and npm numeric parts and keeps Node descending for ties', () => {
    expect(versions(sortNodeCatalog(rows, { column: 'version', direction: 'descending' }))).toEqual(['25.0.0', '24.0.0', '22.10.0', '22.9.0', '20.0.0'])
    expect(versions(sortNodeCatalog(rows, { column: 'npm', direction: 'descending' }))).toEqual(['25.0.0', '22.10.0', '22.9.0', '20.0.0', '24.0.0'])
    expect(versions(sortNodeCatalog(rows, { column: 'npm', direction: 'ascending' }))).toEqual(['20.0.0', '22.9.0', '25.0.0', '22.10.0', '24.0.0'])
    expect(rows[0].version).toBe('22.9.0')
  })
  it('orders LTS then codename and puts unknown classification last in both directions', () => {
    expect(versions(sortNodeCatalog(rows, { column: 'category', direction: 'ascending' }))).toEqual(['20.0.0', '22.10.0', '22.9.0', '25.0.0', '24.0.0'])
    expect(versions(sortNodeCatalog(rows, { column: 'category', direction: 'descending' }))).toEqual(['25.0.0', '22.10.0', '22.9.0', '20.0.0', '24.0.0'])
  })
  it('uses the displayed active, installed, missing order with unknown state always last', () => {
    expect(versions(sortNodeCatalog(rows, { column: 'status', direction: 'ascending' }))).toEqual(['22.10.0', '22.9.0', '25.0.0', '20.0.0', '24.0.0'])
    expect(versions(sortNodeCatalog(rows, { column: 'status', direction: 'descending' }))).toEqual(['25.0.0', '20.0.0', '22.9.0', '22.10.0', '24.0.0'])
  })
})
