import {
  useMemo,
  useId,
  useEffect,
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
import { fromOrdinal, inclusiveDays, toOrdinal, monthBounds } from "../../domain/date";
import {
  ganttRange,
  ganttRect,
  monthOffset,
} from "../../visualization/gantt";
import { viewportWindow, visibleRows } from "../../visualization/viewport";
import {
  indexSnapshot,
  scheduleDescription,
} from "../../visualization/presentation";
import { isWeekend } from "../../visualization/weekends";
import { GanttNavigation } from "./GanttNavigation";
export interface GanttHandle {
  focusItem(key: string): boolean;
}
import { useGanttNavigation } from "../state/useGanttNavigation";
import { useScheduleDrag, type DragActions } from "../state/useScheduleDrag";
export interface GanttProps extends DragActions {
  selectedDate?: string;
  dayWidth?: number;
  onDayWidth?: (width:number) => void;
  onAddDate?: (date: string, projectId?: string) => void;
  collapsed?: string[];
  onToggleProject?: (id:string) => void;
  todayRequest?: {date:string;token:number} | null;
  snapshot: TimelineSnapshot;
  selectedMonth: YearMonth;
  onEditProject: (p: Project) => void;
  onEditSchedule: (s: Schedule) => void;
  onAddSchedule: (p: Project) => void;
  disabled?: boolean;
  active?: boolean;
  ref?: Ref<GanttHandle>;
}
const EXPANDED: string[] = [];
type Row = {
  key: string;
  project: Project;
  schedule?: Schedule;
  label: string;
  height: number;
};
export function GanttView({
  snapshot,
  onAddDate, collapsed = EXPANDED, onToggleProject, todayRequest,
  onDragStart, onDragCommit, onDragEnd,
  selectedMonth, selectedDate, dayWidth: P = 28, onDayWidth,
  onEditProject,
  onEditSchedule,
  onAddSchedule,
  disabled = false,
  active = true,
  ref,
}: GanttProps) {
  const root = useRef<HTMLElement>(null);
  const bodyId = useId();
  const now = new Date();
  const today = `${String(now.getFullYear()).padStart(4, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const todayOrdinal = toOrdinal(today), selectedOrdinal = selectedDate ? toOrdinal(selectedDate) : null;
  const [hoveredDate, setHoveredDate] = useState<number | null>(null);
  const [extension,setExtension] = useState<{start:number;end:number}|null>(null);
  const selectedBounds = monthBounds(selectedMonth);
  const [visited, setVisited] = useState(selectedBounds);
  const visitedStart = visited.start < selectedBounds.start ? visited.start : selectedBounds.start,
    visitedEnd = visited.end > selectedBounds.end ? visited.end : selectedBounds.end;
  useEffect(() => { setVisited(v => v.start === visitedStart && v.end === visitedEnd ? v : {start:visitedStart,end:visitedEnd}); }, [visitedStart,visitedEnd]);
  const range = useMemo(() => {
    const original = ganttRange(snapshot, selectedMonth);
    const lo = Math.min(toOrdinal(original.start),toOrdinal(visitedStart),extension?.start ?? Infinity),
      hi = Math.max(toOrdinal(original.end),toOrdinal(visitedEnd),extension?.end ?? 0);
    return {start:fromOrdinal(lo),end:fromOrdinal(hi)};
  }, [snapshot,selectedMonth,visitedStart,visitedEnd,extension]),
    index = useMemo(() => indexSnapshot(snapshot), [snapshot]);
  const rows = useMemo(
    () =>
      index.projects.flatMap((p) => [
        {
          key: `project:${p.id}`,
          project: p,
          label: index.projectLabel(p),
          height: 44,
        } as Row,
        ...(collapsed.includes(p.id) ? [] : index.byProject.get(p.id) ?? []).map((s) => ({
          key: `schedule:${s.id}`,
          project: p,
          schedule: s,
          label: index.scheduleLabel(s),
          height: 40,
        })),
      ]),
    [index, collapsed],
  );
  const prefix = useMemo(() => {
    const a = [0];
    for (const r of rows) a.push(a.at(-1)! + r.height);
    return a;
  }, [rows]);
  const scroller = useRef<HTMLDivElement>(null),
    dateArea = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1000, height: 440, gutter: 0 }),
    [offset, setOffset] = useState(0),
    [top, setTop] = useState(0),
    [focused, setFocused] = useState<string | null>(null);
  const start = toOrdinal(range.start),
    days = inclusiveDays(range.start, range.end),
    min = 0,
    // Trailing viewport space lets every real date align left, including 9999-12-31.
    max = Math.max(0, (days - 1) * P);
  const x = Math.min(max, Math.max(min, offset));
  useEffect(() => { setHoveredDate(null); }, [x, start, active]);
  useEffect(() => {
    const main = root.current?.closest("main");
    const clear = (event: Event) => {
      if (event.target === main || event.target === scroller.current) setHoveredDate(null);
    };
    // Includes scrolling the virtual rows or the surrounding workspace.
    main?.addEventListener("scroll", clear, true);
    return () => main?.removeEventListener("scroll", clear, true);
  }, []);
  const previous = useRef<{
    start: number;
    x: number;
    rows: Row[];
    prefix: number[];
    top: number;
  } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const w = dateArea.current?.clientWidth,
        h = scroller.current?.clientHeight,
        gutter = scroller.current ? scroller.current.offsetWidth-scroller.current.clientWidth : 0;
      if (w && h)
        setSize((v) =>
          v.width === w && v.height === h && v.gutter === gutter ? v : { width: w, height: h, gutter },
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
    if (!old)
      next = (toOrdinal(selectedDate ?? selectedBounds.start) - start) * P;
    else if (old.start !== start)
      next = Math.min(max, Math.max(min, (old.start - start) * P + old.x));
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
    previous.current = { start, x: next, rows, prefix, top };
  }, [
    start,
    P,
    rows,
    prefix,
    size.width,
    size.height,
    offset,
    x,
    max,
    min,
    top,
  ]);
  const appliedToday = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (todayRequest && active && appliedToday.current !== todayRequest.token) {
      appliedToday.current = todayRequest.token;
      setOffset(Math.max(min, Math.min(max, (toOrdinal(todayRequest.date)-start)*P)));
    }
  }, [todayRequest, active, start, min, max, size.width, P]);
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
  const move = (n: number, width = P) => {
    const next = Math.min((days - 1) * width, Math.max(min, n)),
      activeElement = document.activeElement as HTMLElement | null;
    if (activeElement?.dataset.bar) {
      const row = rows.find(
        (r) => r.schedule?.id === activeElement.dataset.bar,
      );
      if (row?.schedule) {
        const rect = ganttRect(row.schedule, range, width);
        if (rect.x + rect.width <= next || rect.x >= next + size.width) {
          scroller.current
            ?.querySelector<HTMLElement>(`[data-focus="${row.key}"]`)
            ?.focus({ preventScroll: true });
        }
      }
    }
    setOffset(next);
  };
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
      move(e.key === "Home" ? min : max);
    }
  };
  const drag = useScheduleDrag({
    enabled:active && !disabled, onDragStart, onDragCommit, onDragEnd,
    reset:()=>setExtension(null),
    dateAt:(clientX,clientY)=>{
      const area=dateArea.current?.getBoundingClientRect(), body=scroller.current?.getBoundingClientRect();
      if(!area || !body || clientX<area.left || clientX>=area.right || clientY<area.top || clientY>=body.bottom) return null;
      const ordinal=start+Math.floor((clientX-area.left+x)/P);
      return ordinal >= start && ordinal < start+days ? ordinal : null;
    },
    navigate:(clientX,clientY)=>{
      const area=dateArea.current?.getBoundingClientRect(), body=scroller.current?.getBoundingClientRect();
      if(!area || !body || clientY<area.top || clientY>body.bottom || clientX<area.left || clientX>area.right) return;
      const direction=clientX<area.left+32 ? -1 : clientX>area.right-32 ? 1 : 0;
      if(!direction)return;
      if(direction<0 && x<=min+P && start>1) {
        const next=Math.max(1,start-31);
        setExtension(v=>({start:next,end:v?.end ?? start+days-1}));
      } else if(direction>0 && x>=max-P && start+days-1<3652059) {
        setExtension(v=>({start:v?.start ?? start,end:Math.min(3652059,start+days-1+31)}));
      } else move(x+direction*P);
    },
  });
  const navigation = useGanttNavigation({root,dateArea,active,offset:x,dayWidth:P,days,viewport:size.width,
    move, onDayWidth, isScheduleDragging:drag.isActive});
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
    nonworking: isWeekend(start + i + first),
  }));
  const nonworkingColumns = dates.filter(d => d.nonworking && (d.i+1)*P>x && d.i*P<x+size.width).map(d =>
    <span key={d.date} aria-hidden="true" data-nonworking={d.date} className="date-highlight nonworking" style={{left:d.i*P-x,width:P}} />);
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
  const outside = monthOffset(selectedMonth, range, size.width, P).outside;
  return (
    <section ref={root} onClickCapture={e=>{if(drag.consumeClick() || navigation.consumeClick()){e.preventDefault();e.stopPropagation()}}} className={"gantt"+(navigation.panning ? " is-panning" : "")}
      onPointerMove={e => {
        const target = (e.target as HTMLElement).closest(".gantt-track, .day-tick");
        const area = dateArea.current?.getBoundingClientRect();
        const ordinal = target && area ? start + Math.floor((e.clientX - area.left + x) / P) : null;
        setHoveredDate(ordinal !== null && ordinal >= start && ordinal < start + days ? ordinal : null);
      }}
      onPointerLeave={() => setHoveredDate(null)}
      aria-label="간트" hidden={!active}>
      {drag.preview && <div className="drag-preview" role="status">{drag.preview.startDate} — {drag.preview.endDate} · 놓아서 저장 · Esc 취소</div>}
      <div className="view-heading">
        <div>
          <h2>전체 일정</h2>
          <p data-range>
            {range.start} — {range.end}
          </p>
        </div>

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
      <div className="gantt-heading" style={{paddingRight:size.gutter}}>
        <div className="gantt-name-heading">프로젝트 / 일정</div>
        <div className="gantt-date-heading" ref={dateArea}>
          {months
            .filter((m) => m.left < size.width && m.left + m.width > 0)
            .map((m) => (
              <span
                className="month-tick"
                key={m.label}
                style={{
                  left: Math.max(0, m.left),
                  width:
                    Math.min(size.width, m.left + m.width) -
                    Math.max(0, m.left),
                }}
              >
                {m.label}
              </span>
            ))}
          {dates.map((d) => (
            <button
              disabled={disabled}
              tabIndex={d.i*P-x >= 0 && (d.i+1)*P-x <= size.width ? 0 : -1}
              aria-label={`${d.date} 일정 추가`}
              onClick={() => onAddDate?.(d.date)}
              aria-pressed={d.date === selectedDate}
              aria-current={d.date === today ? "date" : undefined}
              className={"day-tick" + (d.nonworking ? " nonworking-day" : "") + (hoveredDate === start + d.i ? " date-hovered" : "")}
              data-day={d.date}
              data-focus={`date:${d.date}`}
              key={d.date}
              style={{ left: d.i * P - x, width: P }}
            >
              {Number(d.date.slice(8))}
            </button>
          ))}
        </div>
      </div>
      <div
        id={bodyId}
        className={"gantt-body" + (!rows.length ? " is-empty" : "")}
        ref={scroller}
        onScroll={(e) => setTop(e.currentTarget.scrollTop)}
      >
        {!rows.length && <div className="empty"><h3>프로젝트를 추가해 일정을 관리하세요</h3></div>}
        <div className="gantt-spacer" style={{ height: Math.max(size.height, prefix.at(-1)!) }}>
          <div className="gantt-tail" aria-hidden="true" style={{top:prefix.at(-1),height:Math.max(0,size.height-prefix.at(-1)!),width:size.width}}>{nonworkingColumns}</div>
          {[...visible]
            .sort((a, b) => a - b)
            .map((i) => {
              const r = rows[i],
                s = r.schedule,
                shown = s && drag.preview?.id === s.id ? {...s,...drag.preview} : s,
                rect = shown ? ganttRect(shown, range, P) : null;
              const left = rect ? Math.max(rect.x, x) : 0,
                right = rect
                  ? Math.min(rect.x + rect.width, x + size.width)
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
                    {!s && <button className="collapse-project" aria-label={`${r.label} ${collapsed.includes(r.project.id) ? "펼치기" : "접기"}`}
                      aria-expanded={!collapsed.includes(r.project.id)} onClick={() => onToggleProject?.(r.project.id)}>{collapsed.includes(r.project.id) ? "▸" : "▾"}</button>}
                    <span
                      className="color-dot"
                      style={{ backgroundColor: r.project.color }}
                    />
                    <div>
                      <button
                        className="text-button"
                        data-focus={r.key}
                        disabled={disabled}
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
                      {s ? <small>{s.startDate} — {s.endDate}</small> : (
                        <small className="project-meta">

                          {r.project.sharing&&<span>{r.project.sharing==='member'?'공유 · 조회 전용':'공유'}</span>}
                          {!index.byProject.get(r.project.id)?.length && <span className="empty-row">일정 없음</span>}
                        </small>
                      )}
                    </div>
                    {!s && (
                      <button
                        className="row-add"
                        data-focus={`add:${r.project.id}`}
                        aria-label="일정 추가"
                        disabled={disabled||r.project.sharing==='member'}
                        onClick={() => onAddSchedule(r.project)}
                      >
                        +
                      </button>
                    )}
                  </div>
                  <div
                    className="gantt-track"
                    onClick={e => {
                      if (disabled || (e.target as HTMLElement).closest("button")) return;
                      const ordinal=start+Math.floor((e.clientX-e.currentTarget.getBoundingClientRect().left+x)/P);
                      if (ordinal >= start && ordinal < start+days) onAddDate?.(fromOrdinal(ordinal), r.project.id);
                    }}
                    style={{ backgroundPositionX: -x % P, backgroundSize: `${P}px 100%` }}
                  >
                    {nonworkingColumns}
                    {todayOrdinal >= start && todayOrdinal < start + days && (todayOrdinal-start+1)*P > x && (todayOrdinal-start)*P < x+size.width && (
                      <span aria-hidden="true" className="date-highlight today" style={{ left: (todayOrdinal - start) * P - x, width: P }} />
                    )}
                    {selectedOrdinal !== null && (selectedOrdinal-start+1)*P > x && (selectedOrdinal-start)*P < x+size.width && <span aria-hidden="true" className="date-highlight selected" style={{left:(selectedOrdinal-start)*P-x,width:P}} />}
                    {hoveredDate !== null && (
                      <span aria-hidden="true" className="date-highlight hovered" style={{ left: (hoveredDate - start) * P - x, width: P }} />
                    )}
                    {s && right > left && (
                      <button
                        data-bar={s.id}
                        data-logical-x={rect!.x}
                        data-days={rect!.width / P}
                        className="gantt-bar"
                        disabled={disabled}
                        aria-label={scheduleDescription(s, r.project)}
                        onPointerDown={e=>drag.begin(e,s)}
                        onClick={() => onEditSchedule(s)}
                        style={{
                          left: left - x,
                          width: right - left,
                          backgroundColor: `color-mix(in srgb, ${r.project.color} var(--schedule-tint, 50%), transparent)`,
                          borderLeftColor: r.project.color,
                          color: "var(--text)",
                        }}
                      >
                        {left === rect!.x && <span className="resize-handle start" data-resize="start" aria-hidden="true" onPointerDown={e=>drag.begin(e,s,"start")}/>}
                        {r.label}
                        {right === rect!.x+rect!.width && <span className="resize-handle end" data-resize="end" aria-hidden="true" onPointerDown={e=>drag.begin(e,s,"end")}/>}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
      <GanttNavigation bodyId={bodyId} offset={x} min={min} max={max} viewport={size.width} dayWidth={P}
        zoomDisabled={!onDayWidth || navigation.panning || !!drag.preview}
        onMove={move} onHorizontalKey={keyboard}
        onZoom={width => {if(drag.isActive() || navigation.panning || !onDayWidth)return;move(x/P*width,width);onDayWidth(width)}}
        rangeText={`${fromOrdinal(Math.min(start + days - 1, Math.max(start, start + Math.floor(x / P))))} — ${fromOrdinal(Math.max(start, Math.min(start + days - 1, start + Math.floor((x + size.width - 1) / P))))}`}/>
    </section>
  );
}
