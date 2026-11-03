import type { Project, Schedule, TimelineSnapshot } from '../../shared/types'
import { inclusiveDays } from '../../domain/date'
export function ProjectList({
  snapshot,
  disabled,
  onProject,
  onSchedule,
  onAdd,
}: {
  snapshot: TimelineSnapshot
  disabled: boolean
  onProject: (p: Project) => void
  onSchedule: (s: Schedule) => void
  onAdd: (p: Project) => void
}) {
  if (!snapshot.projects.length)
    return (
      <section className="empty">
        <h2>프로젝트를 추가해 일정을 관리하세요</h2>
        <p>프로젝트에 일정이 없어도 목록에 표시됩니다.</p>
      </section>
    )
  return (
    <div className="projects">
      {snapshot.projects.map((p) => {
        const rows = snapshot.schedules.filter((s) => s.projectId === p.id)
        const name =
          p.name +
          (snapshot.projects.filter((a) => a.name === p.name).length > 1
            ? ` · #${p.id}`
            : '')
        return (
          <section className="project" key={p.id} aria-label={name}>
            <div className="project-heading">
              <span
                className="color-dot"
                style={{ backgroundColor: p.color }}
              />
              <div>
                <button
                  className="text-button project-name"
                  data-focus={`project:${p.id}`}
                  aria-label={`${name} 편집`}
                  disabled={disabled}
                  onClick={() => onProject(p)}
                >
                  {name}
                </button>
                <p>{p.participants.join(' · ') || '참여자 없음'}</p>
              </div>
              <button
                className="add-schedule"
                disabled={disabled}
                onClick={() => onAdd(p)}
              >
                일정 추가
              </button>
            </div>
            {!rows.length ? (
              <p className="empty-row">일정 없음</p>
            ) : (
              <ul>
                {rows.map((s) => {
                  const label =
                    s.name +
                    (rows.filter((a) => a.name === s.name).length > 1
                      ? ` · #${s.id}`
                      : '')
                  return (
                    <li key={s.id}>
                      <button
                        className="text-button schedule-name"
                        data-focus={`schedule:${s.id}`}
                        aria-label={`${label} 편집`}
                        disabled={disabled}
                        onClick={() => onSchedule(s)}
                      >
                        {label}
                      </button>
                      <span className="dates">
                        {s.startDate} — {s.endDate}
                      </span>
                      <span>{inclusiveDays(s.startDate, s.endDate)}일</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
