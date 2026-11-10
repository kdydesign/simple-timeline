import {CalendarDragPreview, CalendarDragLabel} from './CalendarDragPreview';
import {calendarPreviewSegments} from '../../visualization/calendar';
import {IconButton} from './Icon';
import { useMemo, useState, useEffect, useRef } from "react";
import type { GanttProps } from "./GanttView";
import { monthBounds, toOrdinal, shiftMonth } from "../../domain/date";
import {
  calendarGrid,
  calendarSegments,
  placeWeek,
  hiddenCountsForWeek,
  schedulesOnDate,
} from "../../visualization/calendar";
import {
  indexSnapshot,
  scheduleDescription,
} from "../../visualization/presentation";
import type { YearMonth } from "../../shared/types";
import { useScheduleDrag } from "../state/useScheduleDrag";
import { DayScheduleList } from "./DayScheduleList";
export function CalendarView({
  snapshot,
  onAddDate, onDragStart, onDragCommit, onDragEnd, onMonth,
  selectedMonth, selectedDate,
  onEditSchedule,
  disabled = false,
  active = true,
  onModalChange,
}: { onModalChange?: (open: boolean) => void; onMonth?: (m:YearMonth, drag?:boolean)=>void } & Omit<GanttProps, "ref">) {
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null), hover = useRef<{direction:number;since:number}|null>(null);
  useEffect(() => { setHoveredDate(null); }, [selectedMonth.year, selectedMonth.month, active]);
  useEffect(() => {
    const main = root.current?.closest("main");
    const clear = (event: Event) => { if (event.target === main) setHoveredDate(null); };
    main?.addEventListener("scroll", clear, true);
    return () => main?.removeEventListener("scroll", clear, true);
  }, []);
  const drag = useScheduleDrag({
    enabled:active && !disabled && !day, onDragStart, onDragCommit, onDragEnd,
    dateAt:(x,y)=>{
      // Geometry alone includes cells clipped under the toolbar or sticky headings.
      const hit=document.elementFromPoint(x,y);
      const week=hit?.closest(".calendar-week");
      if(!week || !root.current?.contains(week)) return null;
      for(const el of week.querySelectorAll<HTMLElement>("[data-date]")) {
        const r=el.getBoundingClientRect();
        if(x>=r.left && x<r.right && y>=r.top && y<r.bottom)return toOrdinal(el.dataset.date!);
      } return null;
    },
    navigate:(x,y,time)=>{
      const hit=document.elementFromPoint(x,y)?.closest<HTMLButtonElement>("[data-drag-month]");
      const direction=hit && root.current?.contains(hit) && !hit.disabled ? Number(hit.dataset.dragMonth) : 0;
      if(!direction){hover.current=null;return}
      if(hover.current?.direction!==direction){hover.current={direction,since:time};return}
      if(time-hover.current.since>=650){const m=shiftMonth(selectedMonth,direction as -1|1);if(m)onMonth?.(m,true);hover.current={direction,since:time}}
    },reset:()=>{hover.current=null},
  });
  const now = new Date(), today = `${String(now.getFullYear()).padStart(4,"0")}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const bounds = monthBounds(selectedMonth);
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
  const previewSegments = useMemo(() => drag.preview ? calendarPreviewSegments(drag.preview,selectedMonth) : [],
    [drag.preview?.startDate,drag.preview?.endDate,selectedMonth]);
  const previewItem = drag.preview ? scheduleMap.get(drag.preview.id) : undefined;
  const hiddenCounts = useMemo(() => weeks.map(hiddenCountsForWeek), [weeks]);
  const daySchedules = useMemo(
    () => day ? schedulesOnDate(snapshot, day) : [],
    [snapshot, day],
  );
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
      if (button && !button.closest("[inert],[hidden]")) button.focus();
      else document.getElementById("editor-name")?.focus();
    });
  };
  return (
    <section ref={root} onClickCapture={e=>{if(drag.consumeClick()){e.preventDefault();e.stopPropagation()}}} className="calendar"
      onPointerMove={e => {
        const week = (e.target as HTMLElement).closest(".calendar-week");
        const cells = week?.querySelectorAll<HTMLElement>("[data-date]");
        const cell = cells && Array.from(cells).find(el => {
          const bounds = el.getBoundingClientRect();
          return e.clientX >= bounds.left && e.clientX < bounds.right;
        });
        setHoveredDate(cell?.dataset.date ?? null);
      }}
      onPointerLeave={() => setHoveredDate(null)}
      aria-label="월간 달력" hidden={!active}>
      {drag.preview && <div className="drag-preview" role="status">{drag.preview.startDate} — {drag.preview.endDate} · {drag.preview.valid ? "놓아서 저장" : "영역 밖 · 놓으면 취소"} · Esc 취소</div>}
      {drag.preview && <CalendarDragLabel preview={drag.preview}/> }
      <div inert={!!day} aria-hidden={!!day}>
        <div className="calendar-top">
        <div className="view-heading">
          <h2>{bounds.start.slice(0, 7)} 월간 달력</h2>
          <span>월요일 시작 · 최대 3줄</span>
          <div className="drag-month-navigation">
            <IconButton icon="left" label="달력 이전 달" data-drag-month="-1" disabled={!shiftMonth(selectedMonth,-1)} onClick={()=>onMonth?.(shiftMonth(selectedMonth,-1)!)}/>
            <IconButton icon="right" label="달력 다음 달" data-drag-month="1" disabled={!shiftMonth(selectedMonth,1)} onClick={()=>onMonth?.(shiftMonth(selectedMonth,1)!)}/>
          </div>
        </div>
        <div className="weekdays">
          {["월", "화", "수", "목", "금", "토", "일"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        </div>
        {grid.weeks.map((week, wi) => (
          <div className="calendar-week" key={wi}>
            <div className="calendar-dates">
              {week.map((date, c) => {
                const inMonth =
                  date && date >= bounds.start && date <= bounds.end;
                return (
                  <button
                    type="button"
                    disabled={disabled || !date}
                    aria-label={date ? `${date} 일정 추가` : "날짜 없음"}
                    aria-pressed={date === selectedDate}
                    aria-current={date === today ? "date" : undefined}
                    onClick={() => date && onAddDate?.(date)}
                    data-date={date ?? undefined}
                    className={(inMonth ? "month-date" : "adjacent-date") + (date && date === hoveredDate ? " date-hovered" : "")}
                    key={c}
                  >
                    <time dateTime={date ?? undefined}>
                      {date ? Number(date.slice(8)) : ""}
                    </time>
                  </button>
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
                      className={"calendar-bar" + (drag.preview?.id === s.scheduleId ? " drag-origin" : "")}
                      disabled={disabled}
                      style={{
                        gridColumn: `${s.column + 1} / span ${s.span}`,
                        gridRow: s.lane + 1,
                        backgroundColor: `color-mix(in srgb, ${p.color} 16%, var(--surface))`,
                        borderLeftColor: p.color,
                        color: "var(--text)",
                      }}
                      aria-label={scheduleDescription(item, p)}
                      onPointerDown={e=>drag.begin(e,item)}
                      onClick={() => onEditSchedule(item)}
                    >
                      {!s.continuesLeft && <span className="resize-handle start" data-resize="start" aria-hidden="true" onPointerDown={e=>drag.begin(e,item,"start")}/>}
                      {s.continuesLeft && <span aria-hidden="true">‹ </span>}
                      {index.scheduleLabel(item)}
                      {s.continuesRight && <span aria-hidden="true"> ›</span>}
                      {!s.continuesRight && <span className="resize-handle end" data-resize="end" aria-hidden="true" onPointerDown={e=>drag.begin(e,item,"end")}/>}
                    </button>
                  );
                })}
            </div>
            {drag.preview && previewItem && <CalendarDragPreview
              preview={drag.preview} segment={previewSegments.find(s=>s.weekStart===week.find(Boolean))}
              label={index.scheduleLabel(previewItem)} color={projectMap.get(previewItem.projectId)!.color}/>} 
            <div className="calendar-more">
              {week.map((date, c) => {
                const count =
                  date && date >= bounds.start && date <= bounds.end
                    ? hiddenCounts[wi][c]
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
          schedules={daySchedules}
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
