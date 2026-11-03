import { useState, useEffect } from 'react'
import type { YearMonth } from '../../shared/types'
import { shiftMonth, validateYearMonth } from '../../domain/date'
const label = (v: YearMonth) =>
  `${String(v.year).padStart(4, '0')}-${String(v.month).padStart(2, '0')}`
export function Toolbar({
  month,
  onMonth,
  onInvalid,
  canEdit,
  hasProjects,
  onProject,
  onSchedule,
}: {
  month: YearMonth
  onMonth: (m: YearMonth) => void
  onInvalid: () => void
  canEdit: boolean
  hasProjects: boolean
  onProject: () => void
  onSchedule: () => void
}) {
  const [text, setText] = useState(label(month))
  useEffect(() => setText(label(month)), [month])
  const apply = () => {
    try {
      if (!/^\d{4}-\d{2}$/.test(text)) throw Error()
      const [year, m] = text.split('-').map(Number),
        ym = { year, month: m }
      validateYearMonth(ym)
      onMonth(ym)
    } catch {
      setText(label(month))
      onInvalid()
    }
  }
  const current = () => {
    const d = new Date()
    onMonth({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }
  return (
    <header>
      <div className="brand">
        <h1>Simple Timeline</h1>
        <span>오프라인 일정 관리</span>
      </div>
      <nav aria-label="조회 연월">
        <button
          aria-label="이전 달"
          disabled={!shiftMonth(month, -1)}
          onClick={() => onMonth(shiftMonth(month, -1)!)}
        >
          ‹
        </button>
        <label>
          선택 연월
          <input
            aria-label="선택 연월"
            value={text}
            placeholder="YYYY-MM"
            onChange={(e) => setText(e.target.value)}
            onBlur={apply}
            onKeyDown={(e) => {
              if (e.key === 'Enter') apply()
            }}
          />
        </label>
        <button
          aria-label="다음 달"
          disabled={!shiftMonth(month, 1)}
          onClick={() => onMonth(shiftMonth(month, 1)!)}
        >
          ›
        </button>
        <button onClick={current}>현재 월</button>
      </nav>
      <div className="header-actions">
        <button
          data-focus="project-add"
          disabled={!canEdit}
          onClick={onProject}
        >
          프로젝트 추가
        </button>
        <button disabled={!canEdit || !hasProjects} onClick={onSchedule}>
          일정 추가
        </button>
      </div>
    </header>
  )
}
