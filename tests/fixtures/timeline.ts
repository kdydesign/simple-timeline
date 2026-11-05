import type { Project, Schedule } from '../../src/shared/types'
export const project = (id = '1', name = '1.1.1 핫픽스'): Project => ({
  id,
  name,
  color: '#2563EB',
  participants: ['민수', '지수'],
  createdAt: '2026-11-03T00:00:00.000Z',
  updatedAt: '2026-11-03T00:00:00.000Z',
})
export const schedule = (
  id = '1',
  projectId = '1',
  startDate = '2026-11-11',
  endDate = '2026-12-11',
): Schedule => ({
  reminder: {daysBefore:2,time:'09:00',start:false,end:false},
  id,
  projectId,
  name: '개발',
  startDate,
  endDate,
  createdAt: '2026-11-03T00:00:00.000Z',
  updatedAt: '2026-11-03T00:00:00.000Z',
})
export const hotfix = {
  projects: [project(), project('2', '일정 없음')],
  schedules: [
    schedule(),
    { ...schedule('2', '1', '2026-12-12', '2026-12-17'), name: 'QA' },
    { ...schedule('3', '1', '2026-12-18', '2026-12-18'), name: '운영 배포' },
  ],
}
export const overlaps = Array.from({ length: 5 }, (_, i) =>
  schedule(String(i + 1), '1', '2026-12-15', '2026-12-15'),
)
