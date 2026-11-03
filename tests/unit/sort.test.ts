import {it,expect} from 'vitest'
import {compareIds,sortSnapshot} from '../../src/domain/sort'
import {project,schedule} from '../fixtures/timeline'
it('uses numeric 64-bit IDs and date order rather than names or timestamps',()=>{
  expect(compareIds('9','10')).toBeLessThan(0)
  expect(compareIds('9007199254740993','9007199254740992')).toBeGreaterThan(0)
  const data={projects:[project('10','A'),project('9','Z')],schedules:[schedule('3','9','2026-11-10','2026-11-20'),schedule('2','9','2026-11-10','2026-11-15'),schedule('1','9','2026-11-10','2026-11-15')]}
  expect(sortSnapshot(data).projects.map(p=>p.id)).toEqual(['9','10'])
  expect(sortSnapshot(data).schedules.map(s=>s.id)).toEqual(['1','2','3'])
})
