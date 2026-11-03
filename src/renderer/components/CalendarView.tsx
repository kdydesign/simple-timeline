import { useMemo, useState, useEffect } from "react";
import type { GanttProps } from "./GanttView";
import { monthBounds } from "../../domain/date";
import {
  calendarGrid,
  calendarSegments,
  placeWeek,
  hiddenCount,
  schedulesOnDate,
} from "../../visualization/calendar";
import {
  indexSnapshot,
  scheduleDescription,
  colorText,
} from "../../visualization/presentation";
import { DayScheduleList } from "./DayScheduleList";
export function CalendarView({
  snapshot,
  selectedMonth,
  onEditSchedule,
  disabled = false,
  active = true,
  onModalChange,
}: { onModalChange?: (open: boolean) => void } & Omit<GanttProps, "ref">) {
  const [day, setDay] = useState<string | null>(null),
    bounds = monthBounds(selectedMonth);
  const grid = useMemo(() => calendarGrid(selectedMonth), [selectedMonth]),
    index = useMemo(() => indexSnapshot(snapshot), [snapshot]),
    projectMap = useMemo(
      () => new Map(snapshot.projects.map((p) => [p.id, p])),
      [snapshot],
    ),
    scheduleMap = useMemo(
      () => new Map(snapshot.schedules.map((s) => [s.id, s])),
      [snapshot],
    );
  const weeks = useMemo(() => {
    const segments = calendarSegments(snapshot.schedules, selectedMonth),
      grouped = new Map<string, typeof segments>();
    for (const s of segments) {
      const v = grouped.get(s.weekStart) ?? [];
      v.push(s);
      grouped.set(s.weekStart, v);
    }
    return grid.weeks.map((w) =>
      placeWeek(grouped.get(w.find(Boolean)!) ?? []),
    );
  }, [snapshot, selectedMonth, grid]);
  useEffect(() => {
    if (!active) setDay(null);
  }, [active]);
  useEffect(() => {
    onModalChange?.(day !== null);
    return () => onModalChange?.(false);
  }, [day, onModalChange]);
  const close = () => {
    const old = day;
    setDay(null);
    requestAnimationFrame(() => {
      const button =
        document.querySelector<HTMLElement>(`[data-focus="more:${old}"]`) ??
        document.querySelector<HTMLElement>('[data-focus="schedule-add"]');
      button?.focus();
    });
  };
  return (
    <section className="calendar" aria-label="월간 달력" hidden={!active}>
      <div inert={!!day} aria-hidden={!!day}>
        <div className="view-heading">
          <h2>{bounds.start.slice(0, 7)} 월간 달력</h2>
          <span>월요일 시작 · 최대 3줄</span>
        </div>
        <div className="weekdays">
          {["월", "화", "수", "목", "금", "토", "일"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        {grid.weeks.map((week, wi) => (
          <div className="calendar-week" key={wi}>
            <div className="calendar-dates">
              {week.map((date, c) => {
                const inMonth =
                  date && date >= bounds.start && date <= bounds.end;
                return (
                  <div
                    data-date={date ?? undefined}
                    className={inMonth ? "month-date" : "adjacent-date"}
                    key={c}
                    aria-disabled={!inMonth}
                  >
                    <time dateTime={date ?? undefined}>
                      {date ? Number(date.slice(8)) : ""}
                    </time>
                  </div>
                );
              })}
            </div>
            <div className="calendar-lanes">
              {weeks[wi]
                .filter((s) => s.lane < 3)
                .map((s) => {
                  const item = scheduleMap.get(s.scheduleId)!,
                    p = projectMap.get(s.projectId)!;
                  return (
                    <button
                      key={s.scheduleId}
                      data-segment={s.scheduleId}
                      data-focus={`schedule:${s.scheduleId}`}
                      className="calendar-bar"
                      disabled={disabled}
                      style={{
                        gridColumn: `${s.column + 1} / span ${s.span}`,
                        gridRow: s.lane + 1,
                        backgroundColor: p.color,
                        color: colorText(p.color),
                      }}
                      aria-label={scheduleDescription(item, p)}
                      title={scheduleDescription(item, p)}
                      onClick={() => onEditSchedule(item)}
                    >
                      {s.continuesLeft && <span aria-hidden="true">‹ </span>}
                      {index.scheduleLabel(item)}
                      {s.continuesRight && <span aria-hidden="true"> ›</span>}
                    </button>
                  );
                })}
            </div>
            <div className="calendar-more">
              {week.map((date, c) => {
                const count =
                  date && date >= bounds.start && date <= bounds.end
                    ? hiddenCount(weeks[wi], date)
                    : 0;
                return (
                  <div key={c}>
                    {count > 0 && (
                      <button
                        data-focus={`more:${date}`}
                        aria-label={`${date} +${count} 더 보기`}
                        onClick={() => setDay(date)}
                      >
                        +{count} 더 보기
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {!snapshot.schedules.some(
          (s) => s.startDate <= bounds.end && s.endDate >= bounds.start,
        ) && <p className="empty-month">이 달에 표시할 일정이 없습니다.</p>}
      </div>
      {day && active && (
        <DayScheduleList
          date={day}
          schedules={schedulesOnDate(snapshot, day)}
          projects={snapshot.projects}
          disabled={disabled}
          onClose={close}
          onEdit={(s) => {
            onEditSchedule(s);
            setDay(null);
          }}
        />
      )}
    </section>
  );
}
