import {
  useMemo,
  useState,
  useRef,
  useLayoutEffect,
  useImperativeHandle,
  type Ref,
} from "react";
import type {
  Project,
  Schedule,
  TimelineSnapshot,
  YearMonth,
} from "../../shared/types";
import { fromOrdinal, inclusiveDays, toOrdinal } from "../../domain/date";
import {
  ganttRange,
  ganttRect,
  monthOffset,
  DAY_WIDTH as P,
} from "../../visualization/gantt";
import { viewportWindow, visibleRows } from "../../visualization/viewport";
import {
  indexSnapshot,
  colorText,
  scheduleDescription,
} from "../../visualization/presentation";
export interface GanttHandle {
  focusItem(key: string): boolean;
}
export interface GanttProps {
  snapshot: TimelineSnapshot;
  selectedMonth: YearMonth;
  onEditProject: (p: Project) => void;
  onEditSchedule: (s: Schedule) => void;
  onAddSchedule: (p: Project) => void;
  disabled?: boolean;
  active?: boolean;
  ref?: Ref<GanttHandle>;
}
type Row = {
  key: string;
  project: Project;
  schedule?: Schedule;
  label: string;
  height: number;
};
export function GanttView({
  snapshot,
  selectedMonth,
  onEditProject,
  onEditSchedule,
  onAddSchedule,
  disabled = false,
  active = true,
  ref,
}: GanttProps) {
  const range = useMemo(
      () => ganttRange(snapshot, selectedMonth),
      [snapshot, selectedMonth],
    ),
    index = useMemo(() => indexSnapshot(snapshot), [snapshot]);
  const rows = useMemo(
    () =>
      index.projects.flatMap((p) => [
        {
          key: `project:${p.id}`,
          project: p,
          label: index.projectLabel(p),
          height: 56,
        } as Row,
        ...(index.byProject.get(p.id) ?? []).map((s) => ({
          key: `schedule:${s.id}`,
          project: p,
          schedule: s,
          label: index.scheduleLabel(s),
          height: 44,
        })),
      ]),
    [index],
  );
  const prefix = useMemo(() => {
    const a = [0];
    for (const r of rows) a.push(a.at(-1)! + r.height);
    return a;
  }, [rows]);
  const scroller = useRef<HTMLDivElement>(null),
    dateArea = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1000, height: 440 }),
    [offset, setOffset] = useState(0),
    [top, setTop] = useState(0),
    [focused, setFocused] = useState<string | null>(null);
  const start = toOrdinal(range.start),
    days = inclusiveDays(range.start, range.end),
    max = Math.max(0, days * P - size.width);
  const x = Math.min(max, Math.max(0, offset)),
    monthKey = `${selectedMonth.year}-${selectedMonth.month}`;
  const previous = useRef<{
    start: number;
    x: number;
    monthKey: string;
    rows: Row[];
    prefix: number[];
    top: number;
  } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const w = dateArea.current?.clientWidth,
        h = scroller.current?.clientHeight;
      if (w && h)
        setSize((v) =>
          v.width === w && v.height === h ? v : { width: w, height: h },
        );
    };
    measure();
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : null;
    if (dateArea.current) observer?.observe(dateArea.current);
    if (scroller.current) observer?.observe(scroller.current);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  useLayoutEffect(() => {
    const old = previous.current;
    let next = x;
    if (!old || old.monthKey !== monthKey)
      next = monthOffset(selectedMonth, range, size.width).offset;
    else if (old.start !== start)
      next = Math.min(max, Math.max(0, (old.start - start) * P + old.x));
    if (next !== offset) setOffset(next);
    if (old && old.rows !== rows && scroller.current) {
      const oldIndex = visibleRows(old.prefix, old.top, 1, 0).first,
        anchor = old.rows[oldIndex];
      let target = rows.findIndex((r) => r.key === anchor?.key);
      if (target < 0) {
        const remaining = new Set(rows.map((r) => r.key));
        let replacement: Row | undefined;
        for (let i = oldIndex + 1; i < old.rows.length; i++)
          if (remaining.has(old.rows[i].key)) {
            replacement = old.rows[i];
            break;
          }
        if (!replacement)
          for (let i = oldIndex - 1; i >= 0; i--)
            if (remaining.has(old.rows[i].key)) {
              replacement = old.rows[i];
              break;
            }
        target = replacement
          ? rows.findIndex((r) => r.key === replacement!.key)
          : 0;
      }
      const t = Math.min(
        Math.max(0, prefix.at(-1)! - size.height),
        Math.max(
          0,
          (prefix[target] ?? 0) + (old.top - (old.prefix[oldIndex] ?? 0)),
        ),
      );
      scroller.current.scrollTop = t;
      setTop(t);
    }
    previous.current = { start, x: next, monthKey, rows, prefix, top };
  }, [
    start,
    monthKey,
    rows,
    prefix,
    size.width,
    size.height,
    offset,
    x,
    max,
    top,
  ]);
  const reveal = (key: string) => {
    const i = rows.findIndex((r) => r.key === key);
    if (i < 0) return false;
    const scroll = scroller.current!,
      t = Math.max(0, Math.min(prefix[i], prefix.at(-1)! - size.height));
    scroll.scrollTop = t;
    setTop(t);
    setFocused(key);
    requestAnimationFrame(() =>
      scroll.querySelector<HTMLElement>(`[data-focus="${key}"]`)?.focus(),
    );
    return true;
  };
  useImperativeHandle(ref, () => ({ focusItem: reveal }), [
    rows,
    prefix,
    size.height,
  ]);
  const move = (n: number) => setOffset(Math.min(max, Math.max(0, n)));
  const keyboard = (e: React.KeyboardEvent) => {
    const shifts: Record<string, number> = {
      ArrowLeft: -P,
      ArrowRight: P,
      PageUp: -size.width,
      PageDown: size.width,
    };
    if (e.key in shifts) {
      e.preventDefault();
      move(x + shifts[e.key]);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      move(e.key === "Home" ? 0 : max);
    }
  };
  const w = viewportWindow({
      logicalOffset: x,
      viewportSize: size.width,
      unitSize: P,
      overscan: 31,
    }),
    first = Math.min(days, w.first),
    last = Math.min(days, w.lastExclusive);
  const dates = Array.from({ length: last - first }, (_, i) => ({
    i: i + first,
    date: fromOrdinal(start + i + first),
  }));
  const months: { label: string; left: number; width: number }[] = [];
  for (const d of dates) {
    const label = d.date.slice(0, 7),
      prev = months.at(-1);
    if (prev?.label === label) prev.width += P;
    else months.push({ label, left: d.i * P - x, width: P });
  }
  const rw = visibleRows(prefix, top, size.height, 3),
    visible = new Set(
      Array.from(
        { length: Math.max(0, rw.lastExclusive - rw.first) },
        (_, i) => i + rw.first,
      ),
    );
  const focusIndex = rows.findIndex((r) => r.key === focused);
  if (focusIndex >= 0) visible.add(focusIndex);
  const outside = monthOffset(selectedMonth, range, size.width).outside;
  return (
    <section className="gantt" aria-label="간트" hidden={!active}>
      <div className="view-heading">
        <div>
          <h2>전체 일정</h2>
          <p data-range>
            {range.start} — {range.end}
          </p>
        </div>
        <button
          onClick={() =>
            move(monthOffset(selectedMonth, range, size.width).offset)
          }
        >
          선택 월로 이동
        </button>
      </div>
      {outside && (
        <p className="range-notice" role="status">
          선택 월은 전체 일정 범위 밖입니다
        </p>
      )}
      <p id="gantt-help" className="sr-only">
        가로 이동: 좌우 하루, PageUp/PageDown 한 화면, Home/End 처음과 끝. 이름
        버튼에서 위아래 키로 모든 행 이동.
      </p>
      <div className="gantt-heading">
        <div className="gantt-name-heading">프로젝트 / 일정</div>
        <div className="gantt-date-heading" ref={dateArea}>
          {months.map((m) => (
            <span
              className="month-tick"
              key={m.label}
              style={{ left: m.left, width: m.width }}
            >
              {m.label}
            </span>
          ))}
          {dates.map((d) => (
            <span
              className="day-tick"
              data-day={d.date}
              key={d.date}
              style={{ left: d.i * P - x, width: P }}
            >
              {Number(d.date.slice(8))}
            </span>
          ))}
        </div>
      </div>
      <div
        className="gantt-body"
        ref={scroller}
        onScroll={(e) => setTop(e.currentTarget.scrollTop)}
        onWheel={(e) => {
          if (e.deltaX || e.shiftKey) {
            move(x + (e.deltaX || e.deltaY));
          }
        }}
      >
        <div className="gantt-spacer" style={{ height: prefix.at(-1) }}>
          {[...visible]
            .sort((a, b) => a - b)
            .map((i) => {
              const r = rows[i],
                s = r.schedule,
                rect = s ? ganttRect(s, range) : null;
              const left = rect ? Math.max(rect.x, x - 31 * P) : 0,
                right = rect
                  ? Math.min(rect.x + rect.width, x + size.width + 31 * P)
                  : 0;
              return (
                <div
                  key={r.key}
                  data-row={r.key}
                  onFocus={() => setFocused(r.key)}
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node))
                      setFocused(null);
                  }}
                  role={s ? undefined : "region"}
                  aria-label={s ? undefined : r.label}
                  className={
                    "gantt-row " + (s ? "schedule-row" : "project-row")
                  }
                  style={{ top: prefix[i], height: r.height }}
                >
                  <div className="gantt-name">
                    <span
                      className="color-dot"
                      style={{ backgroundColor: r.project.color }}
                    />
                    <div>
                      <button
                        className="text-button"
                        data-focus={r.key}
                        disabled={disabled}
                        title={
                          s
                            ? scheduleDescription(s, r.project)
                            : `${r.project.name} · #${r.project.id} · ${r.project.participants.join(" · ")}`
                        }
                        aria-label={`${r.label} 편집`}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                            e.preventDefault();
                            const next =
                              rows[
                                Math.min(
                                  rows.length - 1,
                                  Math.max(
                                    0,
                                    i + (e.key === "ArrowDown" ? 1 : -1),
                                  ),
                                )
                              ];
                            reveal(next.key);
                          }
                        }}
                        onClick={() =>
                          s ? onEditSchedule(s) : onEditProject(r.project)
                        }
                      >
                        {r.label}
                      </button>
                      <small>
                        {s
                          ? `${s.startDate} — ${s.endDate}`
                          : r.project.participants.join(" · ") || "참여자 없음"}
                      </small>
                    </div>
                    {!s && (
                      <button
                        className="row-add"
                        data-focus={`add:${r.project.id}`}
                        aria-label="일정 추가"
                        title={`${r.label}에 일정 추가`}
                        disabled={disabled}
                        onClick={() => onAddSchedule(r.project)}
                      >
                        +
                      </button>
                    )}
                  </div>
                  <div
                    className="gantt-track"
                    style={{ backgroundPositionX: -x % P }}
                  >
                    {!s && !index.byProject.get(r.project.id)?.length && (
                      <span className="empty-row">일정 없음</span>
                    )}
                    {s && right > left && (
                      <button
                        data-bar={s.id}
                        data-logical-x={rect!.x}
                        data-days={rect!.width / P}
                        className="gantt-bar"
                        disabled={disabled}
                        aria-label={scheduleDescription(s, r.project)}
                        title={scheduleDescription(s, r.project)}
                        onClick={() => onEditSchedule(s)}
                        style={{
                          left: left - x,
                          width: right - left,
                          backgroundColor: r.project.color,
                          color: colorText(r.project.color),
                        }}
                      >
                        {r.label}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
      {!rows.length && (
        <div className="empty">
          <h3>프로젝트를 추가해 일정을 관리하세요</h3>
        </div>
      )}
      <div className="gantt-navigation" onKeyDown={keyboard}>
        <input
          type="range"
          aria-label="간트 가로 이동"
          aria-describedby="gantt-help"
          min={0}
          max={max}
          step="any"
          value={x}
          onChange={(e) => move(Number(e.target.value))}
          aria-valuetext={`${fromOrdinal(start + Math.floor(x / P))} — ${fromOrdinal(Math.min(start + days - 1, start + Math.floor((x + size.width - 1) / P)))}`}
        />
      </div>
    </section>
  );
}
