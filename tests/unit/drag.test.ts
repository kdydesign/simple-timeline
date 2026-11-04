import { it, expect } from 'vitest'
import { dragDates } from '../../src/visualization/drag'
const one={startDate:'2026-11-01',endDate:'2026-11-01'}
it('resizes inclusively and clamps at one day',()=>{
  expect(dragDates(one,'end',2)).toEqual({startDate:'2026-11-01',endDate:'2026-11-03'})
  expect(dragDates(one,'start',2)).toEqual(one)
  expect(dragDates(one,'end',-3)).toEqual(one)
})
it('moves the whole interval, retaining duration across leap and year boundaries',()=>{
  expect(dragDates({startDate:'2024-02-28',endDate:'2024-03-01'},'move',1)).toEqual({startDate:'2024-02-29',endDate:'2024-03-02'})
  expect(dragDates({startDate:'2026-12-31',endDate:'2027-01-02'},'move',1)).toEqual({startDate:'2027-01-01',endDate:'2027-01-03'})
})
it('clamps moves at supported bounds without shortening the interval',()=>{
  expect(dragDates({startDate:'0001-01-02',endDate:'0001-01-04'},'move',-100)).toEqual({startDate:'0001-01-01',endDate:'0001-01-03'})
  expect(dragDates({startDate:'9999-12-28',endDate:'9999-12-30'},'move',100)).toEqual({startDate:'9999-12-29',endDate:'9999-12-31'})
})
